/**
 * GET /api/scoreboard[?dates=YYYYMMDD]
 *
 * Proxies ESPN's undocumented FBS scoreboard, caches it for 15s in-process,
 * strips it to what the TVs render, and falls back to the last good payload
 * when ESPN misbehaves.
 */

import { CACHE_TTL, DEBUG_DATE } from '../config.js';
import type { LeagueConfig } from '../shared/leagues/types.js';
import type { Game, ScoreboardResponse } from '../shared/types.js';
import { cached } from './_lib/cache.js';
import { shrinkScoreboard } from './_lib/espn.js';
import { fetchEspnJson } from './_lib/http.js';
import { isMock } from './_lib/mock.js';
import { leagueOf, q, type ApiRequest, type ApiResponse } from './_lib/types.js';

/** Accept only YYYYMMDD; anything else is dropped rather than forwarded. */
function safeDate(input: string | undefined): string | null {
  if (!input) return null;
  return /^\d{8}$/.test(input) ? input : null;
}

export function scoreboardUrl(league: LeagueConfig, dates: string | null): string {
  // For college, groups=80 (FBS) and limit=100 are both required — without
  // them ESPN quietly returns ~17 games instead of the full slate. The NFL
  // needs no group filter. Each league carries its own params.
  const params = new URLSearchParams(league.espn.params);
  if (dates) params.set('dates', dates);
  return `${league.espn.scoreboard}?${params.toString()}`;
}

export async function loadScoreboard(
  league: LeagueConfig,
  dates: string | null,
): Promise<{
  games: Game[];
  stale: boolean;
  ageMs: number;
  fetchedAt: string;
  mock: boolean;
}> {
  if (isMock()) {
    const raw =
      league.id === 'nfl'
        ? (await import('../fixtures/nfl-scoreboard.js')).MOCK_NFL_SCOREBOARD
        : (await import('../fixtures/scoreboard.js')).MOCK_SCOREBOARD;
    return {
      games: shrinkScoreboard(raw),
      stale: false,
      ageMs: 0,
      fetchedAt: new Date().toISOString(),
      mock: true,
    };
  }

  const url = scoreboardUrl(league, dates);
  const result = await cached<Game[]>(
    `scoreboard:${league.id}:${dates ?? 'today'}`,
    CACHE_TTL.scoreboard,
    async () => {
      const raw = await fetchEspnJson<unknown>(url);
      return shrinkScoreboard(raw);
    },
  );

  return { games: result.value, stale: result.stale, ageMs: result.ageMs, fetchedAt: result.fetchedAt, mock: false };
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const league = leagueOf(req);
  const dates = safeDate(q(req, 'dates') ?? DEBUG_DATE ?? undefined);

  try {
    const { games, stale, ageMs, fetchedAt, mock } = await loadScoreboard(league, dates);

    // The edge cache is what stops N televisions from becoming N origin hits.
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    const body: ScoreboardResponse = { games, fetchedAt, stale, ageMs, ...(mock ? { mock: true } : {}) };
    res.status(200).json(body);
  } catch (err) {
    console.error('[api/scoreboard] failed with no cached fallback:', err);
    // Never 500 into the UI — an empty slate renders as "no games", not a crash.
    res.setHeader('Cache-Control', 'no-store');
    const body: ScoreboardResponse = {
      games: [],
      fetchedAt: new Date().toISOString(),
      stale: true,
      ageMs: 0,
    };
    res.status(200).json(body);
  }
}
