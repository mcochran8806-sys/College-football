/**
 * TEMPORARY diagnostic, round 3. Removed once the integration is settled.
 *
 * Settled by the previous rounds, so no longer re-tested (each probe run costs
 * real quota against a 100/day free tier):
 *   base URL   https://american-football.highlightly.net
 *   auth       x-rapidapi-key  (yes, even on the direct platform — neither
 *              Authorization: Bearer nor x-api-key works)
 *
 * Open question this round: /highlights returns 200 with an empty `data` array
 * for today. Is that no data yet, a wrong parameter, or a plan restriction?
 * The response envelope has a `plan` key that should say.
 *
 * Costs ~6 calls per load.
 */

import type { ApiRequest, ApiResponse } from './_lib/types.js';
import { q } from './_lib/types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = 'https://american-football.highlightly.net';

async function call(path: string, key: string) {
  const url = `${BASE}${path}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'x-rapidapi-key': key },
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* raw below */
    }

    const data = Array.isArray(json?.data) ? json.data : null;

    return {
      path,
      status: res.status,
      ms: Date.now() - started,
      // The plan object should report tier and remaining quota.
      plan: json?.plan ?? null,
      pagination: json?.pagination ?? null,
      count: data?.length ?? null,
      // First record in full — this is what the integration gets built against.
      first: data?.[0] ?? null,
      keysOfFirst: data?.[0] ? Object.keys(data[0]) : null,
      // Raw tail only when something is off, capped so the page stays readable.
      raw: data ? null : text.slice(0, 600),
    };
  } catch (err) {
    return { path, status: 'THREW', ms: Date.now() - started, error: String(err).slice(0, 200) };
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const key = process.env.HIGHLIGHTLY_API_KEY;
  if (!key) {
    res.status(200).json({ error: 'HIGHLIGHTLY_API_KEY is not set on this deployment.' });
    return;
  }

  const custom = q(req, 'path');
  if (custom) {
    // Escape hatch: probe one arbitrary path without another deploy.
    res.status(200).json(await call(custom.startsWith('/') ? custom : `/${custom}`, key));
    return;
  }

  // ONE call. Everything now hinges on what an ESPN-sourced embedUrl actually
  // is: 90% of clips come from ESPN, and only a YouTube embed can drive the
  // IFrame player's ENDED event that the wall auto-advances on. Anything else
  // needs a generic iframe and a timer.
  const raw = await fetch(`${BASE}/highlights?limit=40`, {
    headers: { 'x-rapidapi-key': key },
    signal: AbortSignal.timeout(12_000),
  });
  const json: any = await raw.json().catch(() => null);
  const items: any[] = Array.isArray(json?.data) ? json.data : [];

  const bySource: Record<string, any[]> = {};
  for (const h of items) {
    const k = String(h?.source ?? 'null');
    (bySource[k] ??= []).push(h);
  }

  // Two full examples per source — the URLs are what matter.
  const examples: Record<string, unknown[]> = {};
  for (const [src, list] of Object.entries(bySource)) {
    examples[src] = list.slice(0, 2).map((h) => ({
      title: String(h?.title ?? '').slice(0, 60),
      category: h?.category,
      channel: h?.channel,
      url: h?.url,
      embedUrl: h?.embedUrl,
      imgUrl: String(h?.imgUrl ?? '').slice(0, 90),
      match: `${h?.match?.awayTeam?.displayName ?? '?'} @ ${h?.match?.homeTeam?.displayName ?? '?'}`,
      league: h?.match?.league,
      allKeys: Object.keys(h ?? {}),
    }));
  }

  // Are any embedUrls missing entirely? A clip with no embedUrl is unplayable.
  const missingEmbed = items.filter((h) => !h?.embedUrl).length;

  res.status(200).json({
    plan: json?.plan ?? null,
    sampled: items.length,
    sourceCounts: Object.fromEntries(
      Object.entries(bySource).map(([k, v]) => [k, v.length]),
    ),
    missingEmbedUrl: missingEmbed,
    embedUrlHosts: [
      ...new Set(
        items
          .map((h) => {
            try {
              return new URL(String(h?.embedUrl)).host;
            } catch {
              return 'INVALID/absent';
            }
          }),
      ),
    ],
    examples,
  });
  return;

}
