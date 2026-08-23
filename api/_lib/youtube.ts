/**
 * YouTube Data API v3 polling.
 *
 * ============================ QUOTA ACCOUNTING ============================
 * Budget: 10,000 units/day, per Google Cloud project.
 *
 *   search.list       = 100 units/call  -> ~100 calls/day. NEVER in a poll loop.
 *   playlistItems.list=   1 unit /call  -> what we actually use.
 *   channels.list     =   1 unit /call  -> one-time id resolution only, and it
 *                                          runs in scripts/resolve-channels.mjs,
 *                                          not in any request path.
 *
 * A channel's uploads playlist id is its channel id with the second character
 * changed from C to U (UCxxxx -> UUxxxx). That's a pure string transform, so
 * discovering where to poll costs ZERO units.
 *
 * Steady-state math for a 12-hour game day, per league:
 *
 *   11 college channels x 1 unit x 30 polls/hour (one per 2 min) x 12 hours
 *     = 3,960 units/day, plus ~2 units/poll for duration lookups
 *   10 NFL channels on the same cadence = 3,600 units/day
 *
 * Both leagues sharing one key is fine on a normal weekend — college plays
 * Saturday, the NFL plays Sunday — but running both walls hard on the same day
 * would roughly double it and start crowding 10,000. Only the channels for the
 * requested league are polled, so an idle league costs nothing.
 *
 * ...comfortably inside 10,000, with room for a second TV, a dev session, and
 * a few retries. Note the server-side 90s cache means the browser's 2-minute
 * poll is the real upstream cadence — extra clients cost nothing.
 *
 * Anything that would add a search.list to this path needs a rethink, not a
 * bigger budget.
 * ==========================================================================
 */

import { LEAGUE_SETTINGS, WALL } from '../../config.js';
import type { HighlightChannel, LeagueConfig } from '../../shared/leagues/types.js';
import type { HighlightVideo } from '../../shared/types.js';
import { fetchJson, redact, UpstreamError } from './http.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const API = 'https://www.googleapis.com/youtube/v3';

/**
 * UCxxxx -> UUxxxx. No API call. Returns null for anything that isn't a
 * plausible channel id, which is how TODO_VERIFY entries get skipped.
 */
export function uploadsPlaylistId(channelId: string): string | null {
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) return null;
  return `UU${channelId.slice(2)}`;
}

/**
 * Per-channel high-water mark of the newest publishedAt we've surfaced.
 * Process-local, like every other bit of state here — worst case after an
 * instance recycle we re-surface a video the wall has already played, and the
 * client's played-this-session set catches it.
 */
const watermarks = new Map<string, string>();

/** Set once YouTube says quotaExceeded; cleared when the ET day rolls over. */
let quotaExhaustedUntil: string | null = null;

/** Start of "today" in US Eastern, as an ISO string. College football's day. */
export function easternDayStart(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '01';
  // Games run past midnight ET; treat "today" as starting at 6am ET so a
  // late West Coast finish still counts as the same Saturday.
  return new Date(`${get('year')}-${get('month')}-${get('day')}T06:00:00-05:00`);
}

function easternDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isQuotaExhausted(): boolean {
  if (!quotaExhaustedUntil) return false;
  if (quotaExhaustedUntil !== easternDayKey()) {
    quotaExhaustedUntil = null; // new day, new budget
    return false;
  }
  return true;
}

function markQuotaExhausted(): void {
  quotaExhaustedUntil = easternDayKey();
  console.error(
    '[youtube] quotaExceeded — serving cached highlights for the rest of the day. ' +
      'Daily budget resets at midnight Pacific.',
  );
}

function parseItems(raw: any, channel: HighlightChannel): HighlightVideo[] {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  const out: HighlightVideo[] = [];

  for (const it of items) {
    const snippet = it?.snippet;
    const videoId = snippet?.resourceId?.videoId ?? it?.contentDetails?.videoId;
    const title = snippet?.title;
    // playlistItems keeps tombstones for deleted/private videos.
    if (typeof videoId !== 'string' || typeof title !== 'string') continue;
    if (title === 'Deleted video' || title === 'Private video') continue;

    const publishedAt =
      it?.contentDetails?.videoPublishedAt ?? snippet?.publishedAt ?? null;
    if (typeof publishedAt !== 'string') continue;

    out.push({
      videoId,
      title,
      publishedAt,
      channelId: channel.id,
      channelName: channel.name,
      thumbnail:
        snippet?.thumbnails?.medium?.url ??
        snippet?.thumbnails?.default?.url ??
        `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      priority: channel.priority ?? 1,
      durationSeconds: null,
    });
  }

  return out;
}

/** PT1H2M3S -> seconds. Returns null for anything unparseable. */
export function parseIsoDuration(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const m = /^P(?:([\d.]+)D)?T?(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?$/.exec(iso);
  if (!m) return null;
  const [, d, h, min, sec] = m;
  const total =
    (Number(d) || 0) * 86400 +
    (Number(h) || 0) * 3600 +
    (Number(min) || 0) * 60 +
    (Number(sec) || 0);
  return Number.isFinite(total) && total > 0 ? total : null;
}

/**
 * Fill in durations so Shorts can be dropped.
 *
 * videos.list accepts up to 50 ids per call and still costs 1 unit, so the
 * whole batch is typically 1-2 units on top of the 11 for the playlists.
 * A failure here is non-fatal: durations stay null and nothing gets filtered,
 * which is better than an empty wall.
 */
async function attachDurations(videos: HighlightVideo[], apiKey: string): Promise<void> {
  for (let i = 0; i < videos.length; i += 50) {
    const batch = videos.slice(i, i + 50);
    try {
      const url =
        `${API}/videos?part=contentDetails` +
        `&id=${batch.map((v) => encodeURIComponent(v.videoId)).join(',')}` +
        `&key=${encodeURIComponent(apiKey)}`;
      const raw = await fetchJson<any>(url);
      const byId = new Map<string, number | null>();
      for (const item of Array.isArray(raw?.items) ? raw.items : []) {
        if (typeof item?.id === 'string') {
          byId.set(item.id, parseIsoDuration(item?.contentDetails?.duration));
        }
      }
      for (const v of batch) v.durationSeconds = byId.get(v.videoId) ?? null;
    } catch (err) {
      console.error('[youtube] duration lookup failed for a batch:', redact(String(err)));
    }
  }
}

export interface FetchHighlightsResult {
  videos: HighlightVideo[];
  unresolvedChannels: string[];
  quotaExhausted: boolean;
}

/**
 * One poll pass across every configured channel. Costs exactly one unit per
 * resolved channel. Per-channel failures are logged and skipped so a single
 * bad channel can't empty the wall.
 */
export async function fetchHighlights(
  apiKey: string,
  league: LeagueConfig,
): Promise<FetchHighlightsResult> {
  const dayStart = easternDayStart().getTime();
  const unresolved: string[] = [];
  const resolved: Array<{ channel: HighlightChannel; playlistId: string }> = [];

  for (const channel of LEAGUE_SETTINGS[league.id].channels) {
    const playlistId = uploadsPlaylistId(channel.id);
    if (!playlistId) {
      unresolved.push(channel.name);
      continue;
    }
    resolved.push({ channel, playlistId });
  }

  if (unresolved.length > 0) {
    console.warn(
      `[youtube] skipping ${unresolved.length} channel(s) with unresolved ids: ` +
        `${unresolved.join(', ')}. Run \`npm run resolve-channels\` to fill them in.`,
    );
  }

  if (isQuotaExhausted()) {
    return { videos: [], unresolvedChannels: unresolved, quotaExhausted: true };
  }

  const settled = await Promise.allSettled(
    resolved.map(async ({ channel, playlistId }) => {
      const url =
        `${API}/playlistItems?part=snippet,contentDetails` +
        `&playlistId=${encodeURIComponent(playlistId)}` +
        `&maxResults=10&key=${encodeURIComponent(apiKey)}`;
      const raw = await fetchJson<any>(url);
      return parseItems(raw, channel);
    }),
  );

  let sawQuotaError = false;
  const all: HighlightVideo[] = [];

  settled.forEach((result, i) => {
    const channel = resolved[i].channel;
    if (result.status === 'fulfilled') {
      all.push(...result.value);
      return;
    }
    const err = result.reason;
    if (err instanceof UpstreamError && err.status === 403 && /quota/i.test(err.body ?? '')) {
      sawQuotaError = true;
    } else {
      console.error(`[youtube] channel "${channel.name}" failed:`, redact(String(err)));
    }
  });

  if (sawQuotaError) markQuotaExhausted();

  // Today only, newest first, de-duplicated across channels.
  const seen = new Set<string>();
  const videos = all
    .filter((v) => {
      const t = Date.parse(v.publishedAt);
      return Number.isFinite(t) && t >= dayStart;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .filter((v) => {
      if (seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      return true;
    });

  await attachDurations(videos, apiKey);

  // Drop Shorts. A 15-second vertical clip on a 65" screen is worse than
  // nothing. Unknown durations are kept — never filter on missing data.
  const longEnough = videos.filter(
    (v) => v.durationSeconds === null || v.durationSeconds >= WALL.minDurationSeconds,
  );
  const dropped = videos.length - longEnough.length;
  if (dropped > 0) {
    console.log(`[youtube] dropped ${dropped} clip(s) under ${WALL.minDurationSeconds}s`);
  }

  // Advance the per-channel watermark so a later pass can tell what's new.
  for (const v of longEnough) {
    const prev = watermarks.get(v.channelId);
    if (!prev || Date.parse(v.publishedAt) > Date.parse(prev)) {
      watermarks.set(v.channelId, v.publishedAt);
    }
  }

  return {
    videos: longEnough,
    unresolvedChannels: unresolved,
    quotaExhausted: sawQuotaError || isQuotaExhausted(),
  };
}

/** Exposed for the mock path and for tests. */
export function watermarkFor(channelId: string): string | null {
  return watermarks.get(channelId) ?? null;
}
