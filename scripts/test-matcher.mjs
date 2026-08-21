#!/usr/bin/env node
/**
 * Title-matcher regression test.
 *
 *   npm run test:matcher
 *
 * Runs the real matcher against the real fixture slate through Vite's SSR
 * loader, so it exercises the same code the wall does. The interesting cases
 * are the negatives: a single-team title, a roundup, and two teams that are on
 * the slate but not in the SAME game must all be rejected.
 */

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { matchTitleToGame, normalizeTitle } = await server.ssrLoadModule('/src/lib/matchTitle.ts');
const { shrinkScoreboard } = await server.ssrLoadModule('/api/_lib/espn.ts');
const { MOCK_SCOREBOARD } = await server.ssrLoadModule('/fixtures/scoreboard.ts');

const games = shrinkScoreboard(MOCK_SCOREBOARD);
const label = (g) => `${g.away.abbreviation}@${g.home.abbreviation}`;

const cases = [
  ['#2 Georgia Bulldogs vs #8 Alabama Crimson Tide | Full Game Highlights | 2025 College Football', 'UGA@ALA'],
  ['Georgia Tech vs Clemson 🏈 Extended Highlights | ACC Football', 'GT@CLEM'],
  ['Ohio State at Michigan | Extended Highlights | Big Ten Football', 'OSU@MICH'],
  ['Ole Miss at LSU Highlights | SEC Football 2025', 'MISS@LSU'],
  ['Texas AM vs. Texas | FULL GAME HIGHLIGHTS | 11/8/2025', 'TEX@TA&M'],
  ['Notre Dame at Pitt — Highlights', 'ND@PITT'],
  ['Florida State vs Miami Hurricanes | Extended Highlights', 'FSU@MIA'],
  ['App State vs Coastal Carolina | Sun Belt Highlights 2025', 'APP@CCU'],
  // must NOT match
  ['Alabama Crimson Tide Top Plays of the Week 🔥', null],
  ['Top 10 Plays of College Football Week 11 | ESPN CFB', null],
  ['Georgia and Ohio State are on a collision course | College GameDay', null],
  // trickier
  ['Bama vs Georgia | Extended Highlights', 'UGA@ALA'],
  ['Miami highlights', null],
  ['UGA at Alabama full game', 'UGA@ALA'],
  ['Pittsburgh Panthers vs Notre Dame Fighting Irish Highlights', 'ND@PITT'],
  ['Texas Longhorns vs Texas A&M Aggies | Highlights', 'TEX@TA&M'],
];

let pass = 0, fail = 0;
for (const [title, expected] of cases) {
  const m = matchTitleToGame(title, games);
  const got = m ? label(m.game) : null;
  const ok = got === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(title).slice(0,62).padEnd(64)} got=${String(got).padEnd(10)} want=${expected}`);
  if (!ok) console.log(`        normalized: "${normalizeTitle(title)}"  matched: ${m ? JSON.stringify(m.matched) : '—'}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
await server.close();
process.exit(fail ? 1 : 0);
