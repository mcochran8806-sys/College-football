import { CFB } from './cfb.js';
import { NFL } from './nfl.js';
import type { LeagueConfig, LeagueId } from './types.js';

export type { AliasEntry, HighlightChannel, LeagueConfig, LeagueId } from './types.js';
export { CFB } from './cfb.js';
export { NFL } from './nfl.js';

export const LEAGUES: Record<LeagueId, LeagueConfig> = { cfb: CFB, nfl: NFL };

export const DEFAULT_LEAGUE: LeagueId = 'cfb';

/** Spellings accepted in a ?league= parameter. */
const ALIASES: Record<string, LeagueId> = {
  cfb: 'cfb',
  college: 'cfb',
  'college-football': 'cfb',
  ncaa: 'cfb',
  ncaaf: 'cfb',
  nfl: 'nfl',
  pro: 'nfl',
};

/** Resolve a ?league= value. Anything unrecognized falls back to the default
 *  rather than erroring — a typo in a TV's URL must not blank the screen. */
export function resolveLeague(value: string | null | undefined): LeagueConfig {
  if (!value) return LEAGUES[DEFAULT_LEAGUE];
  return LEAGUES[ALIASES[value.trim().toLowerCase()] ?? DEFAULT_LEAGUE];
}
