/**
 * TEMPORARY diagnostic — freshness test against games happening right now.
 *
 * Everything else about Highlightly's college coverage is established: queried
 * per team, nearly every game carries a playable, correctly attributed clip.
 * The one open question is whether that is a deep ARCHIVE or a live feed —
 * every sample so far was 2025 season (Rose Bowl, SEC Championship).
 *
 * This takes today's real slate from our own ESPN scoreboard and asks
 * Highlightly for those exact teams, so the test uses games that are actually
 * being played rather than teams I picked.
 */

import { CFB } from '../shared/leagues/cfb.js';
import { loadScoreboard } from './scoreboard.js';
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

export default async function handler(_req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const key = process.env.HIGHLIGHTLY_API_KEY;
  if (!key) {
    res.status(200).json({ error: 'HIGHLIGHTLY_API_KEY is not set.' });
    return;
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // Today's real slate, from the scoreboard the TVs already use.
  const board = await loadScoreboard(CFB, null);
  const live = board.games.filter((g) => g.state === 'in' || g.state === 'post');

  const results: unknown[] = [];
  for (const game of live.slice(0, 5)) {
    const team = game.home.displayName;
    const r = await call(
      `/highlights?homeTeamDisplayName=${encodeURIComponent(team)}&limit=40`,
      key,
    );
    const items: any[] = Array.isArray(r.json?.data) ? r.json.data : [];

    // Anything from a game played today?
    const todays = items.filter((h) => String(h?.match?.date ?? '').startsWith(today));

    results.push({
      espnGame: `${game.away.displayName} @ ${game.home.displayName}`,
      espnState: `${game.state} — ${game.statusDetail}`,
      queriedTeam: team,
      status: r.status,
      totalClips: items.length,
      clipsFromTodaysGame: todays.length,
      playableFromToday: todays.filter((h) => h?.embedUrl).length,
      newestMatchDates: [
        ...new Set(items.map((h) => String(h?.match?.date ?? '').slice(0, 10))),
      ]
        .filter(Boolean)
        .sort()
        .reverse()
        .slice(0, 4),
      todaySample: todays.slice(0, 3).map((h) => ({
        title: String(h?.title ?? '').slice(0, 60),
        category: h?.category,
        source: h?.source,
        embedUrl: h?.embedUrl,
        matchDate: h?.match?.date,
      })),
    });
  }

  res.status(200).json({
    today,
    espnGamesInProgressOrFinal: live.length,
    verdict:
      'clipsFromTodaysGame > 0 means Highlightly is a live feed. All zeros with ' +
      'older newestMatchDates means it is an archive that lags, and the wall ' +
      'cannot rely on it for same-day highlights.',
    results,
  });
}
