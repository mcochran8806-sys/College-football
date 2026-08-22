/**
 * GET /api/teams
 *
 * Full FBS team list for the settings picker. Cached hard — the membership of
 * the FBS changes about once a year, so there's no reason to ask ESPN more
 * than once a day.
 */

import { CACHE_TTL_TEAMS, ESPN } from '../config.js';
import type { PickerTeam } from '../shared/types.js';
import { cached } from './_lib/cache.js';
import { fetchEspnJson } from './_lib/http.js';
import { isMock } from './_lib/mock.js';
import type { ApiRequest, ApiResponse } from './_lib/types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** ESPN nests the list four levels deep, and has moved it before. Try the
 *  known shapes rather than assuming one. */
function extractTeams(raw: any): any[] {
  const candidates = [
    raw?.sports?.[0]?.leagues?.[0]?.teams,
    raw?.leagues?.[0]?.teams,
    raw?.teams,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  return [];
}

export function shrinkTeams(raw: any): PickerTeam[] {
  const out: PickerTeam[] = [];
  const seen = new Set<string>();

  for (const entry of extractTeams(raw)) {
    try {
      // Entries are either { team: {...} } or the team object directly.
      const t = entry?.team ?? entry;
      const id = t?.id != null ? String(t.id) : '';
      const displayName = typeof t?.displayName === 'string' ? t.displayName : null;
      const abbreviation = typeof t?.abbreviation === 'string' ? t.abbreviation : null;
      if (!id || !displayName || seen.has(id)) continue;
      seen.add(id);

      out.push({
        id,
        displayName,
        shortDisplayName:
          typeof t?.shortDisplayName === 'string' ? t.shortDisplayName : displayName,
        abbreviation: abbreviation ?? displayName.slice(0, 4).toUpperCase(),
        location: typeof t?.location === 'string' ? t.location : displayName,
        nickname: typeof t?.name === 'string' ? t.name : '',
        logo:
          (typeof t?.logos?.[0]?.href === 'string' ? t.logos[0].href : null) ??
          `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`,
        color: typeof t?.color === 'string' ? `#${t.color.replace(/^#/, '')}` : null,
      });
    } catch (err) {
      console.error('[api/teams] skipped malformed team:', err);
    }
  }

  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export default async function handler(_req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

  try {
    if (isMock()) {
      const { MOCK_SCOREBOARD } = await import('../fixtures/scoreboard.js');
      // Derive a picker list from the fixture slate so MOCK=1 has something
      // real to click on.
      const teams = new Map<string, PickerTeam>();
      for (const ev of MOCK_SCOREBOARD.events) {
        for (const c of ev.competitions[0].competitors) {
          const t = c.team as any;
          teams.set(String(t.id), {
            id: String(t.id),
            displayName: t.displayName,
            shortDisplayName: t.shortDisplayName,
            abbreviation: t.abbreviation,
            location: t.location,
            nickname: t.name,
            logo: t.logo,
            color: `#${String(t.color).replace(/^#/, '')}`,
          });
        }
      }
      res.status(200).json({
        teams: [...teams.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)),
        mock: true,
      });
      return;
    }

    const url = `${ESPN.teams}?limit=1000`;
    const result = await cached<PickerTeam[]>('teams', CACHE_TTL_TEAMS, async () =>
      shrinkTeams(await fetchEspnJson<unknown>(url, 12_000)),
    );
    res.status(200).json({ teams: result.value, stale: result.stale });
  } catch (err) {
    console.error('[api/teams] failed:', err);
    res.status(200).json({ teams: [], stale: true });
  }
}
