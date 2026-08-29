/**
 * GET /api/highlights
 *
 * Recently-posted highlight videos from the configured channels. See the quota
 * accounting block at the top of _lib/youtube.ts — the short version is that
 * this path uses playlistItems.list (1 unit) and never search.list (100 units).
 */

import { CACHE_TTL } from '../config.js';
import type { HighlightsResponse } from '../shared/types.js';
import { cached, peek } from './_lib/cache.js';
import { isMock } from './_lib/mock.js';
import { leagueOf, type ApiRequest, type ApiResponse } from './_lib/types.js';
import {
  applyLengthBounds,
  fetchHighlights,
  isQuotaExhausted,
  type FetchHighlightsResult,
} from './_lib/youtube.js';



export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const league = leagueOf(req);
  const cacheKey = `highlights:${league.id}`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=90, stale-while-revalidate=180');

  if (isMock()) {
    const { MOCK_HIGHLIGHT_ITEMS } = await import('../fixtures/highlights.js');
    // Runs the real length filter so MOCK=1 behaves like production.
    const { kept, rejected } = applyLengthBounds(
      MOCK_HIGHLIGHT_ITEMS.map((it: any, i: number) => ({
        videoId: it.contentDetails.videoId,
        title: it.snippet.title,
        publishedAt: it.snippet.publishedAt,
        channelId: it.snippet.channelId,
        channelName: it.snippet.channelTitle,
        thumbnail: it.snippet.thumbnails?.medium?.url ?? null,
        priority: 3 - Math.floor(i / 4),
        durationSeconds: [42, 55, 38, 61, 200, 47, 33, 58, 900, 51][i % 10],
      })),
    );
    const body: HighlightsResponse = {
      videos: kept,
      fetchedAt: new Date().toISOString(),
      stale: false,
      ageMs: 0,
      quotaExhausted: false,
      unresolvedChannels: [],
      rejected,
      mock: true,
    };
    res.status(200).json(body);
    return;
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('[api/highlights] YOUTUBE_API_KEY is not set. See .env.example.');
    res.status(200).json({
      videos: [],
      fetchedAt: new Date().toISOString(),
      stale: true,
      ageMs: 0,
      quotaExhausted: false,
      unresolvedChannels: [],
    } satisfies HighlightsResponse);
    return;
  }

  // Quota's gone for the day: serve whatever we last had rather than erroring.
  if (isQuotaExhausted()) {
    const last = peek<FetchHighlightsResult>(cacheKey);
    res.status(200).json({
      videos: last?.value.videos ?? [],
      fetchedAt: last?.fetchedAt ?? new Date().toISOString(),
      stale: true,
      ageMs: last?.ageMs ?? 0,
      quotaExhausted: true,
      unresolvedChannels: last?.value.unresolvedChannels ?? [],
    } satisfies HighlightsResponse);
    return;
  }

  try {
    const result = await cached<FetchHighlightsResult>(cacheKey, CACHE_TTL.highlights, () =>
      fetchHighlights(apiKey, league),
    );
    res.status(200).json({
      videos: result.value.videos,
      fetchedAt: result.fetchedAt,
      stale: result.stale,
      ageMs: result.ageMs,
      quotaExhausted: result.value.quotaExhausted,
      unresolvedChannels: result.value.unresolvedChannels,
      rejected: result.value.rejected,
    } satisfies HighlightsResponse);
  } catch (err) {
    console.error('[api/highlights] failed with no cached fallback:', err);
    res.status(200).json({
      videos: [],
      fetchedAt: new Date().toISOString(),
      stale: true,
      ageMs: 0,
      quotaExhausted: isQuotaExhausted(),
      unresolvedChannels: [],
    } satisfies HighlightsResponse);
  }
}
