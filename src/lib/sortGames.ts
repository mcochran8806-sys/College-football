import { CLOSE_GAME } from '../../config';
import { isFavoriteGame } from '../../shared/favorites';
import type { Game } from '../../shared/types';

/** favorites -> in progress -> upcoming -> final */
function bucket(game: Game, favorites: string[]): number {
  if (isFavoriteGame(game, favorites)) return 0;
  if (game.state === 'in') return 1;
  if (game.state === 'pre') return 2;
  return 3;
}

/** Close and late: 4th quarter or later, margin at or under 8. */
export function isCloseAndLate(game: Game): boolean {
  if (game.state !== 'in') return false;
  if (game.period < CLOSE_GAME.period) return false;
  const home = game.home.score;
  const away = game.away.score;
  if (home === null || away === null) return false;
  return Math.abs(home - away) <= CLOSE_GAME.margin;
}

export function isFavorite(game: Game, favorites: string[]): boolean {
  return isFavoriteGame(game, favorites);
}

export function sortGames(games: Game[], favorites: string[]): Game[] {
  return [...games].sort((a, b) => {
    const ba = bucket(a, favorites);
    const bb = bucket(b, favorites);
    if (ba !== bb) return ba - bb;

    // Within favorites, live games outrank scheduled ones.
    if (ba === 0) {
      const rank = (g: Game) => (g.state === 'in' ? 0 : g.state === 'pre' ? 1 : 2);
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
    }

    // Live games: the tight ones first, then by how late they are.
    if (a.state === 'in' && b.state === 'in') {
      const ca = isCloseAndLate(a) ? 0 : 1;
      const cb = isCloseAndLate(b) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      if (a.period !== b.period) return b.period - a.period;
    }

    // Ranked matchups float up; then kickoff time.
    const rankOf = (g: Game) => Math.min(g.home.rank ?? 99, g.away.rank ?? 99);
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra !== rb) return ra - rb;

    return Date.parse(a.date) - Date.parse(b.date);
  });
}

export function paginate<T>(items: T[], perPage: number): T[][] {
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}
