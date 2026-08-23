import type { LeagueConfig, AliasEntry } from './types.js';

/**
 * College football.
 *
 * groups=80 (FBS) and limit=100 are BOTH required on the scoreboard. Without
 * them ESPN quietly returns ~17 games instead of the full slate.
 */

const ALIASES: AliasEntry[] = [
  { canonical: 'Ole Miss', aliases: ['ole miss', 'mississippi', 'rebels', 'the rebels'] },
  { canonical: 'Mississippi State', aliases: ['mississippi state', 'miss state', 'miss st', 'bulldogs of starkville'] },
  { canonical: 'Pittsburgh', aliases: ['pitt', 'pittsburgh', 'panthers'] },
  { canonical: 'Miami', aliases: ['miami fl', 'miami florida', 'miami hurricanes', 'the u', 'hurricanes', 'canes'] },
  { canonical: 'Miami (OH)', aliases: ['miami oh', 'miami ohio', 'miami redhawks', 'redhawks'] },
  { canonical: 'Texas A&M', aliases: ['texas a m', 'texas am', 'texas a and m', 'aggies', 'tamu'] },
  { canonical: 'USC', aliases: ['usc', 'southern california', 'southern cal', 'trojans'] },
  { canonical: 'LSU', aliases: ['lsu', 'louisiana state', 'tigers of baton rouge'] },
  { canonical: 'UCF', aliases: ['ucf', 'central florida', 'knights'] },
  { canonical: 'South Florida', aliases: ['usf', 'south florida'] },
  { canonical: 'UAB', aliases: ['uab', 'alabama birmingham'] },
  { canonical: 'UTSA', aliases: ['utsa', 'texas san antonio'] },
  { canonical: 'UTEP', aliases: ['utep', 'texas el paso'] },
  { canonical: 'SMU', aliases: ['smu', 'southern methodist', 'mustangs'] },
  { canonical: 'TCU', aliases: ['tcu', 'texas christian', 'horned frogs'] },
  { canonical: 'BYU', aliases: ['byu', 'brigham young', 'cougars of provo'] },
  { canonical: 'Ohio State', aliases: ['ohio state', 'buckeyes', 'tosu'] },
  { canonical: 'Oklahoma State', aliases: ['oklahoma state', 'okla state', 'okstate', 'cowboys of stillwater'] },
  { canonical: 'NC State', aliases: ['nc state', 'north carolina state', 'ncsu', 'wolfpack'] },
  { canonical: 'North Carolina', aliases: ['unc', 'north carolina', 'tar heels', 'tarheels'] },
  { canonical: 'Georgia Tech', aliases: ['georgia tech', 'ga tech', 'gt', 'yellow jackets', 'jackets'] },
  { canonical: 'Georgia', aliases: ['georgia', 'uga', 'georgia bulldogs', 'dawgs'] },
  { canonical: 'Alabama', aliases: ['alabama', 'bama', 'crimson tide', 'roll tide'] },
  { canonical: 'Florida State', aliases: ['florida state', 'fsu', 'seminoles', 'noles'] },
  { canonical: 'Penn State', aliases: ['penn state', 'psu', 'nittany lions'] },
  { canonical: 'Michigan State', aliases: ['michigan state', 'mich state', 'sparty', 'spartans'] },
  { canonical: 'Louisiana', aliases: ['louisiana lafayette', 'ul lafayette', 'ragin cajuns', 'cajuns'] },
  { canonical: 'UL Monroe', aliases: ['ulm', 'louisiana monroe', 'warhawks'] },
  { canonical: 'Southern Miss', aliases: ['southern miss', 'southern mississippi', 'golden eagles'] },
  { canonical: 'Appalachian State', aliases: ['appalachian state', 'app state', 'mountaineers of boone'] },
  { canonical: 'Coastal Carolina', aliases: ['coastal carolina', 'coastal', 'chanticleers'] },
  { canonical: 'Middle Tennessee', aliases: ['middle tennessee', 'mtsu', 'middle tenn', 'blue raiders'] },
  { canonical: 'Western Kentucky', aliases: ['western kentucky', 'wku', 'hilltoppers'] },
  { canonical: 'Florida Atlantic', aliases: ['florida atlantic', 'fau', 'owls of boca'] },
  { canonical: 'Florida International', aliases: ['florida international', 'fiu'] },
  { canonical: 'San Jose State', aliases: ['san jose state', 'sjsu', 'san jose st'] },
  { canonical: 'Fresno State', aliases: ['fresno state', 'fresno', 'bulldogs of fresno'] },
  { canonical: 'Boise State', aliases: ['boise state', 'boise', 'broncos of boise'] },
  { canonical: 'Washington State', aliases: ['washington state', 'wash state', 'wazzu', 'cougs'] },
  { canonical: 'Oregon State', aliases: ['oregon state', 'ore state', 'beavers'] },
  { canonical: 'Virginia Tech', aliases: ['virginia tech', 'va tech', 'vt', 'hokies'] },
  { canonical: 'Virginia', aliases: ['uva', 'virginia cavaliers', 'cavaliers', 'wahoos'] },
  { canonical: 'Notre Dame', aliases: ['notre dame', 'fighting irish', 'the irish'] },
  { canonical: 'Arizona State', aliases: ['arizona state', 'ariz state', 'sun devils'] },
  { canonical: 'Kansas State', aliases: ['kansas state', 'k state', 'kstate', 'wildcats of manhattan'] },
  { canonical: 'Iowa State', aliases: ['iowa state', 'cyclones'] },
  { canonical: 'Hawai\'i', aliases: ['hawaii', 'hawai i', 'rainbow warriors'] },
  { canonical: 'Massachusetts', aliases: ['umass', 'massachusetts', 'minutemen'] },
  { canonical: 'Connecticut', aliases: ['uconn', 'connecticut', 'huskies of storrs'] },
  { canonical: 'UNLV', aliases: ['unlv', 'nevada las vegas', 'rebels of vegas'] },
  { canonical: 'Army', aliases: ['army', 'black knights', 'west point'] },
  { canonical: 'Navy', aliases: ['navy', 'midshipmen', 'middies'] },
  { canonical: 'Air Force', aliases: ['air force', 'falcons'] },
  { canonical: 'Texas', aliases: ['texas longhorns', 'longhorns', 'hook em'] },
  { canonical: 'Washington', aliases: ['washington huskies', 'udub', 'u dub'] },
];


/**
 * Tokens that resolve to more than one FBS program. Never matched alone — a
 * title has to spell the school out. Each comment names the collision.
 */
const AMBIGUOUS = [
  'osu',   // Ohio State / Oklahoma State / Oregon State
  'msu',   // Michigan State / Mississippi State / Missouri State
  'isu',   // Iowa State / Illinois State / Indiana State
  'usa',   // South Alabama, but also the country
  'miami', // Miami (FL) / Miami (OH) — must be qualified
  'sdsu',  // San Diego State / South Dakota State
  'ull',   // Louisiana / Louisiana-Lafayette shorthand, inconsistent
  'la',    // Louisiana / Los Angeles
  'wsu',   // Washington State / Weber State / Wichita State
  'cal',   // California / Cal Poly / Cal State
  'st',    // "state" abbreviation fragment
  'us',
  'the',
];

export const CFB: LeagueConfig = {
  id: 'cfb',
  label: 'College Football',
  espn: {
    scoreboard:
      'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard',
    summary:
      'https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary',
    teams: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams',
    params: { groups: '80', limit: '100' },
  },
  restrictTeamsViaStandings: true,
  expectedTeamCount: { min: 100, max: 200 },
  aliases: ALIASES,
  ambiguousTokens: AMBIGUOUS,
  topics: [
    'college football',
    'cfb',
    'ncaa football',
    'ncaaf',
    'sec',
    'big ten',
    'b1g',
    'big 12',
    'acc',
    'pac 12',
    'mountain west',
    'sun belt',
    'american athletic',
    'conference usa',
    'mac',
    'bowl game',
    'heisman',
    'college gameday',
    'spring game',
    'fall camp',
    'training camp',
    'signing day',
    'recruiting',
    'playoff',
  ],
  offTopic: [
    // other sports
    'little league', 'world series', 'wbb', 'mbb', 'basketball', 'volleyball',
    'soccer', 'baseball', 'softball', 'lacrosse', 'hockey', 'golf', 'tennis',
    'gymnastics', 'track and field', 'swimming', 'wrestling', 'rowing',
    'cross country',
    // other leagues
    'nba', 'wnba', 'nfl', 'mlb', 'nhl', 'mls', 'premier league', 'ufc',
    'nascar', 'formula 1', 'liv',
    // adjacent but not a game
    'fantasy football', 'mock draft', 'nfl draft', 'combine',
  ],
};
