import type { LeagueId } from '../../shared/leagues/types';
import type {
  HighlightsResponse,
  PlaysResponse,
  ScoreboardResponse,
  TeamsResponse,
} from '../../shared/types';

/**
 * The browser only ever talks to our own /api. It never sees ESPN, YouTube, or
 * the API key.
 */
async function getJson<T>(path: string, timeoutMs = 12_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Every endpoint is league-scoped; the default league sends no param. */
function withLeague(path: string, league: LeagueId, extra = ''): string {
  const params = new URLSearchParams();
  if (league !== 'cfb') params.set('league', league);
  if (extra) params.set('favorites', extra);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const getScoreboard = (league: LeagueId) =>
  getJson<ScoreboardResponse>(withLeague('/api/scoreboard', league));
export const getHighlights = (league: LeagueId) =>
  getJson<HighlightsResponse>(withLeague('/api/highlights', league));
export const getTeams = (league: LeagueId) =>
  getJson<TeamsResponse>(withLeague('/api/teams', league), 20_000);

/**
 * Favorites travel to the server because /api/plays decides which games to
 * poll ESPN for, and that decision has to match what this screen considers a
 * favorite. Without the param it falls back to the config defaults.
 */
export const getPlays = (favorites: string[], league: LeagueId) =>
  getJson<PlaysResponse>(withLeague('/api/plays', league, favorites.join(',')));
