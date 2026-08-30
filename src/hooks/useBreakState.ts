import { useEffect, useMemo, useRef, useState } from 'react';
import { BREAK } from '../../config';
import type { Game, PlaysResponse } from '../../shared/types';

export type BreakTrigger = 'halftime' | 'period-end' | 'scoring' | 'manual';

export interface BreakState {
  active: boolean;
  trigger: BreakTrigger | null;
  /** Whole seconds remaining on the current hold, for a progress indicator. */
  secondsLeft: number;
  focusGame: Game | null;
}

interface Options {
  games: Game[];
  plays: PlaysResponse | null;
  favorites: string[];
  isFavorite: (game: Game) => boolean;
  /** Pin to one game id. Opaque and changes weekly — prefer watchTeam. */
  pinnedGameId?: string | null;
  /**
   * The team you are actually watching, e.g. "Georgia".
   *
   * Pinning by TEAM rather than game id is what makes this survive the week:
   * an ESPN event id is opaque and different every Saturday, whereas "Georgia"
   * resolves to whatever game Georgia is in today.
   */
  watchTeam?: string | null;
  /** Team matcher, injected so this hook stays league-agnostic. */
  matchesTeam?: (game: Game, team: string) => boolean;
  /** Always on — for a manual hotkey source. */
  force?: boolean;
  /** Auto-detection disabled — manual only. */
  autoEnabled?: boolean;
  enabledTriggers?: { halftime: boolean; periodEnd: boolean; scoringPlay: boolean };
}

/**
 * Predicts commercial breaks from game state.
 *
 * The signals, in descending confidence: halftime and the end of a quarter are
 * certain, a scoring play is near-certain (there is a break before the kickoff
 * and usually after it). Anything less reliable than that is deliberately left
 * out — a false positive covers the game you are trying to watch, which is
 * worse than missing a break.
 */
export function useBreakState({
  games,
  plays,
  isFavorite,
  pinnedGameId,
  watchTeam,
  matchesTeam,
  force = false,
  autoEnabled = true,
  enabledTriggers = BREAK.triggers,
}: Options): BreakState {
  /**
   * Which game the overlay is watching.
   *
   * The app cannot know what is on your television, so this is a stated
   * preference rather than a detection. In order: an explicit game id, then
   * the team you said you are watching, then a guess — the first in-progress
   * favorite. The guess is only right when one favorite is playing; on a
   * Saturday with three it is a coin toss, which is why watchTeam exists.
   */
  const focusGame = useMemo(() => {
    if (pinnedGameId) {
      const pinned = games.find((g) => g.id === pinnedGameId);
      if (pinned) return pinned;
    }

    if (watchTeam && matchesTeam) {
      const watched = games.filter((g) => matchesTeam(g, watchTeam));
      // Prefer the live one if that team somehow appears twice.
      const hit = watched.find((g) => g.state === 'in') ?? watched[0];
      if (hit) return hit;
    }

    const favorites = games.filter(isFavorite);
    return (
      favorites.find((g) => g.state === 'in') ??
      favorites[0] ??
      games.find((g) => g.state === 'in') ??
      null
    );
  }, [games, pinnedGameId, watchTeam, matchesTeam, isFavorite]);

  const [until, setUntil] = useState<number | null>(null);
  const [trigger, setTrigger] = useState<BreakTrigger | null>(null);
  const [, tick] = useState(0);

  // Remembered so a signal only fires once per occurrence.
  const lastPeriod = useRef<number | null>(null);
  const lastStatus = useRef<string | null>(null);
  const seenPlays = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  /** Breaks the user ended early; never re-raised for the same occurrence. */
  const dismissed = useRef<Set<string>>(new Set());

  const raise = (next: BreakTrigger, seconds: number, key: string) => {
    if (dismissed.current.has(key)) return;
    const capped = Math.min(seconds, BREAK.maxHoldSeconds);
    setTrigger(next);
    setUntil(Date.now() + capped * 1000);
  };

  // --- halftime and end of quarter ----------------------------------------
  useEffect(() => {
    if (!autoEnabled || !focusGame) return;
    const status = focusGame.statusDetail || focusGame.shortDetail || '';
    const period = focusGame.period;

    // The first observation only establishes a baseline. Without this, opening
    // the overlay mid-quarter would read the current period as a change.
    if (!primed.current) {
      primed.current = true;
      lastPeriod.current = period;
      lastStatus.current = status;
      return;
    }

    const isHalftime = /halftime|half\b/i.test(status);
    const wasHalftime = /halftime|half\b/i.test(lastStatus.current ?? '');
    if (enabledTriggers.halftime && isHalftime && !wasHalftime) {
      raise('halftime', BREAK.hold.halftime, `half-${focusGame.id}`);
    } else if (
      enabledTriggers.periodEnd &&
      lastPeriod.current !== null &&
      period > lastPeriod.current &&
      !isHalftime
    ) {
      raise('period-end', BREAK.hold.periodEnd, `period-${focusGame.id}-${period}`);
    }

    lastPeriod.current = period;
    lastStatus.current = status;
  }, [focusGame, autoEnabled, enabledTriggers.halftime, enabledTriggers.periodEnd]);

  // --- scoring plays -------------------------------------------------------
  useEffect(() => {
    if (!plays) return;
    const relevant = focusGame
      ? plays.plays.filter((p) => p.gameId === focusGame.id)
      : plays.plays;

    const fresh = relevant.filter((p) => !seenPlays.current.has(p.id));
    for (const p of relevant) seenPlays.current.add(p.id);

    // Absorb the backlog on first load, or opening the overlay at halftime
    // would fire for every touchdown already scored.
    if (seenPlays.current.size === relevant.length && fresh.length === relevant.length) return;
    if (!autoEnabled || !enabledTriggers.scoringPlay || fresh.length === 0) return;

    const newest = fresh[fresh.length - 1];
    raise('scoring', BREAK.hold.scoringPlay, `play-${newest.id}`);
  }, [plays, focusGame, autoEnabled, enabledTriggers.scoringPlay]);

  // --- countdown -----------------------------------------------------------
  useEffect(() => {
    if (until === null) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [until]);

  // --- dismissal via OBS source visibility ---------------------------------
  useEffect(() => {
    // Hiding the source in OBS is how "end it early" is bound to a hotkey.
    // If the page is told it went hidden mid-break, mark that occurrence
    // dismissed so re-showing the source does not immediately raise it again.
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      if (until !== null && Date.now() < until && trigger) {
        dismissed.current.add(currentKey(trigger, focusGame?.id, plays));
        setUntil(null);
        setTrigger(null);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [until, trigger, focusGame, plays]);

  const active = force || (until !== null && Date.now() < until);
  const secondsLeft = until === null ? 0 : Math.max(0, Math.ceil((until - Date.now()) / 1000));

  return {
    active,
    trigger: force ? 'manual' : active ? trigger : null,
    secondsLeft,
    focusGame,
  };
}

function currentKey(
  trigger: BreakTrigger,
  gameId: string | undefined,
  plays: PlaysResponse | null,
): string {
  if (trigger === 'scoring') {
    const last = plays?.plays.at(-1);
    return `play-${last?.id ?? 'unknown'}`;
  }
  return `${trigger}-${gameId ?? 'unknown'}`;
}
