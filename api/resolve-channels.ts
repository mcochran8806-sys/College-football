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

import { CACHE_TTL_TEAMS, HIGHLIGHT_CHANNELS } from '../config.js';
import { cached } from './_lib/cache.js';
import { fetchJson, redact } from './_lib/http.js';
import type { ApiRequest, ApiResponse } from './_lib/types.js';

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
  error: string | null;
  /** Quota units spent on this channel — one per handle tried. */
  units: number;
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
async function resolveAll(apiKey: string): Promise<Resolved[]> {
  return Promise.all(
    HIGHLIGHT_CHANNELS.map(async (channel): Promise<Resolved> => {
      const base: Resolved = {
        name: channel.name,
        tried: [],
        matched: null,
        configured: channel.id,
        resolved: null,
        title: null,
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
            return { ...base, matched: handle, resolved: found.id, title: found.title };
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
function render(rows: Resolved[]): string {
  const lines: string[] = [];
  const ok = rows.filter((r) => r.resolved);
  const failed = rows.filter((r) => !r.resolved);
  const units = rows.reduce((n, r) => n + r.units, 0);

  lines.push('CFB Saturday — YouTube channel ID resolver');
  lines.push('='.repeat(70));
  lines.push('');
  lines.push(`Resolved ${ok.length} of ${rows.length} channels. Cost: ${units} quota units.`);
  lines.push('');

  for (const r of rows) {
    const mark = !r.resolved ? 'FAIL' : r.resolved === r.configured ? ' ok ' : ' NEW';
    if (r.resolved) {
      lines.push(`  [${mark}] ${r.name.padEnd(24)} ${r.matched}`);
      lines.push(`         ${''.padEnd(24)} ${r.resolved}  (${r.title ?? ''})`);
    } else {
      lines.push(`  [${mark}] ${r.name.padEnd(24)} none of: ${r.tried.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('-'.repeat(70));
  lines.push('PASTE THIS into HIGHLIGHT_CHANNELS in config.ts');
  lines.push('(or just send this whole page to Claude and it will do it)');
  lines.push('-'.repeat(70));
  lines.push('');

  for (const r of rows) {
    // A failed lookup must not throw away an id we already had.
    const id = r.resolved ?? r.configured ?? 'TODO_VERIFY';
    const source = HIGHLIGHT_CHANNELS.find((c) => c.name === r.name);
    const handles = r.matched ? `['${r.matched}']` : `['${(source?.handles ?? []).join("', '")}']`;
    lines.push(
      `  { name: '${r.name}', id: '${id}', handles: ${handles}` +
        (source?.priority !== undefined ? `, priority: ${source.priority}` : '') +
        ' },',
    );
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

export default async function handler(_req: ApiRequest, res: ApiResponse): Promise<void> {
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
    const result = await cached<Resolved[]>('resolve-channels', CACHE_TTL_TEAMS, () =>
      resolveAll(apiKey),
    );
    res.setHeader('Cache-Control', 's-maxage=86400');
    res.status(200).send(render(result.value));
  } catch (err) {
    console.error('[api/resolve-channels] failed:', err);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(`Resolver failed: ${redact(String(err))}\n`);
  }
}
