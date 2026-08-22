/**
 * Single source of truth for both the browser bundle and the /api serverless
 * functions. Keep this file free of any Node- or DOM-specific API so it can be
 * imported from either side.
 */

/**
 * Teams whose games sort to the top of the scoreboard, get polled for scoring
 * plays, and interrupt the highlight wall with a score card.
 *
 * These are the DEFAULTS. A ?favorites= parameter in the URL overrides them
 * per screen — build one at /settings by clicking teams. See README.
 *
 * Accepts anything the alias table understands: abbreviations ("UGA"), school
 * names ("Georgia Tech"), or nicknames ("Bama"). Matched case-insensitively
 * against ESPN's abbreviation / displayName / shortDisplayName / location.
 */
export const FAVORITE_TEAMS = ['Georgia', 'Georgia Tech', 'Alabama'];

/**
 * YouTube channels polled for highlight uploads.
 *
 * `id` MUST be the 24-character channel ID (starts with "UC"). The uploads
 * playlist is derived from it by swapping the second character C -> U, which
 * costs zero API calls.
 *
 * Any entry whose id is still TODO_VERIFY is skipped at runtime and logged
 * loudly — a wrong ID fails silently, so we refuse to guess. Run
 * `npm run resolve-channels` to fill these in from the handles below.
 */
export interface HighlightChannel {
  /** Human label, shown in logs and on the highlight wall's source badge. */
  name: string;
  /** 24-char UC... channel ID, or 'TODO_VERIFY' until resolved. */
  id: string;
  /** @handle used by scripts/resolve-channels.mjs to look the id up. */
  handle: string;
  /** Favor this channel's clips when several match the same game. */
  priority?: number;
}

export const HIGHLIGHT_CHANNELS: HighlightChannel[] = [
  // Verified: ESPN's main channel ID is widely published and stable.
  { name: 'ESPN', id: 'UCiWLfSweyRNmLpgEHekhoAg', handle: '@ESPN', priority: 2 },

  // NOT VERIFIED. Handles are correct; the UC... ids are not something we will
  // invent, because a wrong id returns an empty playlist and fails silently.
  // Run `npm run resolve-channels` with your API key to fill these in.
  { name: 'ESPN College Football', id: 'TODO_VERIFY', handle: '@ESPNCollegeFootball', priority: 3 },
  { name: 'SEC Network', id: 'TODO_VERIFY', handle: '@SECNetwork', priority: 3 },
  { name: 'Big Ten Network', id: 'TODO_VERIFY', handle: '@bigtennetwork', priority: 2 },
  { name: 'ACC Digital Network', id: 'TODO_VERIFY', handle: '@theACCDN', priority: 3 },
  { name: 'Big 12 Conference', id: 'TODO_VERIFY', handle: '@Big12Conference', priority: 2 },
  { name: 'FOX Sports', id: 'TODO_VERIFY', handle: '@FOXSports', priority: 1 },
  { name: 'FOX College Football', id: 'TODO_VERIFY', handle: '@CFBONFOX', priority: 2 },
  { name: 'CBS Sports', id: 'TODO_VERIFY', handle: '@CBSSports', priority: 1 },
  { name: 'NCAA Football', id: 'TODO_VERIFY', handle: '@NCAAFootball', priority: 1 },
  { name: 'Pac-12 / Mountain West', id: 'TODO_VERIFY', handle: '@MountainWest', priority: 1 },
  { name: 'Sun Belt Conference', id: 'TODO_VERIFY', handle: '@SunBeltConference', priority: 1 },
];

/** Everything that ticks, in milliseconds. */
export const INTERVALS = {
  /** Browser -> /api/scoreboard. Spec: 20s. */
  scoreboardPoll: 20_000,
  /** Browser -> /api/highlights. Spec: 2 minutes. */
  highlightsPoll: 120_000,
  /** Browser -> /api/plays. Only in-progress favorites are polled upstream. */
  playsPoll: 15_000,
  /** Scoreboard page auto-advance. */
  pageAdvance: 15_000,
  /** How long a scoring-play interstitial holds the screen. */
  scoreCardHold: 12_000,
  /** Compact-scoreboard fallback rotation on the highlight wall. */
  fallbackRotate: 20_000,
  /** Layout nudge for OLED burn-in mitigation. */
  burnInShift: 600_000,
} as const;

/** Server-side cache TTLs, in milliseconds. */
export const CACHE_TTL = {
  scoreboard: 15_000,
  highlights: 90_000,
  plays: 15_000,
} as const;

/** Scoreboard grid: 3 across x 2 down on a 1080p TV. */
export const GAMES_PER_PAGE = 6;

/**
 * What to put on the board, and how much of it.
 *
 * ESPN returns the whole current week with no date filter — 99 games in
 * midseason. At six per page that's 17 pages, over four minutes to cycle back
 * to your own team, which defeats the point of a glanceable board.
 *
 * mode:
 *   'all'        every game ESPN returns
 *   'live-first' once enough games are in progress to fill a page, games that
 *                haven't kicked off drop off the board. Favorites are never
 *                dropped. Early in the day, when little is live, everything
 *                stays so the board isn't empty.
 *   'live-only'  favorites and in-progress games, nothing else
 *
 * maxPages caps the rotation regardless of mode: you see the top N games by
 * the existing sort (favorites, then close-and-late, then live, then ranked)
 * and never sit through pages of blowouts. 0 disables the cap.
 */
export const SLATE = {
  mode: 'live-first' as 'all' | 'live-first' | 'live-only',
  maxPages: 4,
} as const;

/** A game is "close and late" (and gets the accent glow) at or past this
 *  period with a margin at or under this many points. */
export const CLOSE_GAME = { period: 4, margin: 8 } as const;

/** Highlight titles must match this many distinct teams from one real game. */
export const REQUIRED_TEAM_MATCHES = 2;

/**
 * Debug only. Leave empty. When set to YYYYMMDD the API functions will request
 * that slate from ESPN instead of today's. The TVs never send this.
 */
export const DEBUG_DATE = '';

/** Team list cache: FBS membership changes about once a year. */
export const CACHE_TTL_TEAMS = 86_400_000;

/** ESPN's undocumented, unofficial endpoints. Schema can shift mid-season. */
export const ESPN = {
  scoreboard:
    'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard',
  summary:
    'https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary',
  teams:
    'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams',
  /** groups=80 is FBS; limit=100 lifts the default ~17-game cap. BOTH required. */
  params: { groups: '80', limit: '100' },
} as const;
