#!/usr/bin/env node
/**
 * Relevance-gate regression test.
 *
 *   npm run test:relevance
 *
 * Every title below is REAL — taken from the live /api/highlights payload on
 * 2026-08-21. The important cases are the rejections: two of these name two
 * FBS schools and say "Full Game Highlights" but are Little League baseball
 * and an SEC basketball tournament.
 */

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { cfbRelevance, matchTitleToGame, isNonCfbContent } = await server.ssrLoadModule('/src/lib/matchTitle.ts');
const { shrinkScoreboard } = await server.ssrLoadModule('/api/_lib/espn.ts');
const { MOCK_SCOREBOARD } = await server.ssrLoadModule('/fixtures/scoreboard.ts');
const games = shrinkScoreboard(MOCK_SCOREBOARD);

const cases = [
  // --- must be REJECTED: other sports naming two FBS schools -------------
  ['DRAMATIC ENDING 🔥 Washington vs. Texas | Full Game Highlights | Little League World Series', 'none'],
  ['2023 SEC MBB Tourney Championship Texas A&M Aggies vs. Alabama Crimson Tide | Game Highlights', 'none'],
  ['2023 SEC WBB Tourney Championship Tennessee Volunteers vs South Carolina Gamecocks | Condensed Game', 'none'],
  ['Texas vs. Arizona State Highlights (8.20.26) | 2026 Big 12 Women’s Soccer', 'none'],
  // --- must be REJECTED: not college football at all ----------------------
  ['Giannis is going to EAT with Klay Thompson beside him ⏳', 'none'],
  ['DeMar DeRozan, Nuggets agree to 1-year, $3.9 million deal 🚨', 'none'],
  ['2026 Fantasy Football Advice: Players to AVOID Drafting to your Team!', 'none'],
  ['LIV Golf Indianapolis Tournament Round 2 2026 | Golf on FOX', 'none'],
  ['NFL Preseason Game Preview: Falcons vs Colts | Predictions + Picks to Win', 'none'],
  ['Never forget 😂', 'none'],
  // --- should be KEPT as filler: real college football --------------------
  // Northwestern isn't on the fixture slate, so it lands as 'topic' via
  // "fall camp" rather than 'team'. Either way it is KEPT, which is the point.
  ['2026 Northwestern Fall Training Camp: David Braun Enters his Fourth Season', 'topic'],
  ['Alabama Fall Camp: what changed on offense', 'team'],
  ['Ohio State Preseason No. 1, Ryan Day’s Coaching Success, and Fall Camp Storylines | B1G Today', 'team'],
  ['Marcus Spears has his LSU Tigers going a PERFECT 12-0 😮 | First Take', 'team'],
  ['2026 Mountain West Preseason Top Five Wide Receivers', 'topic'],
  ['Top 10 Plays of College Football Week 11 | ESPN CFB', 'topic'],
  // --- should MATCH a real game ------------------------------------------
  ['#2 Georgia Bulldogs vs #8 Alabama Crimson Tide | Full Game Highlights', 'game'],
  ['Georgia Tech vs Clemson 🏈 Extended Highlights | ACC Football', 'game'],
];

let pass = 0, fail = 0;
for (const [title, want] of cases) {
  const got = cfbRelevance(title, games);
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(got).padEnd(6)} want=${String(want).padEnd(6)} ${JSON.stringify(title).slice(0, 66)}`);
  if (!ok) {
    console.log(`        nonCfb=${isNonCfbContent(title)} gameMatch=${!!matchTitleToGame(title, games)}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
await server.close();
process.exit(fail ? 1 : 0);
