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
  const re = /\{\s*name:\s*'([^']+)',\s*id:\s*'([^']*)',\s*handle:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ name: m[1], id: m[2], handle: m[3] });
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
console.log(`Resolving ${channels.length} channel handle(s). Cost: ~${channels.length} quota units.\n`);

const results = [];
for (const channel of channels) {
  try {
    const found = await resolveHandle(channel.handle, key);
    if (!found) {
      console.log(`  ✗ ${channel.handle.padEnd(26)} no channel found`);
      results.push({ ...channel, resolved: null });
      continue;
    }
    const changed = found.id !== channel.id;
    console.log(
      `  ${changed ? '→' : '✓'} ${channel.handle.padEnd(26)} ${found.id}  (${found.title})`,
    );
    results.push({ ...channel, resolved: found.id });
  } catch (err) {
    console.log(`  ✗ ${channel.handle.padEnd(26)} ${err.message}`);
    results.push({ ...channel, resolved: null });
  }
}

const updates = results.filter((r) => r.resolved && r.resolved !== r.id);
const failures = results.filter((r) => !r.resolved);

console.log('\n' + '─'.repeat(72));
if (updates.length === 0) {
  console.log('Nothing to update — every handle already matches its configured id.');
} else {
  console.log('Paste these into HIGHLIGHT_CHANNELS in config.ts:\n');
  for (const r of updates) {
    console.log(`  { name: '${r.name}', id: '${r.resolved}', handle: '${r.handle}' },`);
  }
}
if (failures.length > 0) {
  console.log(
    `\n${failures.length} handle(s) did not resolve: ${failures.map((f) => f.handle).join(', ')}`,
  );
  console.log('Check the handle on youtube.com/@handle — leave the id as TODO_VERIFY until then.');
  console.log('A wrong id returns an empty playlist and fails silently, which is why we do not guess.');
}
