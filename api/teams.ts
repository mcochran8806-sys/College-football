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
import { q, type ApiRequest, type ApiResponse } from './_lib/types.js';

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

/** TEMPORARY probe: what fields does ESPN actually give us, and does any
 *  endpoint variant restrict to FBS? Removed once the filter is settled. */
async function probe(): Promise<unknown> {
  const urls: Record<string, string> = {
    plain: `${ESPN.teams}?limit=1000`,
    groups80: `${ESPN.teams}?groups=80&limit=1000`,
    group80: `${ESPN.teams}?group=80&limit=1000`,
    division: `${ESPN.teams}?division=fbs&limit=1000`,
    core80:
      'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/groups/80/teams?limit=300',
    standings:
      'https://site.api.espn.com/apis/v2/sports/football/college-football/standings?level=2',
  };
  const out: Record<string, unknown> = {};
  await Promise.all(
    Object.entries(urls).map(async ([name, url]) => {
      try {
        const raw = await fetchEspnJson<any>(url, 12_000);
        const teams = extractTeams(raw);
        out[name] = {
          count: teams.length || undefined,
          topKeys: Object.keys(raw ?? {}).slice(0, 10),
          sampleTeamKeys: teams[0] ? Object.keys(teams[0]?.team ?? teams[0]).slice(0, 40) : null,
          refCount: Array.isArray(raw?.items) ? raw.items.length : undefined,
        };
      } catch (err) {
        out[name] = { error: String(err).slice(0, 150) };
      }
    }),
  );
  return out;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

  if (q(req, 'probe') === '1') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(await probe());
    return;
  }

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

    // groups=80 restricts to FBS. Without it ESPN returns all 759 teams it
    // knows about, down through Division III and NAIA, and the picker becomes
    // a scroll past Adams State to find Alabama.
    const url = `${ESPN.teams}?${new URLSearchParams({ groups: '80', limit: '1000' }).toString()}`;
    const result = await cached<PickerTeam[]>('teams:fbs', CACHE_TTL_TEAMS, async () => {
      const teams = shrinkTeams(await fetchEspnJson<unknown>(url, 12_000));
      // FBS is ~134 schools. A much larger number means ESPN ignored groups=80
      // and we're serving every division again — worth a log line, but still
      // usable, so don't fail the request over it.
      if (teams.length > 250) {
        console.warn(`[api/teams] groups=80 appears to have been ignored: ${teams.length} teams`);
      }
      return teams;
    });
    res.status(200).json({ teams: result.value, stale: result.stale, count: result.value.length });
  } catch (err) {
    console.error('[api/teams] failed:', err);
    res.status(200).json({ teams: [], stale: true });
  }
}
