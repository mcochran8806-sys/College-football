/**
 * ESPN payload normalization.
 *
 * These endpoints are undocumented and unofficial. Every field access below is
 * optional-chained and every value is coerced, because the schema can and does
 * shift mid-season. The contract for this module: given ANY JSON at all, it
 * returns a valid (possibly empty) Game[] and never throws.
 */

import type { Game, GameState, ScoringPlay, TeamSide } from '../../shared/types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/**
 * ESPN conference group ids -> display names. Best-effort: these ids are stable
 * in practice but undocumented, so an unknown id falls back to the raw value
 * rather than a wrong label.
 */
const CONFERENCES: Record<string, string> = {
  '1': 'ACC',
  '4': 'Big 12',
  '5': 'Big Ten',
  '8': 'SEC',
  '9': 'Pac-12',
  '12': 'C-USA',
  '15': 'MAC',
  '17': 'Mountain West',
  '18': 'FBS Independent',
  '37': 'Sun Belt',
  '151': 'American',
};

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function toState(v: unknown): GameState {
  return v === 'in' || v === 'post' || v === 'pre' ? v : 'pre';
}

function teamSide(competitor: Any, homeAway: 'home' | 'away'): TeamSide {
  const team = competitor?.team ?? {};
  const rank = num(competitor?.curatedRank?.current);
  const logo =
    str(team?.logo) ??
    str(team?.logos?.[0]?.href) ??
    (str(team?.id) ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.id}.png` : null);

  return {
    id: String(team?.id ?? competitor?.id ?? ''),
    homeAway,
    displayName: str(team?.displayName) ?? str(team?.name) ?? 'TBD',
    shortDisplayName: str(team?.shortDisplayName) ?? str(team?.abbreviation) ?? 'TBD',
    abbreviation: str(team?.abbreviation) ?? str(team?.shortDisplayName) ?? '—',
    location: str(team?.location) ?? str(team?.displayName) ?? '',
    name: str(team?.name) ?? '',
    logo,
    color: str(team?.color) ? `#${String(team.color).replace(/^#/, '')}` : null,
    // ESPN uses 99 as the sentinel for "unranked".
    rank: rank !== null && rank > 0 && rank < 99 ? rank : null,
    score: num(competitor?.score),
    record:
      str(competitor?.records?.find((r: Any) => r?.type === 'total')?.summary) ??
      str(competitor?.records?.[0]?.summary),
    winner: competitor?.winner === true,
  };
}

function situationOf(competition: Any, state: GameState) {
  const s = competition?.situation;
  // ESPN leaves a stale situation object attached to finished games; ignore it.
  if (!s || state !== 'in') return null;
  return {
    possession: str(s?.possession),
    isRedZone: s?.isRedZone === true,
    downDistanceText: str(s?.downDistanceText),
    shortDownDistanceText: str(s?.shortDownDistanceText),
    possessionText: str(s?.possessionText),
    yardLine: num(s?.yardLine),
  };
}

function broadcastOf(competition: Any): string | null {
  const b = competition?.broadcasts;
  if (Array.isArray(b)) {
    for (const entry of b) {
      const name = str(entry?.names?.[0]) ?? str(entry?.media?.shortName) ?? str(entry?.shortName);
      if (name) return name;
    }
  }
  return (
    str(competition?.geoBroadcasts?.[0]?.media?.shortName) ??
    str(competition?.broadcast) ??
    null
  );
}

/** Strip ESPN's very large scoreboard payload down to what the TVs render. */
export function shrinkScoreboard(raw: Any): Game[] {
  const events = Array.isArray(raw?.events) ? raw.events : [];
  const games: Game[] = [];

  for (const event of events) {
    try {
      const competition = event?.competitions?.[0];
      const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
      if (competitors.length < 2) continue;

      const homeRaw =
        competitors.find((c: Any) => c?.homeAway === 'home') ?? competitors[0];
      const awayRaw =
        competitors.find((c: Any) => c?.homeAway === 'away') ?? competitors[1];

      const status = event?.status ?? competition?.status ?? {};
      const state = toState(status?.type?.state);
      const conferenceId =
        str(homeRaw?.team?.conferenceId) ?? str(awayRaw?.team?.conferenceId) ?? null;

      games.push({
        id: String(event?.id ?? competition?.id ?? ''),
        name: str(event?.name) ?? '',
        shortName: str(event?.shortName) ?? '',
        date: str(event?.date) ?? str(competition?.date) ?? new Date().toISOString(),
        state,
        completed: status?.type?.completed === true,
        statusDetail: str(status?.type?.detail) ?? str(status?.type?.description) ?? '',
        shortDetail: str(status?.type?.shortDetail) ?? '',
        displayClock: str(status?.displayClock),
        period: num(status?.period) ?? 0,
        home: teamSide(homeRaw, 'home'),
        away: teamSide(awayRaw, 'away'),
        situation: situationOf(competition, state),
        broadcast: broadcastOf(competition),
        conferenceId,
        conference: conferenceId ? (CONFERENCES[conferenceId] ?? conferenceId) : null,
        conferenceGame: competition?.conferenceCompetition === true,
        venue: str(competition?.venue?.fullName),
        note: str(competition?.notes?.[0]?.headline) ?? str(event?.notes?.[0]?.headline),
      });
    } catch (err) {
      // One malformed event must not take down the slate.
      console.error('[espn] skipped malformed event:', err);
    }
  }

  return games.filter((g) => g.id !== '');
}

/**
 * Pull scoring plays out of a summary?event={id} payload.
 *
 * We read metadata only. We do not touch the video objects in this response —
 * those streams are DRM/geo restricted and not ours to serve.
 */
export function extractScoringPlays(raw: Any, gameId: string, game?: Game): ScoringPlay[] {
  const plays = Array.isArray(raw?.scoringPlays) ? raw.scoringPlays : [];
  const out: ScoringPlay[] = [];

  for (const p of plays) {
    try {
      const id = str(p?.id) ?? `${gameId}-${num(p?.sequenceNumber) ?? out.length}`;
      const teamId = str(p?.team?.id);
      const side =
        game && teamId
          ? game.home.id === teamId
            ? game.home
            : game.away.id === teamId
              ? game.away
              : null
          : null;

      out.push({
        id,
        gameId,
        sequence: num(p?.sequenceNumber) ?? out.length,
        scoringType: str(p?.scoringType?.abbreviation) ?? str(p?.type?.abbreviation),
        text: str(p?.text) ?? str(p?.type?.text) ?? 'Scoring play',
        period: num(p?.period?.number) ?? 0,
        clock: str(p?.clock?.displayValue),
        teamId,
        teamName: side?.displayName ?? str(p?.team?.displayName),
        teamLogo:
          side?.logo ??
          str(p?.team?.logo) ??
          (teamId ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${teamId}.png` : null),
        awayScore: num(p?.awayScore) ?? 0,
        homeScore: num(p?.homeScore) ?? 0,
        awayAbbr: game?.away.abbreviation ?? '',
        homeAbbr: game?.home.abbreviation ?? '',
        wallclock: str(p?.wallclock),
      });
    } catch (err) {
      console.error('[espn] skipped malformed scoring play:', err);
    }
  }

  return out.sort((a, b) => a.sequence - b.sequence);
}
