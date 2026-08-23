/**
 * League-aware alias lookup.
 *
 * The tables themselves live in shared/leagues/{cfb,nfl}.ts, because what
 * counts as an alias — and what counts as dangerously ambiguous — is entirely
 * league-specific. College's trap is "Miami" (two schools). The NFL's is
 * "New York" and "Los Angeles" (two franchises each).
 */

import type { LeagueConfig } from './leagues/types.js';
import { MIN_ALIAS_LENGTH, normalizeText } from './text.js';

export { MIN_ALIAS_LENGTH, normalizeText, escapeRegExp } from './text.js';
export type { AliasEntry, LeagueConfig, LeagueId } from './leagues/types.js';

/** Tokens that resolve to more than one team in this league. */
export function ambiguousTokens(league: LeagueConfig): Set<string> {
  return new Set(league.ambiguousTokens.map(normalizeText));
}

/**
 * Extra spellings for a team, looked up by any of its ESPN names.
 * Returns [] when the team isn't in the table — most aren't, and don't need to
 * be, because ESPN's own names match fine.
 */
export function aliasesFor(
  league: LeagueConfig,
  ...espnNames: (string | null | undefined)[]
): string[] {
  const wanted = espnNames
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
    .map((n) => normalizeText(n));

  const out = new Set<string>();
  for (const entry of league.aliases) {
    const canonical = normalizeText(entry.canonical);
    const forms = [canonical, ...entry.aliases.map(normalizeText)];
    if (wanted.some((w) => forms.includes(w))) {
      for (const form of forms) out.add(form);
    }
  }
  return [...out];
}

/** Every spelling we'd accept for one team, filtered for safety. */
export function matchableForms(
  league: LeagueConfig,
  team: {
    displayName?: string | null;
    shortDisplayName?: string | null;
    abbreviation?: string | null;
    location?: string | null;
    name?: string | null;
  },
): string[] {
  const ambiguous = ambiguousTokens(league);
  const forms = new Set<string>();

  for (const raw of [
    team.displayName,
    team.shortDisplayName,
    team.location,
    team.name,
    team.abbreviation,
  ]) {
    const n = normalizeText(raw ?? '');
    if (n) forms.add(n);
  }
  if (team.location && team.name) {
    forms.add(normalizeText(`${team.location} ${team.name}`));
  }
  for (const alias of aliasesFor(
    league,
    team.displayName,
    team.shortDisplayName,
    team.abbreviation,
    team.location,
  )) {
    forms.add(alias);
  }

  return [...forms].filter((f) => {
    if (f.length < MIN_ALIAS_LENGTH) return false;
    // A single ambiguous token ("miami", "new york") is never enough alone.
    // Multi-word forms containing one are fine: "new york jets" is clear.
    if (ambiguous.has(f)) return false;
    return true;
  });
}
