import { useEffect, useMemo, useState } from 'react';
import { GAMES_PER_PAGE, INTERVALS, SLATE } from '../../config';
import GameCard from '../components/GameCard';
import ScoreboardHeader from '../components/ScoreboardHeader';
import { useBurnInShift } from '../hooks/useBurnInShift';
import { useFavorites } from '../hooks/useFavorites';
import { usePoll, useSecondsSince } from '../hooks/usePoll';
import { getScoreboard } from '../lib/api';
import { filterSlate, isFavorite, paginate, sortGames } from '../lib/sortGames';

/**
 * Screen 1. Non-interactive, unattended, twelve hours at a stretch.
 *
 * Never scrolls: more games than fit means another page, auto-advanced on a
 * timer with a cross-fade. Nobody is holding a mouse.
 */
export default function Scoreboard() {
  const { data, updatedAt, failures } = usePoll(getScoreboard, INTERVALS.scoreboardPoll);
  const secondsSince = useSecondsSince(updatedAt);
  const shift = useBurnInShift();
  const { teams: favorites, source: favoritesSource } = useFavorites();

  const games = useMemo(
    () => sortGames(filterSlate(data?.games ?? [], favorites), favorites),
    [data, favorites],
  );
  const pages = useMemo(() => {
    const all = paginate(games, GAMES_PER_PAGE);
    return SLATE.maxPages > 0 ? all.slice(0, SLATE.maxPages) : all;
  }, [games]);

  const [pageIndex, setPageIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Clamp when the slate shrinks (games ending late at night) so we can't get
  // stranded on a page that no longer exists.
  useEffect(() => {
    if (pageIndex >= pages.length) setPageIndex(0);
  }, [pages.length, pageIndex]);

  // Auto-advance with a fade: out, swap, in.
  useEffect(() => {
    if (pages.length <= 1) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPageIndex((i) => (i + 1) % pages.length);
        setVisible(true);
      }, 400);
    }, INTERVALS.pageAdvance);
    return () => clearInterval(id);
  }, [pages.length]);

  const page = pages[pageIndex] ?? [];

  return (
    // 4% padding on every edge. Plenty of TVs overscan and clip whatever is
    // outside that margin — including, on some sets, the entire top row.
    <div className="tv-screen h-full w-full p-[4%]">
      <div
        className="flex h-full w-full flex-col transition-transform duration-1000 ease-in-out"
        style={{ transform: shift.transform }}
      >
        <ScoreboardHeader
          secondsSinceUpdate={secondsSince}
          stale={data?.stale ?? false}
          degraded={failures > 0}
          mock={data?.mock ?? false}
          pageCount={pages.length}
          pageIndex={pageIndex}
          gameCount={games.length}
          shownCount={pages.reduce((n, p) => n + p.length, 0)}
          favorites={favorites}
          favoritesSource={favoritesSource}
        />

        {games.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-3xl text-field-500">
            {data ? 'No FBS games on the slate.' : 'Loading the slate…'}
          </div>
        ) : (
          <main
            className={
              'grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-5 transition-opacity duration-500 ' +
              (visible ? 'opacity-100' : 'opacity-0')
            }
          >
            {page.map((game) => (
              <GameCard key={game.id} game={game} favorite={isFavorite(game, favorites)} />
            ))}
          </main>
        )}
      </div>
    </div>
  );
}
