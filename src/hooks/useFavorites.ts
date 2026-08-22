import { useMemo } from 'react';
import { resolveFavorites, type ResolvedFavorites } from '../lib/favorites';

/**
 * Favorites for this screen. Read once at mount — these displays are opened to
 * a URL and left alone, so there is nothing to react to. Changing favorites
 * means loading a different URL, which remounts everything anyway.
 */
export function useFavorites(): ResolvedFavorites {
  return useMemo(() => resolveFavorites(), []);
}
