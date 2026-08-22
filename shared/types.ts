/** Wire types shared by the serverless functions and the browser bundle. */

export interface TeamSide {
  id: string;
  homeAway: 'home' | 'away';
  displayName: string;
  shortDisplayName: string;
  abbreviation: string;
  location: string;
  name: string;
  logo: string | null;
  color: string | null;
  /** AP/CFP rank, when ESPN curates one. 99 means unranked; we return null. */
  rank: number | null;
  score: number | null;
  record: string | null;
  winner: boolean;
}

export interface Situation {
  /** Team id with the ball. */
  possession: string | null;
  isRedZone: boolean;
  downDistanceText: string | null;
  shortDownDistanceText: string | null;
  possessionText: string | null;
  yardLine: number | null;
}

export type GameState = 'pre' | 'in' | 'post';

export interface Game {
  id: string;
  /** 'Georgia Bulldogs at Alabama Crimson Tide' */
  name: string;
  shortName: string;
  /** ISO kickoff. */
  date: string;
  state: GameState;
  completed: boolean;
  /** 'Final', '2nd Quarter', '7:31 - 3rd' etc. */
  statusDetail: string;
  shortDetail: string;
  displayClock: string | null;
  period: number;
  home: TeamSide;
  away: TeamSide;
  situation: Situation | null;
  /** 'ABC', 'ESPN2', 'SEC Network' ... */
  broadcast: string | null;
  conferenceId: string | null;
  conference: string | null;
  conferenceGame: boolean;
  venue: string | null;
  /** Bowl name / headline note, when ESPN attaches one. */
  note: string | null;
}

export interface ScoreboardResponse {
  games: Game[];
  /** ISO timestamp the upstream payload was fetched. */
  fetchedAt: string;
  /** True when ESPN failed and this is the last good payload. */
  stale: boolean;
  /** Age of the served payload in ms. */
  ageMs: number;
  /** Present only when MOCK=1. */
  mock?: boolean;
}

export interface HighlightVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  channelId: string;
  channelName: string;
  thumbnail: string | null;
  priority: number;
  /** Null when the duration lookup failed; the clip is kept either way. */
  durationSeconds: number | null;
}

export interface HighlightsResponse {
  videos: HighlightVideo[];
  fetchedAt: string;
  stale: boolean;
  ageMs: number;
  /** True once YouTube has returned 403 quotaExceeded today. */
  quotaExhausted: boolean;
  /** Channels skipped because their id is still TODO_VERIFY. */
  unresolvedChannels: string[];
  mock?: boolean;
}

export interface ScoringPlay {
  /** Stable ESPN play id — the client dedupes on this. */
  id: string;
  gameId: string;
  sequence: number;
  /** 'TD', 'FG', 'SF' ... */
  scoringType: string | null;
  text: string;
  period: number;
  clock: string | null;
  /** Team that scored, joined against the scoreboard payload for logo/name. */
  teamId: string | null;
  teamName: string | null;
  teamLogo: string | null;
  awayScore: number;
  homeScore: number;
  awayAbbr: string;
  homeAbbr: string;
  /** ISO, when ESPN supplies it. Used only for ordering. */
  wallclock: string | null;
}

export interface PlaysResponse {
  plays: ScoringPlay[];
  /** Games we actually polled (in-progress AND favorite). */
  polledGameIds: string[];
  fetchedAt: string;
  stale: boolean;
  ageMs: number;
  mock?: boolean;
}

/** One selectable team in the /settings picker. */
export interface PickerTeam {
  id: string;
  displayName: string;
  shortDisplayName: string;
  abbreviation: string;
  location: string;
  nickname: string;
  logo: string | null;
  color: string | null;
  /** Conference name from the standings tree, null when it couldn't be read. */
  conference: string | null;
}

export interface TeamsResponse {
  teams: PickerTeam[];
  stale?: boolean;
  mock?: boolean;
}
