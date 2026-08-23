/** Everything that differs between college football and the NFL. */

export type LeagueId = 'cfb' | 'nfl';

export interface AliasEntry {
  canonical: string;
  aliases: string[];
}

export interface HighlightChannel {
  /** Human label, shown in logs and on the highlight wall's source badge. */
  name: string;
  /** 24-char UC... channel ID, or 'TODO_VERIFY' until resolved. */
  id: string;
  /** Candidate @handles, tried in order by /api/resolve-channels. */
  handles: string[];
  /** Favor this channel's clips when several match the same game. */
  priority?: number;
}

export interface LeagueConfig {
  id: LeagueId;
  /** Shown in the scoreboard header and the settings picker. */
  label: string;

  /** ESPN's undocumented site API, which is league-parameterized. */
  espn: {
    scoreboard: string;
    summary: string;
    teams: string;
    /** Extra query params. CFB needs groups=80 (FBS); the NFL needs none. */
    params: Record<string, string>;
  };

  /**
   * True when /api/teams must narrow the team list via the standings tree.
   * College needs it — ESPN returns all 759 teams down to Division III.
   * The NFL's teams endpoint already returns exactly 32.
   */
  restrictTeamsViaStandings: boolean;
  /** Sanity bounds for that filter, and for the picker generally. */
  expectedTeamCount: { min: number; max: number };

  /** Schools/franchises written inconsistently in highlight titles. */
  aliases: AliasEntry[];
  /** Tokens matching more than one team — never matched alone. */
  ambiguousTokens: string[];

  /** Words proving a title belongs to this league. */
  topics: string[];
  /** Words proving it does NOT — other sports, other leagues. */
  offTopic: string[];
}
