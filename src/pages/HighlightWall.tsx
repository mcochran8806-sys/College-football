import { useCallback, useEffect, useMemo, useState } from 'react';
import { INTERVALS } from '../../config';
import CompactScoreboard from '../components/CompactScoreboard';
import ScoreCard from '../components/ScoreCard';
import YouTubeStage from '../components/YouTubeStage';
import { useBurnInShift } from '../hooks/useBurnInShift';
import { useFavorites } from '../hooks/useFavorites';
import { useLeague } from '../hooks/useLeague';
import { useHighlightQueue } from '../hooks/useHighlightQueue';
import { usePoll } from '../hooks/usePoll';
import { useScoreCards } from '../hooks/useScoreCards';
import { getHighlights, getPlays, getScoreboard } from '../lib/api';

/**
 * Screen 2. Auto-rotating highlight wall.
 *
 * Priority of what's on screen at any moment:
 *   1. A new scoring play in a favorite game — interrupts immediately, holds
 *      12 seconds, then hands the screen back to the paused clip.
 *   2. The next unplayed highlight clip.
 *   3. Dead-air filler: recent score cards alternating with a compact
 *      scoreboard, so an empty queue never means a black screen.
 */
export default function HighlightWall() {
  const league = useLeague();
  const { teams: favorites } = useFavorites(league);
  const loadScoreboard = useCallback(() => getScoreboard(league.id), [league]);
  const loadHighlights = useCallback(() => getHighlights(league.id), [league]);
  const loadPlays = useCallback(() => getPlays(favorites, league.id), [favorites, league]);
  const scoreboard = usePoll(loadScoreboard, INTERVALS.scoreboardPoll);
  const highlights = usePoll(loadHighlights, INTERVALS.highlightsPoll);
  const plays = usePoll(loadPlays, INTERVALS.playsPoll);

  const games = useMemo(() => scoreboard.data?.games ?? [], [scoreboard.data]);
  const videos = useMemo(() => highlights.data?.videos ?? [], [highlights.data]);

  const { current, queueLength, playedCount, markPlayed, markRejected } = useHighlightQueue(
    videos,
    games,
    favorites,
    league,
  );
  const { activeCard, recentCards } = useScoreCards(plays.data);

  const [started, setStarted] = useState(false);
  const shift = useBurnInShift();

  // Dead-air rotation index, used only when there is no clip to play.
  const [fillerIndex, setFillerIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFillerIndex((i) => i + 1), INTERVALS.fallbackRotate);
    return () => clearInterval(id);
  }, []);

  const gameFor = (gameId: string) => games.find((g) => g.id === gameId);

  // A score card interrupts whatever is playing; the clip resumes after.
  const showingCard = activeCard !== null;
  const hasVideo = current !== null;

  const filler = (() => {
    if (recentCards.length === 0) return <CompactScoreboard games={games} favorites={favorites} league={league} />;
    // Alternate: scoreboard, card, scoreboard, card…
    const slot = fillerIndex % (recentCards.length + 1);
    if (slot === 0) return <CompactScoreboard games={games} favorites={favorites} league={league} />;
    const play = recentCards[slot - 1];
    return <ScoreCard play={play} game={gameFor(play.gameId)} />;
  })();

  return (
    <div className="tv-screen relative w-full bg-field-950">
      <div className="h-full w-full" style={{ transform: shift.transform }}>
        {/* The player stays mounted for the whole session even while a card is
            over it — remounting the iframe per clip leaks memory on TV
            browsers and black-flashes between videos. */}
        <div className={`h-full w-full ${hasVideo ? '' : 'invisible'}`}>
          <YouTubeStage
            videoId={current?.videoId ?? null}
            audioUnlocked={started}
            paused={showingCard || !started}
            onEnded={() => {
              if (current) markPlayed(current.videoId);
            }}
            onUnplayable={(code) => {
              if (current) markRejected(current.videoId, code);
            }}
          />
        </div>

        {!hasVideo && <div className="absolute inset-0">{filler}</div>}

        {showingCard && (
          <div className="absolute inset-0 z-20">
            <ScoreCard play={activeCard} game={gameFor(activeCard.gameId)} />
          </div>
        )}

        {/* Small, permanently-dim caption. Tells you what you're watching and
            whether the wall has anything left in the tank. */}
        {hasVideo && !showingCard && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-field-950 via-field-950/80 to-transparent px-[4%] pb-[3%] pt-16">
            <div className="flex items-end justify-between gap-8">
              <div className="min-w-0">
                {current?.game && (
                  <div className="pb-1 text-2xl font-semibold uppercase tracking-[0.18em] text-close">
                    {current.game.away.shortDisplayName} @ {current.game.home.shortDisplayName}
                  </div>
                )}
                <h2 className="truncate text-4xl font-semibold text-field-100">{current?.title}</h2>
              </div>
              <div className="shrink-0 text-right text-xl text-field-500">
                <div>{current?.channelName}</div>
                <div>
                  {queueLength - 1} queued · {playedCount} played
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {!started && (
        <TapToStart
          onStart={() => setStarted(true)}
          ready={hasVideo || games.length > 0}
          league={league}
        />
      )}

      {highlights.data?.quotaExhausted && (
        <div className="absolute right-[4%] top-[4%] z-30 rounded bg-close/20 px-3 py-1 text-lg font-semibold text-close">
          YouTube quota exhausted — showing cached clips
        </div>
      )}
    </div>
  );
}

/**
 * Browsers refuse to start audio without a real user gesture, so the wall
 * needs exactly one tap in its whole twelve-hour run. After this it never asks
 * again.
 */
function TapToStart({
  onStart,
  ready,
  league,
}: {
  onStart: () => void;
  ready: boolean;
  league: { label: string };
}) {
  useEffect(() => {
    // A Fire Stick remote's OK button arrives as a key event, not a click.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') onStart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  return (
    <button
      type="button"
      onClick={onStart}
      className="wants-cursor absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-field-950/95 text-center"
    >
      <span className="text-8xl font-bold tracking-tight text-field-100">Tap to start</span>
      <span className="max-w-3xl text-3xl leading-relaxed text-field-500">
        One tap unlocks audio and starts the wall. It runs unattended after this
        — no further input needed.
      </span>
      <span className="pt-4 text-2xl text-field-700">
        {league.label} · {ready ? 'highlights ready' : 'loading today’s slate…'}
      </span>
    </button>
  );
}
