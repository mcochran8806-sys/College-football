#!/usr/bin/env node
/**
 * NFL matcher + relevance regression test.
 *
 *   npm run test:nfl
 *
 * The cases that matter are the two-team cities. "New York" and "Los Angeles"
 * each host two franchises, so a bare city name proves nothing — the same trap
 * bare "Miami" is in college. A title saying "New York vs Buffalo" must NOT
 * resolve, because there is no way to know which New York team it means.
 */

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { matchTitleToGame, relevanceFor, isHighlightReel } = await server.ssrLoadModule('/src/lib/matchTitle.ts');
const { shrinkScoreboard } = await server.ssrLoadModule('/api/_lib/espn.ts');
const { MOCK_NFL_SCOREBOARD } = await server.ssrLoadModule('/fixtures/nfl-scoreboard.ts');
const { NFL } = await server.ssrLoadModule('/shared/leagues/nfl.ts');
const { isFavoriteGame } = await server.ssrLoadModule('/shared/favorites.ts');

const games = shrinkScoreboard(MOCK_NFL_SCOREBOARD);
const label = (g) => `${g.away.abbreviation}@${g.home.abbreviation}`;

let pass = 0, fail = 0;
const check = (ok, line, detail) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
  if (!ok && detail) console.log(`        ${detail}`);
};

console.log(`--- slate: ${games.length} games ---`);

// ---- game matching -------------------------------------------------------
const matchCases = [
  ['Packers vs Lions | Game Highlights | NFL Week 2', 'GB@DET'],
  ['Seattle Seahawks vs San Francisco 49ers Highlights', 'SEA@SF'],
  ['Eagles at Cowboys | Full Game Highlights', 'PHI@DAL'],
  ['Niners hold off the Seahawks | Condensed Game', 'SEA@SF'],
  ['Philadelphia Eagles vs. Dallas Cowboys | Highlights', 'PHI@DAL'],
  // nickname-only, which is unique in the NFL where it isn't in college
  ['Jets vs Steelers Highlights', 'NYJ@PIT'],
  ['Giants vs Bills Highlights', 'NYG@BUF'],
  ['Rams vs Chiefs | Game Highlights', 'LAR@KC'],
  ['Chargers at Ravens | Highlights', 'LAC@BAL'],
  // --- the traps: a bare two-team city cannot resolve --------------------
  ['New York vs Buffalo Highlights', null],
  ['Los Angeles at Kansas City | Full Game Highlights', null],
  // --- must be rejected: college content on a pro wall -------------------
  ['Georgia vs Alabama | College Football Highlights', null],
  ['Ohio State at Michigan | NCAA Football Highlights', null],
  // --- other sports naming NFL cities ------------------------------------
  ['Detroit vs Philadelphia | MLB Highlights', null],
  ['Seattle vs Dallas | NBA Highlights', null],
];

console.log('\n--- game matching ---');
for (const [title, want] of matchCases) {
  const m = matchTitleToGame(title, games, NFL);
  const got = m ? label(m.game) : null;
  check(got === want, `${String(got).padEnd(9)} want=${String(want).padEnd(9)} ${JSON.stringify(title).slice(0, 58)}`,
    m ? `matched: ${JSON.stringify(m.matched)}` : null);
}

// ---- relevance -----------------------------------------------------------
console.log('\n--- relevance ---');
const relCases = [
  ['Packers vs Lions | Game Highlights', 'game'],
  ['Jared Goff mic’d up in the Lions win', 'team'],
  ['Every touchdown from NFL Week 2', 'topic'],
  ['College GameDay heads to Tuscaloosa', 'none'],
  ['NBA Finals Game 7 Highlights', 'none'],
  ['2026 Fantasy Football Advice: Players to AVOID', 'none'],
];
for (const [title, want] of relCases) {
  const got = relevanceFor(title, games, NFL);
  check(got === want, `${String(got).padEnd(6)} want=${String(want).padEnd(6)} ${JSON.stringify(title).slice(0, 58)}`);
}

// ---- favorites -----------------------------------------------------------
console.log('\n--- favorites (Lions, Seahawks, Eagles) ---');
const favs = ['Lions', 'Seahawks', 'Eagles'];
const favGames = games.filter((g) => isFavoriteGame(g, favs, NFL)).map(label);
check(
  favGames.length === 3 && ['GB@DET', 'SEA@SF', 'PHI@DAL'].every((g) => favGames.includes(g)),
  `matched ${favGames.length} favorite games: ${favGames.join(', ')}`,
);
// A favorite list must not accidentally match a two-team city.
const nyFavs = games.filter((g) => isFavoriteGame(g, ['New York'], NFL)).map(label);
check(nyFavs.length === 0, `bare "New York" as a favorite matches nothing (got ${nyFavs.length})`);
// but the specific team does
const jetsFavs = games.filter((g) => isFavoriteGame(g, ['Jets'], NFL)).map(label);
check(jetsFavs.length === 1 && jetsFavs[0] === 'NYJ@PIT', `"Jets" matches only NYJ@PIT (got ${jetsFavs.join(',') || 'none'})`);

// ---- reels ---------------------------------------------------------------
console.log('\n--- highlight-reel detection ---');
for (const [title, want] of [
  ['Packers vs Lions | Game Highlights', true],
  ['Every touchdown from NFL Week 2', true],
  ['Dan Campbell press conference after the win', false],
  ['Lions training camp: what to watch', false],
  ['NFL free agency tracker', false],
]) {
  const got = isHighlightReel(title);
  check(got === want, `reel=${String(got).padEnd(5)} want=${String(want).padEnd(5)} ${JSON.stringify(title).slice(0, 52)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
await server.close();
process.exit(fail ? 1 : 0);
