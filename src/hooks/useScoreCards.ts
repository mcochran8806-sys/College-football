import { useEffect, useRef, useState } from 'react';
import { INTERVALS } from '../../config';
import type { PlaysResponse, ScoringPlay } from '../../shared/types';

/**
 * Turns the /api/plays feed into a queue of interstitials.
 *
 * The server deliberately returns the FULL scoring-play feed rather than a
 * diff — serverless instances don't share memory, so a server-side diff would
 * duplicate or drop cards depending on which instance answered. The seen-set
 * lives here instead, in the one process that actually knows what has been on
 * screen.
 *
 * The first payload is absorbed silently. Otherwise a wall started at halftime
 * would immediately fire eight cards for touchdowns nobody is waiting on.
 */
export function useScoreCards(plays: PlaysResponse | null) {
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  const [queue, setQueue] = useState<ScoringPlay[]>([]);
  const [active, setActive] = useState<ScoringPlay | null>(null);
  /** Kept for the dead-air rotation, newest first. */
  const [recent, setRecent] = useState<ScoringPlay[]>([]);

  useEffect(() => {
    if (!plays) return;

    const fresh: ScoringPlay[] = [];
    for (const play of plays.plays) {
      if (seen.current.has(play.id)) continue;
      seen.current.add(play.id);
      fresh.push(play);
    }

    if (!primed.current) {
      primed.current = true;
      setRecent(plays.plays.slice(-6).reverse());
      return; // absorb the backlog, don't fire cards for it
    }

    if (fresh.length === 0) return;
    setQueue((q) => [...q, ...fresh]);
    setRecent((r) => [...fresh.reverse(), ...r].slice(0, 8));
  }, [plays]);

  // Promote one card at a time and hold it for its full duration.
  useEffect(() => {
    if (active || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setActive(next);
  }, [queue, active]);

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setActive(null), INTERVALS.scoreCardHold);
    return () => clearTimeout(id);
  }, [active]);

  return { activeCard: active, pendingCards: queue.length, recentCards: recent };
}
