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
