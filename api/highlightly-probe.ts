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
  // NFL returned zero for all four favorites via homeTeamDisplayName, and
  // zero via leagueName=NFL. Two methods agreeing is decent evidence, but both
  // of my previous conclusions died of bad methodology, so rule out the
  // remaining explanation: that NFL displayNames are simply stored in a form
  // my query strings do not match.
  const out: Record<string, unknown> = {};

  // 1. What does the API itself call NFL teams?
  const teamsRes = await call('/teams?league=NFL', key);
  const teamList: any[] = Array.isArray(teamsRes.json)
    ? teamsRes.json
    : Array.isArray(teamsRes.json?.data)
      ? teamsRes.json.data
      : [];
  out.nflTeams = {
    status: teamsRes.status,
    count: teamList.length,
    exactNames: teamList.slice(0, 6).map((t) => ({
      id: t?.id,
      name: t?.name,
      displayName: t?.displayName,
      abbreviation: t?.abbreviation,
      league: t?.league,
    })),
    raw: teamList.length === 0 ? teamsRes.raw : undefined,
  };

  // 2. Retry highlights using the API's OWN strings and ids, not mine.
  const probeTeams = teamList.slice(0, 3);
  const retries: unknown[] = [];
  for (const t of probeTeams) {
    const byName = await call(
      `/highlights?homeTeamDisplayName=${encodeURIComponent(String(t?.displayName))}&limit=40`,
      key,
    );
    const byId = await call(`/highlights?homeTeamId=${encodeURIComponent(String(t?.id))}&limit=40`, key);
    retries.push({
      team: t?.displayName,
      id: t?.id,
      byDisplayName: byName.json?.pagination?.totalCount ?? byName.status,
      byTeamId: byId.json?.pagination?.totalCount ?? byId.status,
    });
  }
  out.retriesWithApiOwnStrings = retries;

  // 3. Do NFL matches exist at all? If there are matches but no highlights,
  //    that is a coverage gap. If there are no matches either, the API simply
  //    does not carry the NFL despite the product name.
  const nflMatches = await call('/matches?league=NFL&limit=5', key);
  out.nflMatches = {
    status: nflMatches.status,
    totalCount: nflMatches.json?.pagination?.totalCount ?? null,
    sample: (Array.isArray(nflMatches.json?.data) ? nflMatches.json.data : [])
      .slice(0, 3)
      .map((m: any) => ({
        id: m?.id,
        date: m?.date,
        game: `${m?.awayTeam?.displayName} @ ${m?.homeTeam?.displayName}`,
        league: m?.league,
      })),
  };

  res.status(200).json(out);
  return;

}
