/** Favorite-team resolution, shared by the scoreboard sort and /api/plays. */

import type { LeagueConfig } from './leagues/types.js';
import { matchableForms, normalizeText } from './teamAliases.js';
import type { Game, TeamSide } from './types.js';

export function isFavoriteTeam(
  team: TeamSide,
  favorites: string[],
  league: LeagueConfig,
): boolean {
  // Exact form membership, not substring: "Texas" must not match "Texas A&M",
  // and "Miami" must not match "Miami (OH)".
  const forms = new Set(matchableForms(league, team));
  // The abbreviation is safe here even when it is too short or too ambiguous
  // for title matching — a favorites list is typed deliberately, not scraped.
  const abbr = normalizeText(team.abbreviation ?? '');
  if (abbr) forms.add(abbr);
  return favorites.some((fav) => forms.has(normalizeText(fav)));
}

export function isFavoriteGame(game: Game, favorites: string[], league: LeagueConfig): boolean {
  return (
    isFavoriteTeam(game.home, favorites, league) || isFavoriteTeam(game.away, favorites, league)
  );
}

/** In-progress games involving a favorite — the only games /api/plays polls. */
export function favoriteInProgress(
  games: Game[],
  favorites: string[],
  league: LeagueConfig,
): Game[] {
  return games.filter((g) => g.state === 'in' && isFavoriteGame(g, favorites, league));
}
