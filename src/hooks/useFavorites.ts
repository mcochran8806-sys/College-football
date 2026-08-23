import { useMemo } from 'react';
import type { LeagueConfig } from '../../shared/leagues/types';
import { resolveFavorites, type ResolvedFavorites } from '../lib/favorites';

/**
 * Favorites for this screen. Read once at mount — these displays are opened to
 * a URL and left alone, so there is nothing to react to. Changing favorites
 * means loading a different URL, which remounts everything anyway.
 */
export function useFavorites(league: LeagueConfig): ResolvedFavorites {
  return useMemo(() => resolveFavorites(league), [league]);
}
