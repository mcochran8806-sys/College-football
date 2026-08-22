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
        conference: null,
      });
    } catch (err) {
      console.error('[api/teams] skipped malformed team:', err);
    }
  }

  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * FBS membership, via the standings tree.
 *
 * The teams endpoint can't do this: it ignores groups=80, group=80 and
 * division= alike (all four variants return the same 759 teams, down through
 * Division III), and the team objects carry no conference or division field to
 * filter on — measured against the live API, not assumed.
 *
 * The standings endpoint does return a conference tree, so we walk it for team
 * ids. Shape is unverified beyond the top level, so the walk is recursive and
 * tolerant: any node carrying standings.entries[].team contributes.
 */
async function fbsTeamIds(): Promise<Map<string, string | null>> {
  const raw = await fetchEspnJson<any>(
    'https://site.api.espn.com/apis/v2/sports/football/college-football/standings?level=2',
    12_000,
  );

  // id -> conference name. Keeps the OUTERMOST conference, so a team in a
  // divisioned conference groups under "ACC" rather than "ACC Atlantic".
  const ids = new Map<string, string | null>();

  const visit = (node: any, depth: number, conference: string | null): void => {
    if (!node || typeof node !== 'object' || depth > 6) return;

    const name = typeof node?.name === 'string' ? node.name : null;
    const conf = conference ?? (node?.isConference === true && name ? name : null);

    const entries = node?.standings?.entries;
    if (Array.isArray(entries)) {
      for (const e of entries) {
        const id = e?.team?.id;
        if (id != null) ids.set(String(id), conf ?? name);
      }
    }
    if (Array.isArray(node?.children)) {
      for (const child of node.children) visit(child, depth + 1, conf);
    }
  };

  visit(raw, 0, null);
  return ids;
}

/** FBS is ~134 schools. Anything far outside this means the shape moved and
 *  the filter should be ignored rather than trusted. */
function plausibleFbsCount(n: number): boolean {
  return n >= 100 && n <= 200;
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
            conference: null,
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
      // The teams list has the good logos and colors; standings has the FBS
      // membership. Fetch both and intersect.
      const [all, ids] = await Promise.all([
        fetchEspnJson<unknown>(url, 12_000).then(shrinkTeams),
        fbsTeamIds().catch((err) => {
          console.warn('[api/teams] standings lookup failed, serving unfiltered:', err);
          return new Map<string, string | null>();
        }),
      ]);

      if (!plausibleFbsCount(ids.size)) {
        console.warn(
          `[api/teams] FBS filter yielded ${ids.size} ids (expected 100-200); ` +
            `serving all ${all.length} teams unfiltered.`,
        );
        return all;
      }

      const filtered = all
        .filter((t) => ids.has(t.id))
        .map((t) => ({ ...t, conference: ids.get(t.id) ?? null }));
      // Don't let an id-format mismatch silently empty the picker.
      if (!plausibleFbsCount(filtered.length)) {
        console.warn(
          `[api/teams] FBS filter matched only ${filtered.length} of ${all.length}; serving unfiltered.`,
        );
        return all;
      }
      return filtered;
    });
    res.status(200).json({ teams: result.value, count: result.value.length, stale: result.stale });
  } catch (err) {
    console.error('[api/teams] failed:', err);
    res.status(200).json({ teams: [], stale: true });
  }
}
