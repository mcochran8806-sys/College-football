import type { LeagueConfig, AliasEntry } from './types.js';

/**
 * The NFL.
 *
 * Easier than college in one way and harder in another. Easier: all 32
 * nicknames are unique, so "Seahawks" alone identifies a team where "Bulldogs"
 * identifies four schools. Harder: two cities host two teams each, so a bare
 * "New York" or "Los Angeles" is unresolvable — the same trap bare "Miami" is
 * in college.
 *
 * Relocations also linger in titles and archive uploads for years, so the old
 * cities are kept as aliases.
 */
const ALIASES: AliasEntry[] = [
  { canonical: 'Arizona', aliases: ['cardinals', 'arizona cardinals', 'cards', 'ari'] },
  { canonical: 'Atlanta', aliases: ['falcons', 'atlanta falcons', 'dirty birds'] },
  { canonical: 'Baltimore', aliases: ['ravens', 'baltimore ravens'] },
  { canonical: 'Buffalo', aliases: ['bills', 'buffalo bills', 'bills mafia'] },
  { canonical: 'Carolina', aliases: ['panthers', 'carolina panthers'] },
  { canonical: 'Chicago', aliases: ['bears', 'chicago bears', 'da bears'] },
  { canonical: 'Cincinnati', aliases: ['bengals', 'cincinnati bengals', 'cincy'] },
  { canonical: 'Cleveland', aliases: ['browns', 'cleveland browns'] },
  { canonical: 'Dallas', aliases: ['cowboys', 'dallas cowboys', 'americas team'] },
  { canonical: 'Denver', aliases: ['broncos', 'denver broncos'] },
  { canonical: 'Detroit', aliases: ['lions', 'detroit lions', 'motor city'] },
  { canonical: 'Green Bay', aliases: ['packers', 'green bay packers', 'the pack', 'gb'] },
  { canonical: 'Houston', aliases: ['texans', 'houston texans'] },
  { canonical: 'Indianapolis', aliases: ['colts', 'indianapolis colts', 'indy'] },
  { canonical: 'Jacksonville', aliases: ['jaguars', 'jacksonville jaguars', 'jags'] },
  { canonical: 'Kansas City', aliases: ['chiefs', 'kansas city chiefs', 'kc chiefs'] },
  {
    canonical: 'Las Vegas',
    // Oakland lingers in archive uploads and in fan shorthand.
    aliases: ['raiders', 'las vegas raiders', 'oakland raiders', 'lv raiders'],
  },
  {
    canonical: 'Los Angeles Chargers',
    aliases: ['chargers', 'la chargers', 'los angeles chargers', 'san diego chargers', 'bolts'],
  },
  {
    canonical: 'Los Angeles Rams',
    aliases: ['rams', 'la rams', 'los angeles rams', 'st louis rams'],
  },
  { canonical: 'Miami', aliases: ['dolphins', 'miami dolphins', 'fins', 'phins'] },
  { canonical: 'Minnesota', aliases: ['vikings', 'minnesota vikings', 'vikes', 'skol'] },
  { canonical: 'New England', aliases: ['patriots', 'new england patriots', 'pats'] },
  { canonical: 'New Orleans', aliases: ['saints', 'new orleans saints', 'who dat'] },
  { canonical: 'New York Giants', aliases: ['giants', 'ny giants', 'new york giants', 'big blue'] },
  { canonical: 'New York Jets', aliases: ['jets', 'ny jets', 'new york jets', 'gang green'] },
  { canonical: 'Philadelphia', aliases: ['eagles', 'philadelphia eagles', 'philly', 'birds'] },
  { canonical: 'Pittsburgh', aliases: ['steelers', 'pittsburgh steelers', 'steel curtain'] },
  {
    canonical: 'San Francisco',
    aliases: ['49ers', 'san francisco 49ers', 'niners', 'forty niners', 'sf'],
  },
  { canonical: 'Seattle', aliases: ['seahawks', 'seattle seahawks', 'hawks', '12s'] },
  { canonical: 'Tampa Bay', aliases: ['buccaneers', 'tampa bay buccaneers', 'bucs', 'tampa'] },
  { canonical: 'Tennessee', aliases: ['titans', 'tennessee titans'] },
  {
    canonical: 'Washington',
    // The franchise has had three names this decade; archives use all of them.
    aliases: ['commanders', 'washington commanders', 'washington football team', 'wft'],
  },
];

/**
 * Two cities host two teams each, so the city alone proves nothing. Same
 * problem bare "Miami" has in college: the title has to say which one.
 */
const AMBIGUOUS = [
  'new york', // Giants / Jets
  'ny',
  'los angeles', // Rams / Chargers
  'la',
  'ne', // New England, but also a compass direction
  'gb', // used above only as part of a longer alias
];

export const NFL: LeagueConfig = {
  id: 'nfl',
  label: 'NFL',
  espn: {
    scoreboard: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
    summary: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary',
    teams: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
    // No groups filter — that's an FBS thing. limit is harmless and future-proof.
    params: { limit: '100' },
  },
  // ESPN's NFL teams endpoint already returns exactly the 32 franchises.
  restrictTeamsViaStandings: false,
  expectedTeamCount: { min: 28, max: 40 },
  aliases: ALIASES,
  ambiguousTokens: AMBIGUOUS,
  topics: [
    'nfl',
    'monday night football',
    'sunday night football',
    'thursday night football',
    'afc',
    'nfc',
    'super bowl',
    'pro bowl',
    'training camp',
    'preseason',
    'week 1',
    'wild card',
    'divisional round',
    'conference championship',
  ],
  offTopic: [
    // college, which several of these channels also cover heavily
    'college football', 'ncaa', 'ncaaf', 'cfb', 'college gameday', 'heisman',
    'bowl game', 'recruiting', 'signing day',
    // other sports
    'little league', 'world series', 'wbb', 'mbb', 'basketball', 'volleyball',
    'soccer', 'baseball', 'softball', 'lacrosse', 'hockey', 'golf', 'tennis',
    'gymnastics', 'track and field', 'swimming', 'wrestling',
    // other leagues
    'nba', 'wnba', 'mlb', 'nhl', 'mls', 'premier league', 'ufc', 'nascar',
    'formula 1', 'liv',
    // adjacent but not game content
    'fantasy football', 'mock draft',
  ],
};
