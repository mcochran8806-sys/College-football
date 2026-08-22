#!/usr/bin/env node
/**
 * One-time YouTube channel-ID resolver.
 *
 * Turns the @handles in config.ts into the 24-character UC... channel ids the
 * polling loop needs. Run it once, paste the output into config.ts, forget it
 * exists.
 *
 *   npm run resolve-channels
 *
 * QUOTA: uses channels.list?forHandle, which costs 1 unit per channel — about
 * a dozen units total. It deliberately does NOT use search.list (100 units) and
 * it is NOT part of any request path; nothing in /api ever calls this.
 *
 * Reads YOUTUBE_API_KEY from the environment or from .env.local.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  try {
    const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    const line = env.split('\n').find((l) => l.trim().startsWith('YOUTUBE_API_KEY='));
    if (line) return line.split('=').slice(1).join('=').trim();
  } catch {
    /* no .env.local, fall through */
  }
  return null;
}

/** Pulled straight out of config.ts without importing TypeScript. */
function readHandles() {
  const src = readFileSync(resolve(process.cwd(), 'config.ts'), 'utf8');
  const out = [];
  const re = /name:\s*'([^']+)',\s*id:\s*'([^']*)',\s*handles:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const handles = [...m[3].matchAll(/'([^']+)'/g)].map((h) => h[1]);
    out.push({ name: m[1], id: m[2], handles });
  }
  return out;
}

async function resolveHandle(handle, key) {
  const url =
    'https://www.googleapis.com/youtube/v3/channels' +
    `?part=id,snippet&forHandle=${encodeURIComponent(handle)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason ?? res.status;
    throw new Error(`${reason}`);
  }
  const item = body?.items?.[0];
  if (!item?.id) return null;
  return { id: item.id, title: item.snippet?.title ?? '' };
}

const key = loadKey();
if (!key) {
  console.error('YOUTUBE_API_KEY not found. Set it in the environment or .env.local.');
  process.exit(1);
}

const channels = readHandles();
const maxUnits = channels.reduce((n, c) => n + c.handles.length, 0);
console.log(`Resolving ${channels.length} channel(s). Cost: up to ${maxUnits} quota units.\n`);

const results = [];
for (const channel of channels) {
  let hit = null;
  let lastError = null;
  for (const handle of channel.handles) {
    try {
      const found = await resolveHandle(handle, key);
      if (found) {
        hit = { handle, ...found };
        break;
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  if (!hit) {
    console.log(`  ✗ ${channel.name.padEnd(24)} none of: ${channel.handles.join(', ')}` +
      (lastError ? `  (${lastError})` : ''));
    results.push({ ...channel, resolved: null, matched: null });
    continue;
  }

  const changed = hit.id !== channel.id;
  console.log(`  ${changed ? '→' : '✓'} ${channel.name.padEnd(24)} ${hit.handle}  ${hit.id}  (${hit.title})`);
  results.push({ ...channel, resolved: hit.id, matched: hit.handle });
}

const updates = results.filter((r) => r.resolved && r.resolved !== r.id);
const failures = results.filter((r) => !r.resolved);

console.log('\n' + '─'.repeat(72));
if (updates.length === 0) {
  console.log('Nothing to update — every handle already matches its configured id.');
} else {
  console.log('Paste these into HIGHLIGHT_CHANNELS in config.ts:\n');
  for (const r of updates) {
    console.log(`  { name: '${r.name}', id: '${r.resolved}', handles: ['${r.matched}'] },`);
  }
}
if (failures.length > 0) {
  console.log(
    `\n${failures.length} channel(s) did not resolve: ${failures.map((f) => f.name).join(', ')}`,
  );
  console.log('Find the channel on youtube.com, use Share channel -> Copy channel ID.');
  console.log('A wrong id returns an empty playlist and fails silently, which is why we do not guess.');
}
