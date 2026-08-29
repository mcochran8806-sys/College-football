/**
 * Single source of truth for both the browser bundle and the /api serverless
 * functions. Keep this file free of any Node- or DOM-specific API so it can be
 * imported from either side.
 *
 * Two leagues run from one deployment. Which one a screen shows comes from
 * ?league= in its URL; everything league-specific lives under LEAGUE_SETTINGS
 * here, and the mechanical parts (ESPN paths, alias tables, topic keywords)
 * live in shared/leagues/.
 */

import type { HighlightChannel, LeagueId } from './shared/leagues/types.js';

export type { HighlightChannel, LeagueId };

/**
 * Per-league favorites and highlight channels — the two things you'll actually
 * edit.
 *
 * FAVORITES accept anything the alias table understands: abbreviations
 * ("UGA", "DET"), city or school names ("Georgia Tech", "Detroit"), or
 * nicknames ("Bama", "Seahawks"). A ?favorites= parameter in a screen's URL
 * overrides these per screen — build one at /settings.
 *
 * CHANNELS: `id` must be the 24-character UC... channel ID. `handles` are
 * candidates for /api/resolve-channels to try in order; a wrong ID polls an
 * empty playlist and fails silently, so nothing here is ever guessed.
 */
export const LEAGUE_SETTINGS: Record<
  LeagueId,
  { favorites: string[]; channels: HighlightChannel[] }
> = {
  cfb: {
    favorites: ['Georgia', 'Georgia Tech', 'Alabama'],
    channels: [
      // All verified against the live YouTube API by /api/resolve-channels.
      { name: 'ESPN', id: 'UCiWLfSweyRNmLpgEHekhoAg', handles: ['@ESPN'], priority: 2 },
      {
        name: 'ESPN College Football',
        id: 'UCzRWWsFjqHk1an4OnVPsl9g',
        handles: ['@ESPNCFB'],
        priority: 3,
      },
      { name: 'SEC Network', id: 'UC60q_WUDde_NK-ze3frvtiA', handles: ['@SEC'], priority: 3 },
      {
        name: 'Big Ten Football',
        id: 'UCXnslB_TwYqScBRf4bPf3vA',
        handles: ['@B1GFootball'],
        priority: 3,
      },
      {
        name: 'ACC Digital Network',
        id: 'UCOhy7TcR1gGD8nQBqrF2FaA',
        handles: ['@ACCDigitalNetwork'],
        priority: 3,
      },
      {
        name: 'Big 12 Conference',
        id: 'UCLnfOCTbfqMy_3ah8OmTHEQ',
        handles: ['@Big12Conference'],
        priority: 3,
      },
      {
        name: 'FOX College Football',
        id: 'UCpwix-O6ceqMgdxhqIynzFA',
        handles: ['@CFBONFOX'],
        priority: 3,
      },
      { name: 'FOX Sports', id: 'UCwNqHDsnBCKT-olwJwIFyfg', handles: ['@FOXSports'], priority: 1 },
      { name: 'CBS Sports', id: 'UCja8sZ2T4ylIqjggA1Zuukg', handles: ['@CBSSports'], priority: 1 },
      { name: 'NCAA', id: 'UCOnOdMq78X8ifkIxnIoqfHQ', handles: ['@NCAA'], priority: 1 },
      {
        name: 'Mountain West',
        id: 'UC-En6dgdJQw9sQxOtuRstJQ',
        handles: ['@MountainWest'],
        priority: 1,
      },
      {
        name: 'Sun Belt Conference',
        id: 'TODO_VERIFY',
        handles: ['@SunBeltConf', '@SunBeltSports', '@TheSunBelt', '@SunBeltFB', '@SunBelt'],
        priority: 1,
      },
    ],
  },

  nfl: {
    favorites: ['Lions', 'Seahawks', 'Eagles'],
    channels: [
      // All resolved against the live YouTube API AND title-checked by
      // /api/resolve-channels — a handle can resolve to the wrong channel
      // entirely, so the resolved channel's title has to match too.
      { name: 'NFL', id: 'UCDVYQ4Zhbm3S2dlz7P1GBDg', handles: ['@NFL'], priority: 3 },
      {
        name: 'NFL on FOX',
        id: 'UCvQrivswRDGK0lZ_AcUHp8g',
        handles: ['@NFLonFOX'],
        priority: 3,
      },
      {
        name: 'NFL on CBS',
        id: 'UC7ZUfHFsuQcW7BkTHnXJtqw',
        handles: ['@NFLonCBS'],
        priority: 3,
      },
      {
        name: 'NFL on NBC',
        id: 'UCXn8eue3paGXJyI5UDQIyWg',
        handles: ['@NFLonNBC'],
        priority: 3,
      },
      // The favorites' own channels post their own highlights, which is
      // exactly what a favorites-first wall wants.
      {
        name: 'Seattle Seahawks',
        id: 'UCzkFCRiMcOBeef8xcaqipmw',
        handles: ['@Seahawks'],
        priority: 3,
      },
      {
        name: 'Philadelphia Eagles',
        id: 'UCaogx6OHpsGg0zuGRKsjbtQ',
        handles: ['@Eagles'],
        priority: 3,
      },
      // Shared with the college list, already verified there.
      { name: 'ESPN', id: 'UCiWLfSweyRNmLpgEHekhoAg', handles: ['@ESPN'], priority: 1 },
      { name: 'FOX Sports', id: 'UCwNqHDsnBCKT-olwJwIFyfg', handles: ['@FOXSports'], priority: 1 },
      { name: 'CBS Sports', id: 'UCja8sZ2T4ylIqjggA1Zuukg', handles: ['@CBSSports'], priority: 1 },

      // Resolved via @DetroitLionsNFL. Note it is NOT @Lions — that handle
      // belongs to the Saitama Seibu Lions, a Japanese baseball team, and
      // returned a perfectly valid id for entirely the wrong channel. The
      // resolver's title check is what caught it.
      {
        name: 'Detroit Lions',
        id: 'UCv5J06V-ESk5_1uriG65f3w',
        handles: ['@DetroitLionsNFL'],
        priority: 3,
      },
    ],
  },
};

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
 * Highlight wall behavior.
 *
 * These channels post everything they cover — NBA trades, fantasy football,
 * Little League, golf. Without a relevance gate the wall plays all of it.
 *
 * filler: what may play when no clip matches one of today's games.
 *   'highlights-only' college football AND looks like a highlight reel.
 *                     Rejects interviews, previews, press conferences and
 *                     talk shows. In the offseason almost nothing qualifies,
 *                     so the wall runs on score cards — which is correct:
 *                     there are no highlights because there are no games.
 *   'cfb-only'        anything naming an FBS team or a CFB topic, including
 *                     fall camp features and studio talk
 *   'none'            matched games only
 *   'all'             anything the channels post
 *
 * Duration bounds, both in seconds, either one 0 to disable. Durations come
 * from videos.list, which takes 50 ids per call for 1 unit. A clip whose
 * duration could not be read is always KEPT — never filter on missing data.
 *
 *   maxDurationSeconds  keeps the wall moving. A 20-minute full-game recap
 *                       parks one game on screen for 20 minutes; a 60s cap
 *                       means constant rotation across games.
 *   minDurationSeconds  a floor, if you want one. Note it must stay BELOW the
 *                       max or nothing can ever play.
 *
 * The tradeoff at a 60s cap: most sub-minute sports clips on YouTube are
 * Shorts, which are vertical 9:16 and will letterbox with black bars either
 * side on a 16:9 TV. Set dropShortsFormat to drop the ones whose titles say
 * so (#shorts), at the cost of a much thinner queue.
 */
export const WALL = {
  filler: 'highlights-only' as 'highlights-only' | 'cfb-only' | 'none' | 'all',
  minDurationSeconds: 0,
  maxDurationSeconds: 60,
  dropShortsFormat: false,
} as const;

/**
 * OBS score ticker (/ticker).
 *
 * Rendered into an OBS Browser Source, so the constraints differ from the TV
 * screens: transparent background to composite over other layers, no overscan
 * padding, and animation driven by transform so OBS's compositor stays cheap.
 *
 * style:
 *   'scroll' a continuous bottom-line crawl, the broadcast convention
 *   'flip'   one game at a time in a fixed box, rotating on a timer
 *
 * Everything here is overridable per-source via query parameters, so two OBS
 * scenes can run different tickers off one deployment. See README.
 */
export const TICKER = {
  style: 'scroll' as 'scroll' | 'flip',
  /** Crawl speed in pixels per second. Broadcast tickers sit around 60-90. */
  speedPxPerSecond: 70,
  /** Seconds each game holds in 'flip' style. */
  flipSeconds: 4,
  /** Show games that have not kicked off yet. */
  includeUpcoming: true,
  /** Show finished games. */
  includeFinal: true,
  /** Transparent lets OBS composite it over video; solid gives a filled bar. */
  background: 'transparent' as 'transparent' | 'solid',
} as const;

/**
 * Debug only. Leave empty. When set to YYYYMMDD the API functions will request
 * that slate from ESPN instead of today's. The TVs never send this.
 */
export const DEBUG_DATE = '';

/** Team list cache: FBS membership changes about once a year. */
export const CACHE_TTL_TEAMS = 86_400_000;

