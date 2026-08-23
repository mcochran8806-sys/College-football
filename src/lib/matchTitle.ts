import { REQUIRED_TEAM_MATCHES } from '../../config';
import type { LeagueConfig } from '../../shared/leagues/types';
import { escapeRegExp, matchableForms, normalizeText } from '../../shared/teamAliases';
import type { Game } from '../../shared/types';

/**
 * Match a highlight title to a game on today's slate.
 *
 * The hard requirement — two team matches before we accept a title — is
 * necessary but not sufficient. Two extra rules do the real work:
 *
 *   1. Longest alias first, with the matched span CONSUMED. Without this,
 *      "Texas A&M vs Texas" double-counts "texas", and "Miami (OH)" satisfies
 *      the Miami (FL) game.
 *
 *   2. Both matches must belong to the SAME game. Two teams from two different
 *      games in one title (a roundup, a preview) is not a game highlight, and
 *      pairing them would put the clip on the wrong card.
 *
 * Everything here takes a league, because the alias tables, the ambiguous
 * tokens, and the definition of off-topic all differ between college and pro.
 */

const NOISE = [
  'extended highlights',
  'full game highlights',
  'game highlights',
  'full game',
  'full highlights',
  'condensed game',
  'highlights',
  'highlight',
  'recap',
  'week \\d+',
  'college football',
  'ncaa football',
  'ncaaf',
  'cfb',
  'nfl',
  'espn',
  'presented by',
  '\\b(19|20)\\d{2}\\b',
  '\\bvs?\\b',
  '\\bversus\\b',
  '\\bat\\b',
  '\\bfinal\\b',
];

const NOISE_RE = new RegExp(`\\b(?:${NOISE.join('|')})\\b`, 'gi');

/** Normalize + strip the boilerplate every network writes differently. */
export function normalizeTitle(title: string): string {
  return normalizeText(title).replace(NOISE_RE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * True when a title is about something other than this league.
 *
 * This is not a nicety — it prevents wrong clips being labelled as your game.
 * These channels post every sport they cover, and the collisions are real:
 *
 *   "Washington vs. Texas | Full Game Highlights | Little League World Series"
 *   "SEC MBB Tourney Championship Texas A&M vs. Alabama | Game Highlights"
 *
 * Both name two FBS schools and say "Highlights". For the NFL the same trap is
 * college content, since ESPN and CBS cover both.
 */
export function isOffTopic(title: string, league: LeagueConfig): boolean {
  const normalized = normalizeText(title);
  return league.offTopic.some((kw) =>
    new RegExp(`\\b${escapeRegExp(normalizeText(kw))}\\b`).test(normalized),
  );
}

interface Candidate {
  gameId: string;
  side: 'home' | 'away';
  alias: string;
}

/** Word-boundary index of `needle` in `haystack`, skipping consumed spans. */
function findFree(
  haystack: string,
  needle: string,
  consumed: Array<[number, number]>,
): [number, number] | null {
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return null;

    const end = idx + needle.length;
    const beforeOk = idx === 0 || haystack[idx - 1] === ' ';
    const afterOk = end === haystack.length || haystack[end] === ' ';
    const overlaps = consumed.some(([s, e]) => idx < e && end > s);

    if (beforeOk && afterOk && !overlaps) return [idx, end];
    from = idx + 1;
  }
}

export interface TitleMatch {
  game: Game;
  /** Total characters of title matched — used to break ties between games. */
  strength: number;
  matched: string[];
}

export function matchTitleToGame(
  title: string,
  games: Game[],
  league: LeagueConfig,
): TitleMatch | null {
  // A basketball or college title naming two pro cities must never be matched
  // to a football game.
  if (isOffTopic(title, league)) return null;

  const normalized = normalizeTitle(title);
  if (!normalized) return null;

  const candidates: Candidate[] = [];
  for (const game of games) {
    for (const side of ['home', 'away'] as const) {
      for (const alias of matchableForms(league, game[side])) {
        candidates.push({ gameId: game.id, side, alias });
      }
    }
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length);

  const consumed: Array<[number, number]> = [];
  const hits = new Map<
    string,
    { sides: Set<'home' | 'away'>; strength: number; matched: string[] }
  >();

  for (const candidate of candidates) {
    const entry = hits.get(candidate.gameId);
    // One match per side is all we need; don't let a second alias for the same
    // team consume title text a different game might legitimately need.
    if (entry?.sides.has(candidate.side)) continue;

    const span = findFree(normalized, candidate.alias, consumed);
    if (!span) continue;

    consumed.push(span);
    const next = entry ?? { sides: new Set<'home' | 'away'>(), strength: 0, matched: [] };
    next.sides.add(candidate.side);
    next.strength += candidate.alias.length;
    next.matched.push(candidate.alias);
    hits.set(candidate.gameId, next);
  }

  let best: TitleMatch | null = null;
  for (const [gameId, entry] of hits) {
    if (entry.sides.size < REQUIRED_TEAM_MATCHES) continue;
    const game = games.find((g) => g.id === gameId);
    if (!game) continue;
    if (!best || entry.strength > best.strength) {
      best = { game, strength: entry.strength, matched: entry.matched };
    }
  }

  return best;
}

/**
 * How relevant is this clip to the league at all?
 *
 *   'game'  matched two teams from one of today's games
 *   'team'  names at least one team playing this week
 *   'topic' mentions the league generally
 *   'none'  unrelated — rejected
 */
export type Relevance = 'game' | 'team' | 'topic' | 'none';

export function relevanceFor(title: string, games: Game[], league: LeagueConfig): Relevance {
  if (isOffTopic(title, league)) return 'none';
  if (matchTitleToGame(title, games, league)) return 'game';

  // Deliberately normalizeText, NOT normalizeTitle. normalizeTitle strips
  // "college football", "cfb", "nfl" and "ncaaf" as boilerplate — useful when
  // isolating team names, fatal here, because those are exactly the words that
  // prove a clip belongs on this wall.
  const normalized = normalizeText(title);
  if (!normalized) return 'none';

  for (const game of games) {
    for (const side of ['home', 'away'] as const) {
      for (const form of matchableForms(league, game[side])) {
        if (new RegExp(`\\b${escapeRegExp(form)}\\b`).test(normalized)) return 'team';
      }
    }
  }

  const topicHit = league.topics.some((kw) =>
    new RegExp(`\\b${escapeRegExp(normalizeText(kw))}\\b`).test(normalized),
  );
  return topicHit ? 'topic' : 'none';
}

/**
 * Does this title look like an actual highlight reel, rather than talk?
 *
 * "2026 Northwestern Fall Training Camp: David Braun Enters his Fourth Season"
 * is unambiguously football and unambiguously not a highlight. The relevance
 * gate can't tell those apart — this can. Negative markers win, so "Press
 * Conference Highlights" is not a reel.
 */
const REEL_MARKERS = [
  'highlights',
  'highlight',
  'top plays',
  'best plays',
  'best of',
  'condensed game',
  'condensed',
  'full game',
  'game recap',
  'every touchdown',
  'all touchdowns',
  'top 10 plays',
  'top ten plays',
  'instant classic',
  'final drive',
  'game winner',
  'walk off',
  'mic d up',
];

const NOT_A_REEL = [
  'press conference',
  'interview',
  'training camp',
  'fall camp',
  'spring camp',
  'media day',
  'media days',
  'podcast',
  'preview',
  'predictions',
  'preseason',
  'analysis',
  'breakdown',
  'roundtable',
  'mailbag',
  'first take',
  'get up',
  'mcafee',
  'gameday',
  'hour 1',
  'hour 2',
  'hour 3',
  'hour 4',
  'storylines',
  'what to know',
  'depth chart',
  'signing',
  'commits',
  'transfer portal',
  'free agency',
  'contract',
  'injury report',
];

const REEL_RE = new RegExp(`\\b(?:${REEL_MARKERS.join('|')})\\b`, 'i');
const NOT_REEL_RE = new RegExp(`(?:${NOT_A_REEL.join('|')})`, 'i');

export function isHighlightReel(title: string): boolean {
  const normalized = normalizeText(title);
  if (NOT_REEL_RE.test(normalized)) return false;
  return REEL_RE.test(normalized);
}
