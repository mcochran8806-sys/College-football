/**
 * TEMPORARY diagnostic. Removed once the Highlightly integration is settled.
 *
 * Answers, in one request, everything I can't determine from the docs:
 *   - which auth header the direct platform wants (Bearer vs x-api-key)
 *   - what a highlight object actually contains for NFL and NCAA
 *   - what `source` values dominate (only youtube-sourced clips can drive the
 *     IFrame player's ENDED event, which is how the wall auto-advances)
 *   - what share are `embeddable`
 *   - what `category` values exist, and whether durations are exposed
 *
 * The key is read from the environment and never echoed back.
 */

import { redact } from './_lib/http.js';
import type { ApiRequest, ApiResponse } from './_lib/types.js';
import { q } from './_lib/types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = 'https://american-football.highlightly.net';

const AUTH_VARIANTS: Array<{ name: string; headers: (k: string) => Record<string, string> }> = [
  { name: 'Authorization: Bearer', headers: (k) => ({ Authorization: `Bearer ${k}` }) },
  { name: 'x-api-key', headers: (k) => ({ 'x-api-key': k }) },
  { name: 'Authorization (raw key)', headers: (k) => ({ Authorization: k }) },
];

function today(): string {
  // Highlightly wants YYYY-MM-DD; use US Eastern, which is the football day.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
}

async function attempt(url: string, headers: Record<string, string>) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep raw */
    }
    return {
      status: res.status,
      ms: Date.now() - started,
      bytes: text.length,
      json: body,
      raw: body ? null : text.slice(0, 300),
    };
  } catch (err) {
    return { status: 'THREW', ms: Date.now() - started, error: String(err).slice(0, 200) };
  }
}

/** Pull the interesting shape out of whatever came back. */
function describe(json: any) {
  const items: any[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.highlights)
        ? json.highlights
        : [];

  if (items.length === 0) {
    return { count: 0, topLevelKeys: Object.keys(json ?? {}).slice(0, 12) };
  }

  const tally = (fn: (h: any) => unknown) => {
    const counts: Record<string, number> = {};
    for (const h of items) {
      const key = String(fn(h) ?? 'null');
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  };

  const sample = items[0];
  return {
    count: items.length,
    highlightKeys: Object.keys(sample ?? {}),
    bySource: tally((h) => h?.source),
    byEmbeddable: tally((h) => h?.embeddable),
    byCategory: tally((h) => h?.category ?? h?.type),
    byLeague: tally((h) => h?.match?.league?.name ?? h?.league?.name ?? h?.leagueName),
    hasDuration: items.some((h) => h?.duration != null || h?.durationSeconds != null),
    // Redacted sample so nothing sensitive leaks into the page.
    sample: {
      title: sample?.title ?? null,
      url: sample?.url ?? null,
      embedUrl: sample?.embedUrl ?? null,
      embeddable: sample?.embeddable ?? null,
      source: sample?.source ?? null,
      channel: sample?.channel ?? null,
      category: sample?.category ?? sample?.type ?? null,
      duration: sample?.duration ?? null,
      match: sample?.match
        ? {
            keys: Object.keys(sample.match).slice(0, 14),
            league: sample.match?.league ?? null,
            homeTeam: sample.match?.homeTeam?.name ?? sample.match?.homeTeam ?? null,
            awayTeam: sample.match?.awayTeam?.name ?? sample.match?.awayTeam ?? null,
          }
        : null,
    },
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const key = process.env.HIGHLIGHTLY_API_KEY;
  if (!key) {
    res.status(200).json({
      error: 'HIGHLIGHTLY_API_KEY is not set on this deployment.',
      fix: 'Vercel -> cfb-saturday -> Settings -> Environment Variables, then redeploy.',
    });
    return;
  }

  const date = q(req, 'date') ?? today();

  // Step 1: which auth header works? One cheap call each.
  const auth: Record<string, unknown> = {};
  let working: { name: string; headers: Record<string, string> } | null = null;

  for (const variant of AUTH_VARIANTS) {
    const headers = variant.headers(key);
    const result = await attempt(`${BASE}/highlights?limit=1`, headers);
    auth[variant.name] = { status: result.status, bytes: result.bytes, raw: result.raw };
    if (result.status === 200 && !working) working = { name: variant.name, headers };
  }

  if (!working) {
    res.status(200).json({
      date,
      verdict: 'No auth variant returned 200 — see statuses below.',
      auth,
    });
    return;
  }

  // Step 2: what does the data actually look like?
  const probes: Record<string, unknown> = {};
  const urls: Record<string, string> = {
    todayAll: `${BASE}/highlights?date=${date}&limit=40`,
    todayNFL: `${BASE}/highlights?date=${date}&leagueName=NFL&limit=40`,
    todayNCAA: `${BASE}/highlights?date=${date}&leagueName=NCAA&limit=40`,
    leagues: `${BASE}/leagues?limit=40`,
  };

  for (const [name, url] of Object.entries(urls)) {
    const r = await attempt(url, working.headers);
    probes[name] =
      r.status === 200
        ? { status: 200, ms: r.ms, ...describe(r.json) }
        : { status: r.status, ms: r.ms, raw: r.raw, error: (r as any).error };
  }

  res.status(200).json({
    date,
    workingAuth: working.name,
    authAttempts: auth,
    probes,
    note: redact('key never echoed'),
  });
}
