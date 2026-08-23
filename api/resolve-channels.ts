/**
 * GET /api/resolve-channels
 *
 * One-off helper: turns the @handles in config.ts into the UC... channel ids
 * the polling loop needs, using the YOUTUBE_API_KEY already set in this
 * project's environment. Visit it in a browser, copy the block it prints into
 * config.ts, done — no local checkout or Node install required.
 *
 * QUOTA: channels.list costs 1 unit per handle, so about 12 units per run
 * against a 10,000/day budget. The result is cached for 24h because channel
 * ids never change, which also means a stranger refreshing this URL can't burn
 * the day's quota.
 *
 * This is not in any polling path — nothing calls it but a person.
 */

import { CACHE_TTL_TEAMS, LEAGUE_SETTINGS } from '../config.js';
import type { HighlightChannel, LeagueConfig } from '../shared/leagues/types.js';
import { cached } from './_lib/cache.js';
import { fetchJson, redact } from './_lib/http.js';
import { leagueOf, type ApiRequest, type ApiResponse } from './_lib/types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Resolved {
  name: string;
  /** Every handle we tried, in order. */
  tried: string[];
  /** The one that worked. */
  matched: string | null;
  configured: string;
  resolved: string | null;
  title: string | null;
  /** False when the resolved channel's title has nothing to do with the name
   *  we configured — a handle squatting on the wrong channel. */
  plausible: boolean;
  error: string | null;
  /** Quota units spent on this channel — one per handle tried. */
  units: number;
}

/**
 * Does the channel this handle resolved to plausibly belong to the thing we
 * asked for?
 *
 * A handle can resolve perfectly and still be the wrong channel — @Lions is a
 * Japanese baseball team (埼玉西武ライオンズ), and @NFLonESPN belongs to
 * someone called "Lil Yeet". Both returned valid 24-character ids. The only
 * signal that anything is wrong is the channel title, so compare it.
 *
 * Deliberately loose: "FOX College Football" vs "CFB ON FOX" shares only the
 * token "fox", and "Mountain West" vs "MountainWestConf" shares no token at
 * all but is a clear substring. Either is enough. What must fail is having
 * nothing in common.
 */
export function titleLooksPlausible(configuredName: string, channelTitle: string): boolean {
  const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tokens = (v: string) =>
    v
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3);

  const nameSquashed = squash(configuredName);
  const titleSquashed = squash(channelTitle);

  // A title with no Latin characters at all (a Japanese channel name) can't be
  // compared — and an empty string is a substring of everything, so guard it.
  if (!titleSquashed || !nameSquashed) return false;

  if (titleSquashed.includes(nameSquashed) || nameSquashed.includes(titleSquashed)) return true;

  const titleTokens = new Set(tokens(channelTitle));
  return tokens(configuredName).some((t) => titleTokens.has(t));
}

async function lookup(handle: string, apiKey: string): Promise<{ id: string; title: string | null } | null> {
  const url =
    'https://www.googleapis.com/youtube/v3/channels' +
    `?part=id,snippet&forHandle=${encodeURIComponent(handle)}` +
    `&key=${encodeURIComponent(apiKey)}`;
  const raw = await fetchJson<any>(url, 10_000);
  const item = raw?.items?.[0];
  if (!item?.id) return null;
  return { id: String(item.id), title: item?.snippet?.title ?? null };
}

/**
 * Try each candidate handle in order and stop at the first that resolves.
 *
 * Networks rename their channels, and the obvious handle is frequently wrong,
 * so rather than guessing one spelling per channel we let the API arbitrate a
 * short list. Costs 1 unit per handle actually tried.
 */
async function resolveAll(apiKey: string, channels: HighlightChannel[]): Promise<Resolved[]> {
  return Promise.all(
    channels.map(async (channel): Promise<Resolved> => {
      const base: Resolved = {
        name: channel.name,
        tried: [],
        matched: null,
        configured: channel.id,
        resolved: null,
        title: null,
        plausible: true,
        error: null,
        units: 0,
      };

      let lastError: string | null = null;
      for (const handle of channel.handles) {
        base.tried.push(handle);
        base.units += 1;
        try {
          const found = await lookup(handle, apiKey);
          if (found) {
            const plausible = titleLooksPlausible(channel.name, found.title ?? '');
            if (!plausible) {
              // Keep trying the remaining candidates — a later one may be the
              // real channel. Only fall back to this if nothing better turns up.
              console.warn(
                `[resolve-channels] ${handle} resolved to "${found.title}", which does not ` +
                  `look like "${channel.name}" — continuing to other candidates`,
              );
              if (!base.resolved) {
                base.matched = handle;
                base.resolved = found.id;
                base.title = found.title;
                base.plausible = false;
              }
              continue;
            }
            return { ...base, matched: handle, resolved: found.id, title: found.title, plausible: true };
          }
        } catch (err) {
          lastError = redact(String(err)).slice(0, 120);
        }
      }

      return { ...base, error: lastError ?? 'no channel found for any candidate handle' };
    }),
  );
}

/** Plain text, because a person reads this in a browser tab. */
function render(rows: Resolved[], league: LeagueConfig, channels: HighlightChannel[]): string {
  const lines: string[] = [];
  const ok = rows.filter((r) => r.resolved && r.plausible);
  const failed = rows.filter((r) => !r.resolved && r.plausible);
  const units = rows.reduce((n, r) => n + r.units, 0);

  lines.push(`YouTube channel ID resolver — ${league.label}`);
  lines.push('='.repeat(70));
  lines.push('');
  lines.push(`Resolved ${ok.length} of ${rows.length} channels. Cost: ${units} quota units.`);
  lines.push('');

  const suspect = rows.filter((r) => r.resolved && !r.plausible);

  for (const r of rows) {
    const mark = !r.resolved
      ? 'FAIL'
      : !r.plausible
        ? 'WRONG'
        : r.resolved === r.configured
          ? ' ok '
          : ' NEW';
    if (r.resolved) {
      lines.push(`  [${mark}] ${r.name.padEnd(24)} ${r.matched}`);
      lines.push(
        `         ${''.padEnd(24)} ${r.resolved}  (${r.title ?? ''})` +
          (r.plausible ? '' : '   <-- title does not match, NOT used'),
      );
    } else {
      lines.push(`  [${mark}] ${r.name.padEnd(24)} none of: ${r.tried.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('-'.repeat(70));
  lines.push(`PASTE THIS into LEAGUE_SETTINGS.${league.id}.channels in config.ts`);
  lines.push('(or just send this whole page to Claude and it will do it)');
  lines.push('-'.repeat(70));
  lines.push('');

  for (const r of rows) {
    // A failed lookup must not throw away an id we already had — and an
    // implausible one is treated as a failure, not adopted.
    const id = (r.plausible ? r.resolved : null) ?? r.configured ?? 'TODO_VERIFY';
    const source = channels.find((c) => c.name === r.name);
    const handles = r.matched ? `['${r.matched}']` : `['${(source?.handles ?? []).join("', '")}']`;
    lines.push(
      `  { name: '${r.name}', id: '${id}', handles: ${handles}` +
        (source?.priority !== undefined ? `, priority: ${source.priority}` : '') +
        ' },',
    );
  }

  if (suspect.length > 0) {
    lines.push('');
    lines.push(
      `${suspect.length} handle(s) resolved to an unrelated channel and were NOT adopted:`,
    );
    for (const r of suspect) {
      lines.push(`  ${r.matched} -> "${r.title}" (wanted "${r.name}")`);
    }
    lines.push('Someone else holds that handle. Find the real channel on youtube.com');
    lines.push('and use Share channel -> Copy channel ID.');
  }

  if (failed.length > 0) {
    lines.push('');
    lines.push(`${failed.length} channel(s) unresolved: ${failed.map((f) => f.name).join(', ')}`);
    lines.push('None of their candidate handles exist. Open youtube.com, find the');
    lines.push('channel, use Share channel -> Copy channel ID, and send that instead.');
    lines.push('Left as TODO_VERIFY, which the app skips rather than polling a wrong id.');
  }

  lines.push('');
  return lines.join('\n');
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const league = leagueOf(req);
  const channels = LEAGUE_SETTINGS[league.id].channels;
  const apiKey = process.env.YOUTUBE_API_KEY;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (!apiKey) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(
      'YOUTUBE_API_KEY is not set on this deployment.\n\n' +
        'Add it in Vercel -> Project -> Settings -> Environment Variables,\n' +
        'redeploy, then reload this page.\n',
    );
    return;
  }

  try {
    // Channel ids never change, so cache hard: a refresh can't burn quota.
    const result = await cached<Resolved[]>(`resolve-channels:${league.id}`, CACHE_TTL_TEAMS, () =>
      resolveAll(apiKey, channels),
    );
    res.setHeader('Cache-Control', 's-maxage=86400');
    res.status(200).send(render(result.value, league, channels));
  } catch (err) {
    console.error('[api/resolve-channels] failed:', err);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(`Resolver failed: ${redact(String(err))}\n`);
  }
}
