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

  // ONE call. The question that decides whether Highlightly can replace the
  // title matcher: how often is a clip attached to the wrong game?
  //
  // The first record from the previous round had the title "Houston Texans vs.
  // Carolina Panthers | 2026 Preseason Week 3" attached to a match between
  // Lenoir-Rhyne and Virginia Union — two Division II schools. If that rate is
  // high, "clips arrive pre-matched" is not a benefit, it is a liability.
  const raw = await fetch(`${BASE}/highlights?limit=40`, {
    headers: { 'x-rapidapi-key': key },
    signal: AbortSignal.timeout(12_000),
  });
  const json: any = await raw.json().catch(() => null);
  const items: any[] = Array.isArray(json?.data) ? json.data : [];

  /** Crude but sufficient: does either team name appear in the title? */
  const squash = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rows = items.map((h) => {
    const title = squash(h?.title);
    const home = h?.match?.homeTeam ?? {};
    const away = h?.match?.awayTeam ?? {};
    const names = [home?.name, home?.displayName, away?.name, away?.displayName]
      .filter(Boolean)
      .map(squash)
      .filter((n) => n.length >= 4);
    const hit = names.some((n) => title.includes(n));
    return {
      title: String(h?.title ?? '').slice(0, 72),
      match: `${away?.displayName ?? '?'} @ ${home?.displayName ?? '?'}`,
      league: h?.match?.league ?? null,
      source: h?.source,
      channel: h?.channel,
      category: h?.category,
      titleMentionsAMatchTeam: hit,
    };
  });

  const mismatches = rows.filter((x) => !x.titleMentionsAMatchTeam).length;

  res.status(200).json({
    plan: json?.plan ?? null,
    totalCount: json?.pagination?.totalCount ?? null,
    sampled: rows.length,
    titleDoesNotMentionEitherMatchTeam: mismatches,
    mismatchRate: rows.length ? `${Math.round((mismatches / rows.length) * 100)}%` : 'n/a',
    bySource: rows.reduce<Record<string, number>>((a, x) => {
      a[String(x.source)] = (a[String(x.source)] ?? 0) + 1;
      return a;
    }, {}),
    byCategory: rows.reduce<Record<string, number>>((a, x) => {
      a[String(x.category)] = (a[String(x.category)] ?? 0) + 1;
      return a;
    }, {}),
    rows,
  });
  return;

}
