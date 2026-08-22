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
  handle: string;
  configured: string;
  resolved: string | null;
  title: string | null;
  error: string | null;
}

async function resolveAll(apiKey: string): Promise<Resolved[]> {
  return Promise.all(
    HIGHLIGHT_CHANNELS.map(async (channel): Promise<Resolved> => {
      const base: Resolved = {
        name: channel.name,
        handle: channel.handle,
        configured: channel.id,
        resolved: null,
        title: null,
        error: null,
      };
      try {
        const url =
          'https://www.googleapis.com/youtube/v3/channels' +
          `?part=id,snippet&forHandle=${encodeURIComponent(channel.handle)}` +
          `&key=${encodeURIComponent(apiKey)}`;
        const raw = await fetchJson<any>(url, 10_000);
        const item = raw?.items?.[0];
        if (!item?.id) return { ...base, error: 'no channel found for that handle' };
        return { ...base, resolved: String(item.id), title: item?.snippet?.title ?? null };
      } catch (err) {
        return { ...base, error: redact(String(err)).slice(0, 160) };
      }
    }),
  );
}

/** Plain text, because a person reads this in a browser tab. */
function render(rows: Resolved[]): string {
  const lines: string[] = [];
  const ok = rows.filter((r) => r.resolved);
  const failed = rows.filter((r) => !r.resolved);

  lines.push('CFB Saturday — YouTube channel ID resolver');
  lines.push('='.repeat(66));
  lines.push('');
  lines.push(`Resolved ${ok.length} of ${rows.length} channels. Cost: ~${rows.length} quota units.`);
  lines.push('');

  for (const r of rows) {
    const mark = !r.resolved ? 'FAIL' : r.resolved === r.configured ? ' ok ' : ' NEW';
    const detail = r.resolved ? `${r.resolved}  (${r.title ?? ''})` : (r.error ?? 'unknown error');
    lines.push(`  [${mark}] ${r.handle.padEnd(24)} ${detail}`);
  }

  lines.push('');
  lines.push('-'.repeat(66));
  lines.push('PASTE THIS into HIGHLIGHT_CHANNELS in config.ts');
  lines.push('(or just send this whole page to Claude and it will do it)');
  lines.push('-'.repeat(66));
  lines.push('');

  for (const r of rows) {
    // A failed lookup must not throw away an id we already had — fall back to
    // whatever is configured, and only emit TODO_VERIFY when there is nothing.
    const id = r.resolved ?? r.configured ?? 'TODO_VERIFY';
    const priority = HIGHLIGHT_CHANNELS.find((c) => c.handle === r.handle)?.priority;
    lines.push(
      `  { name: '${r.name}', id: '${id}', handle: '${r.handle}'` +
        (priority !== undefined ? `, priority: ${priority}` : '') +
        ' },',
    );
  }

  if (failed.length > 0) {
    lines.push('');
    lines.push(`${failed.length} handle(s) did not resolve: ${failed.map((f) => f.handle).join(', ')}`);
    lines.push('Check the handle at youtube.com/<handle>. Left as TODO_VERIFY above,');
    lines.push('which the app skips at runtime rather than polling a wrong id.');
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
