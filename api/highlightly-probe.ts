/**
 * TEMPORARY diagnostic, round 6 — correcting a flaw in my own analysis.
 *
 * Earlier I reported "2 usable clips in 40" and rejected the API. That framing
 * was wrong in two ways:
 *
 *  1. Those 40 records were concentrated on roughly TWO games, not a broad
 *     slate. Per game the pattern was many unplayable ESPN per-play clips plus
 *     one or two playable YouTube match-highlights clips. One playable clip per
 *     game across a 60-game Saturday is a very different proposition.
 *
 *  2. My per-match test pulled "yesterday's finished NCAA games" and got Delta
 *     State, UAlbany and William & Mary — Division II and FCS schools nobody
 *     films. Concluding "matchId returns nothing" from those is invalid.
 *
 * The right question, and the right production access pattern: for real FBS
 * teams, how many PLAYABLE clips come back? /highlights supports
 * homeTeamDisplayName / awayTeamDisplayName, so ask per team.
 */

import type { ApiRequest, ApiResponse } from './_lib/types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = 'https://american-football.highlightly.net';

async function call(path: string, key: string) {
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
  return { status: res.status, json, raw: json ? null : text.slice(0, 200) };
}

function summarise(items: any[]) {
  const playable = items.filter((h) => h?.embedUrl);
  // Group by game so "clips per game" is visible, not just clips per page.
  const games = new Set(items.map((h) => String(h?.match?.id ?? 'none')));
  const playableGames = new Set(playable.map((h) => String(h?.match?.id ?? 'none')));
  return {
    clips: items.length,
    playableClips: playable.length,
    distinctGames: games.size,
    gamesWithAPlayableClip: playableGames.size,
    bySource: items.reduce<Record<string, number>>((a, h) => {
      a[String(h?.source)] = (a[String(h?.source)] ?? 0) + 1;
      return a;
    }, {}),
    playableSample: playable.slice(0, 4).map((h) => ({
      title: String(h?.title ?? '').slice(0, 60),
      category: h?.category,
      source: h?.source,
      channel: h?.channel,
      embedUrl: h?.embedUrl,
      game: `${h?.match?.awayTeam?.displayName ?? '?'} @ ${h?.match?.homeTeam?.displayName ?? '?'}`,
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

  // Real FBS programs: the user's three favorites plus two blue-bloods that
  // are certain to be filmed if anything is.
  const teams = [
    'Georgia Bulldogs',
    'Alabama Crimson Tide',
    'Georgia Tech Yellow Jackets',
    'Ohio State Buckeyes',
    'Texas Longhorns',
  ];

  const perTeam: Record<string, unknown> = {};
  for (const team of teams) {
    const enc = encodeURIComponent(team);
    // A team appears as home in some games and away in others; check both.
    const home = await call(`/highlights?homeTeamDisplayName=${enc}&limit=40`, key);
    const away = await call(`/highlights?awayTeamDisplayName=${enc}&limit=40`, key);

    const items = [
      ...(Array.isArray(home.json?.data) ? home.json.data : []),
      ...(Array.isArray(away.json?.data) ? away.json.data : []),
    ];

    perTeam[team] = {
      status: `${home.status}/${away.status}`,
      totalCount: {
        home: home.json?.pagination?.totalCount ?? null,
        away: away.json?.pagination?.totalCount ?? null,
      },
      ...summarise(items),
      raw: items.length === 0 ? (home.raw ?? away.raw) : undefined,
    };
  }

  res.status(200).json({
    question:
      'For real FBS teams, how many PLAYABLE clips exist, and across how many distinct games?',
    perTeam,
  });
}
