/**
 * ESPN-shaped scoreboard fixture, served when MOCK=1.
 *
 * Deliberately raw (not pre-shrunk) so mock mode exercises the same
 * shrinkScoreboard() path as production — if the normalizer breaks, MOCK=1
 * breaks with it instead of hiding the bug.
 *
 * Covers: in-progress, red zone with possession, close-and-late 4th quarter,
 * halftime, final, upcoming, ranked and unranked, and a game missing its
 * broadcast + situation entirely (defensive-parsing canary).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface MkTeam {
  id: string;
  location: string;
  name: string;
  abbreviation: string;
  short: string;
  color: string;
  conf?: string;
}

const T: Record<string, MkTeam> = {
  uga: { id: '61', location: 'Georgia', name: 'Bulldogs', abbreviation: 'UGA', short: 'Georgia', color: 'BA0C2F', conf: '8' },
  bama: { id: '333', location: 'Alabama', name: 'Crimson Tide', abbreviation: 'ALA', short: 'Alabama', color: '9E1B32', conf: '8' },
  gt: { id: '59', location: 'Georgia Tech', name: 'Yellow Jackets', abbreviation: 'GT', short: 'Georgia Tech', color: 'B3A369', conf: '1' },
  clem: { id: '228', location: 'Clemson', name: 'Tigers', abbreviation: 'CLEM', short: 'Clemson', color: 'F66733', conf: '1' },
  aub: { id: '2', location: 'Auburn', name: 'Tigers', abbreviation: 'AUB', short: 'Auburn', color: '03244D', conf: '8' },
  tenn: { id: '2633', location: 'Tennessee', name: 'Volunteers', abbreviation: 'TENN', short: 'Tennessee', color: 'FF8200', conf: '8' },
  osu: { id: '194', location: 'Ohio State', name: 'Buckeyes', abbreviation: 'OSU', short: 'Ohio State', color: 'BB0000', conf: '5' },
  mich: { id: '130', location: 'Michigan', name: 'Wolverines', abbreviation: 'MICH', short: 'Michigan', color: '00274C', conf: '5' },
  tex: { id: '251', location: 'Texas', name: 'Longhorns', abbreviation: 'TEX', short: 'Texas', color: 'BF5700', conf: '8' },
  tamu: { id: '245', location: 'Texas A&M', name: 'Aggies', abbreviation: 'TA&M', short: 'Texas A&M', color: '500000', conf: '8' },
  olemiss: { id: '145', location: 'Ole Miss', name: 'Rebels', abbreviation: 'MISS', short: 'Ole Miss', color: '14213D', conf: '8' },
  lsu: { id: '99', location: 'LSU', name: 'Tigers', abbreviation: 'LSU', short: 'LSU', color: '461D7C', conf: '8' },
  ore: { id: '2483', location: 'Oregon', name: 'Ducks', abbreviation: 'ORE', short: 'Oregon', color: '154733', conf: '5' },
  psu: { id: '213', location: 'Penn State', name: 'Nittany Lions', abbreviation: 'PSU', short: 'Penn State', color: '00265D', conf: '5' },
  nd: { id: '87', location: 'Notre Dame', name: 'Fighting Irish', abbreviation: 'ND', short: 'Notre Dame', color: '0C2340', conf: '18' },
  pitt: { id: '221', location: 'Pittsburgh', name: 'Panthers', abbreviation: 'PITT', short: 'Pittsburgh', color: '003594', conf: '1' },
  fsu: { id: '52', location: 'Florida State', name: 'Seminoles', abbreviation: 'FSU', short: 'Florida State', color: '782F40', conf: '1' },
  miami: { id: '2390', location: 'Miami', name: 'Hurricanes', abbreviation: 'MIA', short: 'Miami', color: 'F47321', conf: '1' },
  utsa: { id: '2636', location: 'UTSA', name: 'Roadrunners', abbreviation: 'UTSA', short: 'UTSA', color: '0C2340', conf: '151' },
  army: { id: '349', location: 'Army', name: 'Black Knights', abbreviation: 'ARMY', short: 'Army', color: '2C2A29', conf: '151' },
  boise: { id: '68', location: 'Boise State', name: 'Broncos', abbreviation: 'BSU', short: 'Boise State', color: '0033A0', conf: '17' },
  fres: { id: '278', location: 'Fresno State', name: 'Bulldogs', abbreviation: 'FRES', short: 'Fresno State', color: 'DB0032', conf: '17' },
  app: { id: '2026', location: 'Appalachian State', name: 'Mountaineers', abbreviation: 'APP', short: 'App State', color: '000000', conf: '37' },
  ccu: { id: '324', location: 'Coastal Carolina', name: 'Chanticleers', abbreviation: 'CCU', short: 'Coastal Car', color: '006F71', conf: '37' },
  wis: { id: '275', location: 'Wisconsin', name: 'Badgers', abbreviation: 'WIS', short: 'Wisconsin', color: 'C5050C', conf: '5' },
  iowa: { id: '2294', location: 'Iowa', name: 'Hawkeyes', abbreviation: 'IOWA', short: 'Iowa', color: 'FFCD00', conf: '5' },
};

function competitor(t: MkTeam, homeAway: 'home' | 'away', score: number | null, rank: number, record: string, winner = false): any {
  return {
    id: `c-${t.id}`,
    homeAway,
    winner,
    score: score === null ? null : String(score),
    curatedRank: { current: rank },
    records: [{ type: 'total', summary: record }],
    team: {
      id: t.id,
      location: t.location,
      name: t.name,
      abbreviation: t.abbreviation,
      displayName: `${t.location} ${t.name}`,
      shortDisplayName: t.short,
      color: t.color,
      conferenceId: t.conf,
      logo: `https://a.espncdn.com/i/teamlogos/ncaa/500/${t.id}.png`,
    },
  };
}

interface MkGame {
  id: string;
  away: MkTeam;
  home: MkTeam;
  awayScore?: number | null;
  homeScore?: number | null;
  awayRank?: number;
  homeRank?: number;
  awayRec?: string;
  homeRec?: string;
  state: 'pre' | 'in' | 'post';
  detail: string;
  shortDetail: string;
  clock?: string;
  period?: number;
  situation?: any;
  broadcast?: string | null;
  date?: string;
  venue?: string;
  note?: string;
  winner?: 'home' | 'away';
}

function event(g: MkGame): any {
  const completed = g.state === 'post';
  return {
    id: g.id,
    date: g.date ?? '2025-11-08T20:00Z',
    name: `${g.away.location} ${g.away.name} at ${g.home.location} ${g.home.name}`,
    shortName: `${g.away.abbreviation} @ ${g.home.abbreviation}`,
    status: {
      clock: 0,
      displayClock: g.clock ?? '0:00',
      period: g.period ?? 0,
      type: {
        state: g.state,
        completed,
        detail: g.detail,
        shortDetail: g.shortDetail,
        description: g.state === 'post' ? 'Final' : g.state === 'in' ? 'In Progress' : 'Scheduled',
      },
    },
    competitions: [
      {
        id: g.id,
        conferenceCompetition: g.away.conf === g.home.conf,
        venue: { fullName: g.venue ?? 'Sanford Stadium' },
        ...(g.note ? { notes: [{ type: 'event', headline: g.note }] } : {}),
        ...(g.situation ? { situation: g.situation } : {}),
        ...(g.broadcast === null
          ? {}
          : { broadcasts: [{ market: 'national', names: [g.broadcast ?? 'ESPN'] }] }),
        competitors: [
          competitor(g.home, 'home', g.homeScore ?? null, g.homeRank ?? 99, g.homeRec ?? '0-0', g.winner === 'home'),
          competitor(g.away, 'away', g.awayScore ?? null, g.awayRank ?? 99, g.awayRec ?? '0-0', g.winner === 'away'),
        ],
      },
    ],
  };
}

export const MOCK_SCOREBOARD = {
  leagues: [{ id: '23', abbreviation: 'NCAAF', season: { year: 2025, type: { name: 'Regular Season' } } }],
  season: { type: 2, year: 2025 },
  week: { number: 11 },
  events: [
    // Favorite, in progress, RED ZONE, possession with the away team.
    event({
      id: '401628301',
      away: T.uga, home: T.bama,
      awayScore: 21, homeScore: 17,
      awayRank: 2, homeRank: 8,
      awayRec: '8-1', homeRec: '7-2',
      state: 'in', period: 3, clock: '4:12',
      detail: '4:12 - 3rd Quarter', shortDetail: '4:12 - 3rd',
      broadcast: 'CBS', venue: 'Bryant-Denny Stadium',
      situation: {
        possession: T.uga.id,
        isRedZone: true,
        down: 2, distance: 6, yardLine: 12,
        downDistanceText: '2nd & 6 at ALA 12',
        shortDownDistanceText: '2nd & 6',
        possessionText: 'ALA 12',
      },
    }),
    // Favorite, close and late: 4th quarter, 3-point margin -> accent glow.
    event({
      id: '401628302',
      away: T.gt, home: T.clem,
      awayScore: 24, homeScore: 27,
      awayRec: '6-3', homeRank: 15, homeRec: '7-2',
      state: 'in', period: 4, clock: '1:47',
      detail: '1:47 - 4th Quarter', shortDetail: '1:47 - 4th',
      broadcast: 'ESPN', venue: 'Memorial Stadium',
      situation: {
        possession: T.gt.id,
        isRedZone: false,
        down: 3, distance: 8, yardLine: 44,
        downDistanceText: '3rd & 8 at CLEM 44',
        shortDownDistanceText: '3rd & 8',
        possessionText: 'CLEM 44',
      },
    }),
    // Close and late AND red zone — the loudest possible card.
    event({
      id: '401628303',
      away: T.osu, home: T.mich,
      awayScore: 20, homeScore: 17,
      awayRank: 3, homeRank: 12,
      awayRec: '9-0', homeRec: '7-2',
      state: 'in', period: 4, clock: '0:38',
      detail: '0:38 - 4th Quarter', shortDetail: '0:38 - 4th',
      broadcast: 'FOX', venue: 'Michigan Stadium',
      situation: {
        possession: T.mich.id,
        isRedZone: true,
        down: 1, distance: 10, yardLine: 8,
        downDistanceText: '1st & Goal at OSU 8',
        shortDownDistanceText: '1st & Goal',
        possessionText: 'OSU 8',
      },
    }),
    // Halftime.
    event({
      id: '401628304',
      away: T.tex, home: T.tamu,
      awayScore: 14, homeScore: 10,
      awayRank: 5, homeRank: 21,
      awayRec: '8-1', homeRec: '6-3',
      state: 'in', period: 2, clock: '0:00',
      detail: 'Halftime', shortDetail: 'Half',
      broadcast: 'ABC', venue: 'Kyle Field',
    }),
    // In progress, blowout, 2nd quarter.
    event({
      id: '401628305',
      away: T.olemiss, home: T.lsu,
      awayScore: 35, homeScore: 7,
      awayRank: 11, homeRec: '5-4',
      awayRec: '8-1',
      state: 'in', period: 2, clock: '7:22',
      detail: '7:22 - 2nd Quarter', shortDetail: '7:22 - 2nd',
      broadcast: 'ESPN2', venue: 'Tiger Stadium',
      situation: {
        possession: T.lsu.id,
        isRedZone: false,
        down: 1, distance: 10, yardLine: 25,
        downDistanceText: '1st & 10 at LSU 25',
        shortDownDistanceText: '1st & 10',
        possessionText: 'LSU 25',
      },
    }),
    // Defensive-parsing canary: no broadcast, no situation, no records.
    event({
      id: '401628306',
      away: T.utsa, home: T.army,
      awayScore: 13, homeScore: 16,
      state: 'in', period: 4, clock: '9:03',
      detail: '9:03 - 4th Quarter', shortDetail: '9:03 - 4th',
      broadcast: null, venue: 'Michie Stadium',
    }),
    // Finals.
    event({
      id: '401628307',
      away: T.nd, home: T.pitt,
      awayScore: 31, homeScore: 24,
      awayRank: 9, awayRec: '8-1', homeRec: '6-3',
      state: 'post', period: 4, clock: '0:00',
      detail: 'Final', shortDetail: 'Final',
      broadcast: 'NBC', venue: 'Acrisure Stadium', winner: 'away',
    }),
    event({
      id: '401628308',
      away: T.fsu, home: T.miami,
      awayScore: 17, homeScore: 41,
      homeRank: 6, homeRec: '9-0', awayRec: '3-6',
      state: 'post', period: 4, clock: '0:00',
      detail: 'Final', shortDetail: 'Final',
      broadcast: 'ACC Network', venue: 'Hard Rock Stadium', winner: 'home',
    }),
    // Final in overtime.
    event({
      id: '401628309',
      away: T.app, home: T.ccu,
      awayScore: 38, homeScore: 35,
      awayRec: '7-2', homeRec: '4-5',
      state: 'post', period: 5, clock: '0:00',
      detail: 'Final/OT', shortDetail: 'Final/OT',
      broadcast: 'ESPNU', venue: 'Brooks Stadium', winner: 'away',
    }),
    // Upcoming.
    event({
      id: '401628310',
      away: T.ore, home: T.psu,
      awayRank: 1, homeRank: 4,
      awayRec: '9-0', homeRec: '8-1',
      state: 'pre', period: 0, clock: '0:00',
      detail: 'Sat, November 8th at 7:30 PM EST', shortDetail: '11/8 - 7:30 PM EST',
      broadcast: 'NBC', date: '2025-11-09T00:30Z', venue: 'Beaver Stadium',
      note: 'Big Ten Championship implications',
    }),
    event({
      id: '401628311',
      away: T.aub, home: T.tenn,
      awayRec: '4-5', homeRank: 14, homeRec: '7-2',
      state: 'pre', period: 0, clock: '0:00',
      detail: 'Sat, November 8th at 7:00 PM EST', shortDetail: '11/8 - 7:00 PM EST',
      broadcast: 'SEC Network', date: '2025-11-09T00:00Z', venue: 'Neyland Stadium',
    }),
    event({
      id: '401628312',
      away: T.boise, home: T.fres,
      awayRank: 18, awayRec: '8-1', homeRec: '6-3',
      state: 'pre', period: 0, clock: '0:00',
      detail: 'Sat, November 8th at 10:30 PM EST', shortDetail: '11/8 - 10:30 PM EST',
      broadcast: 'FS1', date: '2025-11-09T03:30Z', venue: 'Valley Childrens Stadium',
    }),
    event({
      id: '401628313',
      away: T.wis, home: T.iowa,
      awayRec: '5-4', homeRec: '7-2',
      state: 'pre', period: 0, clock: '0:00',
      detail: 'Sat, November 8th at 3:30 PM EST', shortDetail: '11/8 - 3:30 PM EST',
      broadcast: 'BTN', date: '2025-11-08T20:30Z', venue: 'Kinnick Stadium',
    }),
  ],
};
