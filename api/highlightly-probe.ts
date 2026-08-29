/**
 * TEMPORARY diagnostic, round 5 — corrected against the official OpenAPI spec.
 *
 * Two mistakes from earlier rounds, both mine:
 *
 *  1. I "corrected" the /highlights league filter from `leagueName` to
 *     `league` after seeing `league` in the /teams demo. The spec is explicit:
 *     /teams and /matches take `league`, /highlights takes `leagueName`. The
 *     original probe was right.
 *
 *  2. I judged the source mix from ONE unfiltered page. /highlights supports
 *     matchId, so the right question is not "what does an arbitrary page of
 *     25,550 records contain" but "for one real, finished game, how many
 *     clips can actually be played".
 *
 * Settled: base https://american-football.highlightly.net, header
 * x-rapidapi-key. Also per the spec, `embeddable` comes from the
 * geo-restrictions endpoint, which is NOT in the free plan.
 */

import type { ApiRequest, ApiResponse } from './_lib/types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = 'https://american-football.highlightly.net';

async function call(path: string, key: string) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
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
  return {
    path,
    status: res.status,
    ms: Date.now() - started,
    // The spec documents these; they tell us the real plan ceiling.
    quota: {
      limit: res.headers.get('x-ratelimit-requests-limit'),
      remaining: res.headers.get('x-ratelimit-requests-remaining'),
    },
    json,
    raw: json ? null : text.slice(0, 300),
  };
}

/** Playability is the only question that matters for a video wall. */
function summarise(items: any[]) {
  const bySource: Record<string, { total: number; playable: number }> = {};
  for (const h of items) {
    const s = String(h?.source ?? 'null');
    bySource[s] ??= { total: 0, playable: 0 };
    bySource[s].total += 1;
    if (h?.embedUrl) bySource[s].playable += 1;
  }
  const playable = items.filter((h) => h?.embedUrl);
  return {
    total: items.length,
    playable: playable.length,
    bySource,
    byCategory: items.reduce<Record<string, number>>((a, h) => {
      a[String(h?.category)] = (a[String(h?.category)] ?? 0) + 1;
      return a;
    }, {}),
    byType: items.reduce<Record<string, number>>((a, h) => {
      a[String(h?.type)] = (a[String(h?.type)] ?? 0) + 1;
      return a;
    }, {}),
    playableExamples: playable.slice(0, 3).map((h) => ({
      title: String(h?.title ?? '').slice(0, 64),
      category: h?.category,
      source: h?.source,
      channel: h?.channel,
      embedUrl: h?.embedUrl,
      match: `${h?.match?.awayTeam?.displayName ?? '?'} @ ${h?.match?.homeTeam?.displayName ?? '?'}`,
    })),
  };
}

export default async function handler(_req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const key = process.env.HIGHLIGHTLY_API_KEY;
  if (!key) {
    res.status(200).json({ error: 'HIGHLIGHTLY_API_KEY is not set.' });
    return;
  }

  const out: Record<string, unknown> = {};

  // 1. leagueName — the correct filter per the spec, no date so we get the
  //    most recent rather than a day that may still be in progress.
  const ncaa = await call('/highlights?leagueName=NCAA&limit=40', key);
  out.leagueNameNCAA = {
    status: ncaa.status,
    quota: ncaa.quota,
    plan: ncaa.json?.plan ?? null,
    totalCount: ncaa.json?.pagination?.totalCount ?? null,
    ...(Array.isArray(ncaa.json?.data) ? summarise(ncaa.json.data) : { raw: ncaa.raw }),
  };

  const nfl = await call('/highlights?leagueName=NFL&limit=40', key);
  out.leagueNameNFL = {
    status: nfl.status,
    plan: nfl.json?.plan ?? null,
    totalCount: nfl.json?.pagination?.totalCount ?? null,
    ...(Array.isArray(nfl.json?.data) ? summarise(nfl.json.data) : { raw: nfl.raw }),
  };

  // 2. The real test: one specific finished game. Find a recent finished NCAA
  //    match, then pull only that match's highlights.
  const yesterday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - 86_400_000));

  const matches = await call(`/matches?league=NCAA&date=${yesterday}&limit=40`, key);
  const finished = (Array.isArray(matches.json?.data) ? matches.json.data : []).filter(
    (m: any) => String(m?.state?.description ?? '').toLowerCase() === 'finished',
  );

  out.matchesYesterday = {
    date: yesterday,
    status: matches.status,
    total: Array.isArray(matches.json?.data) ? matches.json.data.length : null,
    finished: finished.length,
    sample: finished.slice(0, 3).map((m: any) => ({
      id: m?.id,
      game: `${m?.awayTeam?.displayName} @ ${m?.homeTeam?.displayName}`,
    })),
  };

  // Pull highlights for up to two finished games.
  const perMatch: unknown[] = [];
  for (const m of finished.slice(0, 2)) {
    const r = await call(`/highlights?matchId=${m.id}&limit=40`, key);
    perMatch.push({
      game: `${m?.awayTeam?.displayName} @ ${m?.homeTeam?.displayName}`,
      matchId: m?.id,
      status: r.status,
      totalCount: r.json?.pagination?.totalCount ?? null,
      ...(Array.isArray(r.json?.data) ? summarise(r.json.data) : { raw: r.raw }),
    });
  }
  out.perMatch = perMatch;

  res.status(200).json(out);
}
