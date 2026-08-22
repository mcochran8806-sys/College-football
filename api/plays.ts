/**
 * GET /api/plays
 *
 * Chronological scoring-play feed for in-progress favorite games only.
 *
 * Why the "new play" diff is NOT computed here: serverless instances don't
 * share memory, so a server-side diff would fire duplicate cards (cold
 * instance, empty seen-set) or miss them entirely (request routed elsewhere).
 * Instead we return the full feed with stable play ids and the highlight wall
 * keeps the seen-set in React state, which is deterministic across instance
 * churn and needs no database.
 */

import { CACHE_TTL, DEBUG_DATE, ESPN, FAVORITE_TEAMS } from '../config.js';
import { favoriteInProgress } from '../shared/favorites.js';
import type { Game, PlaysResponse, ScoringPlay } from '../shared/types.js';
import { cached } from './_lib/cache.js';
import { extractScoringPlays } from './_lib/espn.js';
import { fetchEspnJson } from './_lib/http.js';
import { isMock } from './_lib/mock.js';
import { q, type ApiRequest, type ApiResponse } from './_lib/types.js';
import { loadScoreboard } from './scoreboard.js';

/** Guard rail: never fan out to more than this many summary calls per pass. */
const MAX_GAMES = 6;

/**
 * Favorites arrive from the screen's URL so that the games we poll match what
 * that screen actually treats as a favorite. Falls back to the config defaults
 * when the param is absent.
 */
function requestedFavorites(req: ApiRequest): string[] {
  const raw = q(req, 'favorites') ?? q(req, 'f');
  if (!raw) return FAVORITE_TEAMS;
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 60)
    .slice(0, 25);
  return parsed.length > 0 ? parsed : FAVORITE_TEAMS;
}

async function playsForGames(games: Game[]): Promise<ScoringPlay[]> {
  const settled = await Promise.allSettled(
    games.map(async (game) => {
      const url = `${ESPN.summary}?event=${encodeURIComponent(game.id)}`;
      const raw = await fetchEspnJson<unknown>(url);
      return extractScoringPlays(raw, game.id, game);
    }),
  );

  const plays: ScoringPlay[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') plays.push(...result.value);
    else console.error(`[api/plays] summary failed for game ${games[i].id}:`, result.reason);
  });
  return plays;
}

/** Order a cross-game feed: wallclock when ESPN gives it, else period+sequence. */
function chronological(plays: ScoringPlay[]): ScoringPlay[] {
  return [...plays].sort((a, b) => {
    const ta = a.wallclock ? Date.parse(a.wallclock) : NaN;
    const tb = b.wallclock ? Date.parse(b.wallclock) : NaN;
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    if (a.period !== b.period) return a.period - b.period;
    return a.sequence - b.sequence;
  });
}

/** Mock mode reveals one more play roughly every 45s so the score-card
 *  interstitial is testable without waiting for a real touchdown. */
const mockStart = Date.now();
function mockRevealCount(): number {
  return 2 + Math.floor((Date.now() - mockStart) / 45_000);
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  try {
    const board = await loadScoreboard(/^\d{8}$/.test(DEBUG_DATE) ? DEBUG_DATE : null);
    const favorites = requestedFavorites(req);
    const targets = favoriteInProgress(board.games, favorites).slice(0, MAX_GAMES);
    const polledGameIds = targets.map((g) => g.id);

    if (targets.length === 0) {
      res.status(200).json({
        plays: [],
        polledGameIds: [],
        fetchedAt: new Date().toISOString(),
        stale: false,
        ageMs: 0,
        ...(board.mock ? { mock: true } : {}),
      } satisfies PlaysResponse);
      return;
    }

    if (isMock()) {
      const { MOCK_SUMMARIES } = await import('../fixtures/summary.js');
      const reveal = mockRevealCount();
      const plays = targets.flatMap((game) => {
        const summary = MOCK_SUMMARIES[game.id];
        if (!summary) return [];
        return extractScoringPlays(summary, game.id, game).slice(0, reveal);
      });
      res.status(200).json({
        plays: chronological(plays),
        polledGameIds,
        fetchedAt: new Date().toISOString(),
        stale: false,
        ageMs: 0,
        mock: true,
      } satisfies PlaysResponse);
      return;
    }

    // Keyed on the games actually polled, so two screens with different
    // favorites can't share each other's feed.
    const key = `plays:${polledGameIds.join(',')}`;
    const result = await cached<ScoringPlay[]>(key, CACHE_TTL.plays, async () =>
      chronological(await playsForGames(targets)),
    );

    res.status(200).json({
      plays: result.value,
      polledGameIds,
      fetchedAt: result.fetchedAt,
      stale: result.stale,
      ageMs: result.ageMs,
    } satisfies PlaysResponse);
  } catch (err) {
    console.error('[api/plays] failed:', err);
    res.status(200).json({
      plays: [],
      polledGameIds: [],
      fetchedAt: new Date().toISOString(),
      stale: true,
      ageMs: 0,
    } satisfies PlaysResponse);
  }
}
