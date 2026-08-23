import { useCallback, useMemo, useRef, useState } from 'react';
import { WALL } from '../../config';
import type { Game, HighlightVideo } from '../../shared/types';
import type { LeagueConfig } from '../../shared/leagues/types';
import {
  isHighlightReel,
  matchTitleToGame,
  relevanceFor,
  type Relevance,
} from '../lib/matchTitle';
import { isFavorite } from '../lib/sortGames';

export interface QueuedVideo extends HighlightVideo {
  /** The game this clip was matched to, when the title cleared the bar. */
  game: Game | null;
  favorite: boolean;
  relevance: Relevance;
  /** Title looks like a highlight reel rather than an interview or preview. */
  reel: boolean;
}

/**
 * Ordering and bookkeeping for the highlight wall's playlist.
 *
 * Two things are permanently excluded once they happen:
 *   - anything already played this session (no repeats until a reload)
 *   - anything the player refused (embedding disabled, 101/150) — retrying it
 *     later would stall the wall in exactly the same way
 *
 * Neither set is persisted. Per the spec these run on TV browsers with
 * unpredictable storage, so session memory is the only state we trust.
 */
export function useHighlightQueue(
  videos: HighlightVideo[],
  games: Game[],
  favorites: string[],
  league: LeagueConfig,
) {
  const played = useRef<Set<string>>(new Set());
  const rejected = useRef<Set<string>>(new Set());
  const [version, setVersion] = useState(0);

  const queue = useMemo<QueuedVideo[]>(() => {
    void version; // recompute when something is consumed

    const annotated = videos
      .filter((v) => !played.current.has(v.videoId) && !rejected.current.has(v.videoId))
      .map<QueuedVideo>((v) => {
        const match = matchTitleToGame(v.title, games, league);
        return {
          ...v,
          game: match?.game ?? null,
          favorite: match ? isFavorite(match.game, favorites, league) : false,
          relevance: match ? 'game' : relevanceFor(v.title, games, league),
          reel: isHighlightReel(v.title),
        };
      })
      // Keep the wall about college football. These channels also cover the
      // NBA, fantasy leagues and Little League; none of that belongs here.
      .filter((v) => {
        if (WALL.filler === 'all') return true;
        if (WALL.filler === 'none') return v.relevance === 'game';
        if (v.relevance === 'none') return false;
        // A clip matched to a real game is a highlight by definition; for
        // everything else, require it to look like a reel rather than talk.
        if (WALL.filler === 'highlights-only') return v.relevance === 'game' || v.reel;
        return true;
      });

    // Favorites first, then anything matched to a real game, then filler.
    // Within a tier: newest upload, then the channel we trust most.
    // Favorites, then any real game, then a clip about a team, then general
    // college football talk.
    const tier = (v: QueuedVideo) =>
      v.favorite ? 0 : v.game ? 1 : v.relevance === 'team' ? 2 : 3;
    return annotated.sort((a, b) => {
      const ta = tier(a);
      const tb = tier(b);
      if (ta !== tb) return ta - tb;
      const pub = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      if (pub !== 0) return pub;
      return b.priority - a.priority;
    });
  }, [videos, games, favorites, league, version]);

  const current = queue[0] ?? null;

  const markPlayed = useCallback((videoId: string) => {
    played.current.add(videoId);
    setVersion((v) => v + 1);
  }, []);

  const markRejected = useCallback((videoId: string, code: number) => {
    rejected.current.add(videoId);
    console.warn(`[wall] dropping ${videoId} from the queue (player error ${code})`);
    setVersion((v) => v + 1);
  }, []);

  return {
    current,
    upNext: queue.slice(1, 4),
    matchedCount: queue.filter((v) => v.game).length,
    queueLength: queue.length,
    playedCount: played.current.size,
    rejectedCount: rejected.current.size,
    markPlayed,
    markRejected,
  };
}
