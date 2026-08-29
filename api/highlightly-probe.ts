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

function ymd(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

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

  const probes = [
    // No date filter at all — should return the most recent regardless.
    '/highlights?limit=5',
    // Today, and the last two Saturdays, in case highlights simply lag.
    `/highlights?date=${ymd(0)}&limit=5`,
    `/highlights?date=${ymd(-7)}&limit=5`,
    // Do matches work when highlights do not? Separates "no data" from
    // "endpoint or plan problem".
    `/matches?date=${ymd(0)}&limit=5`,
    '/matches?limit=5',
    // Leagues 404'd at /leagues last round; try the prefixed form the error
    // message implied.
    '/american-football/leagues?limit=5',
  ];

  const results = [];
  for (const p of probes) results.push(await call(p, key));

  res.status(200).json({ today: ymd(0), lastWeek: ymd(-7), results });
}
