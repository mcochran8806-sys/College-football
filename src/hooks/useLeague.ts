import { useMemo } from 'react';
import { resolveLeague } from '../../shared/leagues/index';
import type { LeagueConfig } from '../../shared/leagues/types';

/**
 * Which league this screen shows, from ?league= in its URL.
 *
 * Read once at mount — a TV is opened to a URL and left alone, and switching
 * leagues means loading a different URL, which remounts everything anyway.
 * An unrecognized value falls back to the default rather than erroring: a typo
 * in a TV's URL must not blank the screen.
 */
export function useLeague(): LeagueConfig {
  return useMemo(() => {
    try {
      return resolveLeague(new URLSearchParams(window.location.search).get('league'));
    } catch {
      return resolveLeague(null);
    }
  }, []);
}

/** The ?league= fragment to carry onto another URL, empty for the default. */
export function leagueParam(league: LeagueConfig): string {
  return league.id === 'cfb' ? '' : `league=${league.id}`;
}
