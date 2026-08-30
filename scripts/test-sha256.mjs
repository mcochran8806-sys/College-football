#!/usr/bin/env node
/**
 * Cross-checks the hand-rolled SHA-256 against Node's crypto.
 *
 *   npm run test:sha256
 *
 * It exists because crypto.subtle is unavailable in a non-secure context, and
 * the deck is served over plain http by design — so obs-websocket's auth hash
 * has to be computed by hand. A wrong hash fails as an opaque auth rejection,
 * which is exactly the kind of bug worth pinning down with a test.
 */

import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { sha256, base64, utf8, obsAuthString } = await server.ssrLoadModule('/src/lib/sha256.ts');

let pass = 0;
let fail = 0;
const check = (ok, line) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
};

const cases = [
  '',
  'abc',
  'password123',
  'The quick brown fox jumps over the lazy dog',
  // Spans a block boundary, where padding bugs live.
  'x'.repeat(55),
  'x'.repeat(56),
  'x'.repeat(64),
  'x'.repeat(1000),
  '🏈 Georgia vs Alabama',
];

for (const s of cases) {
  const mine = base64(sha256(utf8(s)));
  const node = createHash('sha256').update(s, 'utf8').digest('base64');
  check(mine === node, `sha256(${JSON.stringify(s.slice(0, 24))}${s.length > 24 ? '…' : ''})`);
}

// The full obs-websocket v5 derivation:
//   base64(sha256(base64(sha256(password + salt)) + challenge))
for (const [pw, salt, challenge] of [
  ['secret', 'saltyvalue', 'chal'],
  ['', 'salt', 'challenge'],
  ['p@ss word!', 'AAAA/BBBB==', 'ZZZZ+1234=='],
]) {
  const secret = createHash('sha256').update(pw + salt, 'utf8').digest('base64');
  const expected = createHash('sha256').update(secret + challenge, 'utf8').digest('base64');
  check(obsAuthString(pw, salt, challenge) === expected, `obsAuthString(${JSON.stringify(pw)})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
await server.close();
process.exit(fail ? 1 : 0);
