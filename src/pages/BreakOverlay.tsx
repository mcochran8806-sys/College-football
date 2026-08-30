import { useCallback, useEffect, useMemo } from 'react';
import { BREAK, INTERVALS } from '../../config';
import GameCard from '../components/GameCard';
import { useBreakState } from '../hooks/useBreakState';
import { useFavorites } from '../hooks/useFavorites';
import { useLeague } from '../hooks/useLeague';
import { usePoll } from '../hooks/usePoll';
import { getPlays, getScoreboard } from '../lib/api';
import { longDate } from '../lib/format';
import { isFavoriteGame } from '../../shared/favorites';
import { filterSlate, isFavorite, sortGames } from '../lib/sortGames';
import type { Game } from '../../shared/types';

/**
 * Commercial-break overlay for an OBS Browser Source.
 *
 * Sits in the scene permanently and renders NOTHING most of the time, so no
 * scene switching or OBS automation is needed — it raises itself when the game
 * data says a break is likely, and stands down when the game resumes.
 *
 * Hotkeys are handled through OBS source visibility rather than keyboard
 * events, because a background browser source never receives key input. See
 * the README for the two-source binding.
 */
export default function BreakOverlay() {
  const league = useLeague();
  const { teams: favorites } = useFavorites(league);

  const loadScoreboard = useCallback(() => getScoreboard(league.id), [league]);
  const loadPlays = useCallback(() => getPlays(favorites, league.id), [favorites, league]);
  const { data } = usePoll(loadScoreboard, INTERVALS.scoreboardPoll);
  const plays = usePoll(loadPlays, INTERVALS.playsPoll);

  const params = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search);
    } catch {
      return new URLSearchParams();
    }
  }, []);

  const force = params.get('force') === '1';
  const autoEnabled = params.get('auto') !== '0';
  const pinnedGameId = params.get('game');
  const watchTeam = params.get('watch');
  const enabledTriggers = {
    halftime: params.get('halftime') !== 'false' && BREAK.triggers.halftime,
    periodEnd: params.get('quarters') !== 'false' && BREAK.triggers.periodEnd,
    scoringPlay: params.get('scores') !== 'false' && BREAK.triggers.scoringPlay,
  };

  const games = useMemo(() => data?.games ?? [], [data]);
  const favorite = useCallback((g: Game) => isFavorite(g, favorites, league), [favorites, league]);
  const matchesTeam = useCallback(
    (g: Game, team: string) => isFavoriteGame(g, [team], league),
    [league],
  );

  const state = useBreakState({
    games,
    plays: plays.data,
    favorites,
    isFavorite: favorite,
    pinnedGameId,
    watchTeam,
    matchesTeam,
    force,
    autoEnabled,
    enabledTriggers,
  });

  // OBS composites on page alpha; index.css paints html, body and #root for
  // the TV screens, and any one of them left opaque hides the whole scene.
  useEffect(() => {
    const targets = [document.documentElement, document.body, document.getElementById('root')]
      .filter((el): el is HTMLElement => el !== null);
    const previous = targets.map((el) => [el.style.background, el.style.height] as const);
    for (const el of targets) {
      el.style.background = 'transparent';
      el.style.height = '100%';
    }
    return () => {
      targets.forEach((el, i) => {
        el.style.background = previous[i][0];
        el.style.height = previous[i][1];
      });
    };
  }, []);

  const shown = useMemo(() => {
    const slate = sortGames(filterSlate(games, favorites, league), favorites, league);
    return slate.slice(0, 6);
  }, [games, favorites, league]);

  const label =
    state.trigger === 'halftime'
      ? 'Halftime'
      : state.trigger === 'period-end'
        ? 'End of Quarter'
        : state.trigger === 'scoring'
          ? 'Scoring Play'
          : null;

  return (
    <div
      className="h-full w-full overflow-hidden"
      style={{
        opacity: state.active ? 1 : 0,
        transition: `opacity ${BREAK.fadeMs}ms ease-in-out`,
        // Never intercept clicks in OBS, even mid-fade.
        pointerEvents: 'none',
      }}
    >
      <div className="flex h-full w-full flex-col bg-field-950/97 p-[3%]">
        <header className="flex shrink-0 items-baseline justify-between pb-4">
          <div className="flex items-baseline gap-4">
            <h1 className="text-4xl font-bold tracking-tight text-field-100">
              {league.label} Scoreboard
            </h1>
            {label && (
              <span className="rounded bg-close/20 px-3 py-1 text-xl font-semibold text-close">
                {label}
              </span>
            )}
            {/* Name the game that raised this, so it is obvious which one the
                overlay is following — and obvious when it is following the
                wrong one. */}
            {state.focusGame && (
              <span data-focus-game className="text-xl text-field-500">
                {state.focusGame.away.shortDisplayName} @ {state.focusGame.home.shortDisplayName}
              </span>
            )}
          </div>
          <span className="text-2xl text-field-500">{longDate()}</span>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-5">
          {shown.map((game) => (
            <GameCard key={game.id} game={game} favorite={favorite(game)} />
          ))}
        </main>

        {/* A quiet indicator that the overlay will stand down on its own,
            so it never looks like it has frozen. */}
        {!force && state.secondsLeft > 0 && (
          <footer className="shrink-0 pt-3 text-right text-lg text-field-500">
            back to the game in {formatCountdown(state.secondsLeft)}
          </footer>
        )}
      </div>
    </div>
  );
}

function formatCountdown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
