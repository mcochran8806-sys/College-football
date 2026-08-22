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

export const getScoreboard = () => getJson<ScoreboardResponse>('/api/scoreboard');
export const getHighlights = () => getJson<HighlightsResponse>('/api/highlights');
export const getTeams = () => getJson<TeamsResponse>('/api/teams', 20_000);

/**
 * Favorites travel to the server because /api/plays decides which games to
 * poll ESPN for, and that decision has to match what this screen considers a
 * favorite. Without the param it falls back to the config defaults.
 */
export const getPlays = (favorites: string[]) =>
  getJson<PlaysResponse>(
    favorites.length > 0
      ? `/api/plays?favorites=${favorites.map(encodeURIComponent).join(',')}`
      : '/api/plays',
  );
