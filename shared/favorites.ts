/** Favorite-team resolution, shared by the scoreboard sort and /api/plays. */

import { aliasesFor, normalizeText } from './teamAliases.js';
import type { Game, TeamSide } from './types.js';

/** Every spelling we'll accept for one ESPN team. */
function formsFor(team: TeamSide): Set<string> {
  const forms = new Set<string>();
  for (const raw of [team.displayName, team.shortDisplayName, team.abbreviation, team.location, team.name]) {
    const n = normalizeText(raw ?? '');
    if (n) forms.add(n);
  }
  // "Georgia Bulldogs" should also answer to "georgia".
  if (team.location && team.name) forms.add(normalizeText(`${team.location} ${team.name}`));
  for (const alias of aliasesFor(team.displayName, team.shortDisplayName, team.abbreviation, team.location)) {
    forms.add(alias);
  }
  return forms;
}

export function isFavoriteTeam(team: TeamSide, favorites: string[]): boolean {
  const forms = formsFor(team);
  return favorites.some((fav) => forms.has(normalizeText(fav)));
}

export function isFavoriteGame(game: Game, favorites: string[]): boolean {
  return isFavoriteTeam(game.home, favorites) || isFavoriteTeam(game.away, favorites);
}

/** In-progress games involving a favorite — the only games /api/plays polls. */
export function favoriteInProgress(games: Game[], favorites: string[]): Game[] {
  return games.filter((g) => g.state === 'in' && isFavoriteGame(g, favorites));
}
