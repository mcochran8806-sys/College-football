import { REQUIRED_TEAM_MATCHES } from '../../config';
import type { Game, TeamSide } from '../../shared/types';
import { AMBIGUOUS_TOKENS, MIN_ALIAS_LENGTH, aliasesFor, normalizeText } from './teamAliases';

/**
 * Match a YouTube highlight title to a game on today's slate.
 *
 * The hard requirement from the spec — two team matches before we accept a
 * title — is necessary but not sufficient on its own. Two extra rules do the
 * real work:
 *
 *   1. Longest alias first, with the matched span CONSUMED. Without this,
 *      "Texas A&M vs Texas" double-counts "texas", and "Miami (OH)" satisfies
 *      the Miami (FL) game. Consuming the span means "texas a and m" is taken
 *      off the board before the bare "texas" candidate is considered.
 *
 *   2. Both matches must belong to the SAME game. Two teams from two different
 *      games in one title (a Top-10 roundup, a preview) is not a game
 *      highlight, and pairing them would put the clip on the wrong card.
 *
 * Titles are stripped of the noise words the networks all use differently:
 * "Highlights", "Extended Highlights", "Full Game", years, separators, emoji.
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
  'espn',
  'presented by',
  '\\b(19|20)\\d{2}\\b',
  '\\bvs?\\b',
  '\\bversus\\b',
  '\\bat\\b',
  '\\bfinal\\b',
];

const NOISE_RE = new RegExp(`\\b(?:${NOISE.join('|')})\\b`, 'gi');

/**
 * Titles that are NOT college football, however much they look like it.
 *
 * This is not a nicety — it prevents wrong clips being labelled as your game.
 * These channels post every sport they cover, and the collisions are real:
 *
 *   "Washington vs. Texas | Full Game Highlights | Little League World Series"
 *   "SEC MBB Tourney Championship Texas A&M vs. Alabama | Game Highlights"
 *
 * Both name two FBS schools and say "Highlights". Without this list the wall
 * would show Little League baseball captioned as a college football game.
 * Checked before any team matching happens.
 */
const NOT_CFB = [
  // other sports
  'little league',
  'world series',
  'wbb',
  'mbb',
  'basketball',
  'volleyball',
  'soccer',
  'baseball',
  'softball',
  'lacrosse',
  'hockey',
  'golf',
  'tennis',
  'gymnastics',
  'track and field',
  'swimming',
  'wrestling',
  'rowing',
  'cross country',
  // other leagues
  'nba',
  'wnba',
  'nfl',
  'mlb',
  'nhl',
  'mls',
  'premier league',
  'ufc',
  'nascar',
  'formula 1',
  'liv',
  // adjacent-but-not-a-game
  'fantasy football',
  'mock draft',
  'nfl draft',
  'combine',
];

const NOT_CFB_RE = new RegExp(`\\b(?:${NOT_CFB.join('|')})\\b`, 'i');

/**
 * True when a title is about something other than college football.
 * Runs on the normalized title so punctuation and emoji can't hide a keyword.
 */
export function isNonCfbContent(title: string): boolean {
  return NOT_CFB_RE.test(normalizeText(title));
}

/** Normalize + strip the boilerplate every network writes differently. */
export function normalizeTitle(title: string): string {
  return normalizeText(title).replace(NOISE_RE, ' ').replace(/\s+/g, ' ').trim();
}

interface Candidate {
  gameId: string;
  side: 'home' | 'away';
  alias: string;
}

/** Every spelling we'd accept for one team, longest first. */
function aliasesForTeam(team: TeamSide): string[] {
  const forms = new Set<string>();
  for (const raw of [team.displayName, team.shortDisplayName, team.location, team.name, team.abbreviation]) {
    const n = normalizeText(raw ?? '');
    if (n) forms.add(n);
  }
  if (team.location && team.name) forms.add(normalizeText(`${team.location} ${team.name}`));
  for (const alias of aliasesFor(team.displayName, team.shortDisplayName, team.abbreviation, team.location)) {
    forms.add(alias);
  }

  return [...forms].filter((f) => {
    if (f.length < MIN_ALIAS_LENGTH) return false;
    // A single ambiguous token ("miami", "osu") is never enough on its own.
    // Multi-word aliases containing one are fine: "miami hurricanes" is clear.
    if (!f.includes(' ') && AMBIGUOUS_TOKENS.has(f)) return false;
    return true;
  });
}

/** Word-boundary index of `needle` in `haystack`, skipping consumed spans. */
function findFree(haystack: string, needle: string, consumed: Array<[number, number]>): [number, number] | null {
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

/**
 * Best game match for a title, or null when nothing clears the bar.
 */
export function matchTitleToGame(title: string, games: Game[]): TitleMatch | null {
  // A basketball or Little League title naming two FBS schools must never be
  // matched to a football game.
  if (isNonCfbContent(title)) return null;

  const normalized = normalizeTitle(title);
  if (!normalized) return null;

  // Every (game, side, alias) candidate across the slate, longest alias first.
  const candidates: Candidate[] = [];
  for (const game of games) {
    for (const side of ['home', 'away'] as const) {
      for (const alias of aliasesForTeam(game[side])) {
        candidates.push({ gameId: game.id, side, alias });
      }
    }
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length);

  const consumed: Array<[number, number]> = [];
  // gameId -> which sides matched, and how many characters they accounted for
  const hits = new Map<string, { sides: Set<'home' | 'away'>; strength: number; matched: string[] }>();

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
 * How relevant is this clip to college football at all?
 *
 *   'game'  matched two teams from one of today's games
 *   'team'  names at least one FBS team playing this week
 *   'topic' mentions college football generally (conference, CFB, NCAA)
 *   'none'  unrelated — NBA trades, fantasy advice, Little League
 *
 * The wall uses this to decide what may play as filler between real game
 * highlights. Without it, "Klay Thompson expected to sign with the Heat" is a
 * perfectly valid clip to show on a college football wall.
 */
export type Relevance = 'game' | 'team' | 'topic' | 'none';

const CFB_TOPICS = [
  'college football',
  'cfb',
  'ncaa football',
  'ncaaf',
  'sec',
  'big ten',
  'b1g',
  'big 12',
  'acc',
  'pac 12',
  'mountain west',
  'sun belt',
  'american athletic',
  'conference usa',
  'mac',
  'bowl game',
  'heisman',
  'college gameday',
  'spring game',
  'fall camp',
  'training camp',
  'signing day',
  'recruiting',
  'playoff',
];

const CFB_TOPIC_RE = new RegExp(`\\b(?:${CFB_TOPICS.join('|')})\\b`, 'i');

export function cfbRelevance(title: string, games: Game[]): Relevance {
  if (isNonCfbContent(title)) return 'none';

  if (matchTitleToGame(title, games)) return 'game';

  // Deliberately normalizeText, NOT normalizeTitle. normalizeTitle strips
  // "college football", "cfb" and "ncaaf" as boilerplate — useful when
  // isolating team names, fatal here, because those are exactly the words that
  // prove a clip belongs on this wall.
  const normalized = normalizeText(title);
  if (!normalized) return 'none';

  // One team name is not enough to call it a game, but it is plenty to call it
  // college football — a fall camp piece on Northwestern belongs on this wall.
  for (const game of games) {
    for (const side of ['home', 'away'] as const) {
      const team = game[side];
      for (const form of [team.location, team.displayName, team.shortDisplayName]) {
        const n = normalizeText(form ?? '');
        if (n.length >= MIN_ALIAS_LENGTH && new RegExp(`\\b${escapeRe(n)}\\b`).test(normalized)) {
          return 'team';
        }
      }
    }
  }

  return CFB_TOPIC_RE.test(normalized) ? 'topic' : 'none';
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/**
 * Does this title look like an actual highlight reel, rather than talk?
 *
 * "2026 Northwestern Fall Training Camp: David Braun Enters his Fourth Season"
 * is unambiguously college football and unambiguously not a highlight. The
 * relevance gate can't tell those apart — this can.
 *
 * Negative markers win: "Georgia vs Alabama Press Conference" is not a reel
 * however much it looks like a game title.
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
  'why ',
  'what to know',
  'depth chart',
  'signing',
  'commits',
  'transfer portal',
];

const REEL_RE = new RegExp(`\\b(?:${REEL_MARKERS.join('|')})\\b`, 'i');
const NOT_REEL_RE = new RegExp(`(?:${NOT_A_REEL.join('|')})`, 'i');

export function isHighlightReel(title: string): boolean {
  const normalized = normalizeText(title);
  if (NOT_REEL_RE.test(normalized)) return false;
  return REEL_RE.test(normalized);
}
