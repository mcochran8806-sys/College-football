/**
 * ESPN-shaped NFL scoreboard fixture, served when MOCK=1&league=nfl.
 *
 * Raw, not pre-shrunk, so mock mode runs the same shrinkScoreboard() path as
 * production. Deliberately includes both two-team cities — Giants and Jets,
 * Rams and Chargers — because a bare "New York" or "Los Angeles" must never
 * resolve to a game on its own.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface MkTeam {
  id: string;
  location: string;
  name: string;
  abbreviation: string;
  short: string;
  color: string;
}

const T: Record<string, MkTeam> = {
  det: { id: '8', location: 'Detroit', name: 'Lions', abbreviation: 'DET', short: 'Lions', color: '0076B6' },
  gb: { id: '9', location: 'Green Bay', name: 'Packers', abbreviation: 'GB', short: 'Packers', color: '204E32' },
  sea: { id: '26', location: 'Seattle', name: 'Seahawks', abbreviation: 'SEA', short: 'Seahawks', color: '002244' },
  sf: { id: '25', location: 'San Francisco', name: '49ers', abbreviation: 'SF', short: '49ers', color: 'AA0000' },
  phi: { id: '21', location: 'Philadelphia', name: 'Eagles', abbreviation: 'PHI', short: 'Eagles', color: '004C54' },
  dal: { id: '6', location: 'Dallas', name: 'Cowboys', abbreviation: 'DAL', short: 'Cowboys', color: '002244' },
  nyg: { id: '19', location: 'New York', name: 'Giants', abbreviation: 'NYG', short: 'Giants', color: '0B2265' },
  nyj: { id: '20', location: 'New York', name: 'Jets', abbreviation: 'NYJ', short: 'Jets', color: '115740' },
  lar: { id: '14', location: 'Los Angeles', name: 'Rams', abbreviation: 'LAR', short: 'Rams', color: '003594' },
  lac: { id: '24', location: 'Los Angeles', name: 'Chargers', abbreviation: 'LAC', short: 'Chargers', color: '0080C6' },
  kc: { id: '12', location: 'Kansas City', name: 'Chiefs', abbreviation: 'KC', short: 'Chiefs', color: 'E31837' },
  buf: { id: '2', location: 'Buffalo', name: 'Bills', abbreviation: 'BUF', short: 'Bills', color: '00338D' },
  bal: { id: '33', location: 'Baltimore', name: 'Ravens', abbreviation: 'BAL', short: 'Ravens', color: '241773' },
  pit: { id: '23', location: 'Pittsburgh', name: 'Steelers', abbreviation: 'PIT', short: 'Steelers', color: 'FFB612' },
};

function competitor(t: MkTeam, homeAway: 'home' | 'away', score: number | null, record: string, winner = false): any {
  return {
    id: `c-${t.id}`,
    homeAway,
    winner,
    score: score === null ? null : String(score),
    curatedRank: { current: 99 },
    records: [{ type: 'total', summary: record }],
    team: {
      id: t.id,
      location: t.location,
      name: t.name,
      abbreviation: t.abbreviation,
      displayName: `${t.location} ${t.name}`,
      shortDisplayName: t.short,
      color: t.color,
      logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${t.abbreviation.toLowerCase()}.png`,
    },
  };
}

interface MkGame {
  id: string;
  away: MkTeam;
  home: MkTeam;
  awayScore?: number | null;
  homeScore?: number | null;
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
  winner?: 'home' | 'away';
}

function event(g: MkGame): any {
  return {
    id: g.id,
    date: g.date ?? '2026-09-13T17:00Z',
    name: `${g.away.location} ${g.away.name} at ${g.home.location} ${g.home.name}`,
    shortName: `${g.away.abbreviation} @ ${g.home.abbreviation}`,
    status: {
      clock: 0,
      displayClock: g.clock ?? '0:00',
      period: g.period ?? 0,
      type: {
        state: g.state,
        completed: g.state === 'post',
        detail: g.detail,
        shortDetail: g.shortDetail,
        description: g.state === 'post' ? 'Final' : g.state === 'in' ? 'In Progress' : 'Scheduled',
      },
    },
    competitions: [
      {
        id: g.id,
        conferenceCompetition: false,
        venue: { fullName: g.venue ?? 'Ford Field' },
        ...(g.situation ? { situation: g.situation } : {}),
        ...(g.broadcast === null ? {} : { broadcasts: [{ market: 'national', names: [g.broadcast ?? 'FOX'] }] }),
        competitors: [
          competitor(g.home, 'home', g.homeScore ?? null, g.homeRec ?? '0-0', g.winner === 'home'),
          competitor(g.away, 'away', g.awayScore ?? null, g.awayRec ?? '0-0', g.winner === 'away'),
        ],
      },
    ],
  };
}

export const MOCK_NFL_SCOREBOARD = {
  leagues: [{ id: '28', abbreviation: 'NFL', season: { year: 2026 } }],
  season: { type: 2, year: 2026 },
  week: { number: 2 },
  events: [
    // Favorite, in progress, red zone.
    event({
      id: '401671001',
      away: T.gb, home: T.det,
      awayScore: 17, homeScore: 21,
      awayRec: '1-0', homeRec: '2-0',
      state: 'in', period: 3, clock: '6:31',
      detail: '6:31 - 3rd Quarter', shortDetail: '6:31 - 3rd',
      broadcast: 'FOX', venue: 'Ford Field',
      situation: {
        possession: T.det.id, isRedZone: true,
        down: 1, distance: 10, yardLine: 14,
        downDistanceText: '1st & 10 at GB 14',
        shortDownDistanceText: '1st & 10',
        possessionText: 'GB 14',
      },
    }),
    // Favorite, close and late.
    event({
      id: '401671002',
      away: T.sea, home: T.sf,
      awayScore: 20, homeScore: 23,
      awayRec: '1-1', homeRec: '2-0',
      state: 'in', period: 4, clock: '2:14',
      detail: '2:14 - 4th Quarter', shortDetail: '2:14 - 4th',
      broadcast: 'CBS', venue: "Levi's Stadium",
      situation: {
        possession: T.sea.id, isRedZone: false,
        down: 2, distance: 7, yardLine: 41,
        downDistanceText: '2nd & 7 at SF 41',
        shortDownDistanceText: '2nd & 7',
        possessionText: 'SF 41',
      },
    }),
    // Favorite, halftime.
    event({
      id: '401671003',
      away: T.phi, home: T.dal,
      awayScore: 14, homeScore: 10,
      awayRec: '2-0', homeRec: '0-2',
      state: 'in', period: 2, clock: '0:00',
      detail: 'Halftime', shortDetail: 'Half',
      broadcast: 'NBC', venue: 'AT&T Stadium',
    }),
    // Both New York teams, in separate games — the "New York" trap.
    event({
      id: '401671004',
      away: T.nyg, home: T.buf,
      awayScore: 7, homeScore: 24,
      awayRec: '0-2', homeRec: '2-0',
      state: 'in', period: 3, clock: '11:02',
      detail: '11:02 - 3rd Quarter', shortDetail: '11:02 - 3rd',
      broadcast: 'FOX', venue: 'Highmark Stadium',
    }),
    event({
      id: '401671005',
      away: T.nyj, home: T.pit,
      awayScore: 13, homeScore: 13,
      awayRec: '1-1', homeRec: '1-1',
      state: 'in', period: 4, clock: '7:45',
      detail: '7:45 - 4th Quarter', shortDetail: '7:45 - 4th',
      broadcast: 'CBS', venue: 'Acrisure Stadium',
    }),
    // Both Los Angeles teams — the other trap.
    event({
      id: '401671006',
      away: T.lar, home: T.kc,
      awayScore: 28, homeScore: 31,
      awayRec: '1-1', homeRec: '2-0',
      state: 'post', period: 4, clock: '0:00',
      detail: 'Final', shortDetail: 'Final',
      broadcast: 'FOX', venue: 'Arrowhead Stadium', winner: 'home',
    }),
    event({
      id: '401671007',
      away: T.lac, home: T.bal,
      awayScore: 10, homeScore: 34,
      awayRec: '0-2', homeRec: '2-0',
      state: 'post', period: 4, clock: '0:00',
      detail: 'Final', shortDetail: 'Final',
      broadcast: 'CBS', venue: 'M&T Bank Stadium', winner: 'home',
    }),
  ],
};
