#!/usr/bin/env node
/**
 * Channel-title plausibility test.
 *
 *   npm run test:plausible
 *
 * A YouTube handle can resolve perfectly and still be the wrong channel.
 * Both of the first two cases below are REAL results from a live resolver run:
 * @Lions returned the Saitama Seibu Lions (a Japanese baseball team) and
 * @NFLonESPN returned a channel called "Lil Yeet". Each gave back a valid
 * 24-character id. The only signal anything was wrong was the title.
 */

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { titleLooksPlausible } = await server.ssrLoadModule('/api/resolve-channels.ts');

const cases = [
  // --- must be REJECTED: real wrong-channel hits from a live run ----------
  ['Detroit Lions', '埼玉西武ライオンズ', false],
  ['NFL on ESPN', 'Lil Yeet', false],
  ['Philadelphia Eagles', 'Eagles Band Official', true], // shares "eagles" — loose by design
  ['Detroit Lions', 'Some Random Vlogger', false],
  ['Sun Belt Conference', 'Cooking with Steve', false],
  ['NFL', '', false], // empty title must never pass
  // --- must be ACCEPTED: real correct hits --------------------------------
  ['NFL', 'NFL', true],
  ['NFL on FOX', 'NFL on FOX', true],
  ['Seattle Seahawks', 'Seattle Seahawks', true],
  ['Philadelphia Eagles', 'Philadelphia Eagles', true],
  ['SEC Network', 'SEC', true],
  ['Mountain West', 'MountainWestConf', true],       // substring, no shared token
  ['FOX College Football', 'CFB ON FOX', true],      // shares only "fox"
  ['Big Ten Football', 'Big Ten Football', true],
  ['ESPN College Football', 'ESPN College Football', true],
  ['NCAA', 'NCAA', true],
];

let pass = 0, fail = 0;
for (const [name, title, want] of cases) {
  const got = titleLooksPlausible(name, title);
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${String(got).padEnd(5)} want=${String(want).padEnd(5)} ` +
    `${name.padEnd(22)} -> ${JSON.stringify(title)}`,
  );
}
console.log(`\n${pass} passed, ${fail} failed`);
await server.close();
process.exit(fail ? 1 : 0);
