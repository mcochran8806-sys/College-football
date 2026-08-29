import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { INTERVALS, TICKER } from '../../config';
import { useFavorites } from '../hooks/useFavorites';
import { useLeague } from '../hooks/useLeague';
import { usePoll } from '../hooks/usePoll';
import { getScoreboard } from '../lib/api';
import { statusLine } from '../lib/format';
import { isCloseAndLate, isFavorite, sortGames } from '../lib/sortGames';
import type { Game } from '../../shared/types';
import TeamLogo from '../components/TeamLogo';

/**
 * Broadcast-style score ticker for an OBS Browser Source.
 *
 * Not a TV screen: no overscan padding, no burn-in shift, no pagination. It
 * fills whatever height the OBS source is set to and composites over the rest
 * of the scene, so the page background must be genuinely transparent — OBS
 * respects page alpha, but only if nothing paints over it.
 *
 * The crawl animates a single `transform: translateX`, which OBS's compositor
 * handles cheaply. Anything that triggers layout per frame would show up as
 * dropped frames in the stream.
 */
export default function Ticker() {
  const league = useLeague();
  const { teams: favorites } = useFavorites(league);
  const loadScoreboard = useCallback(() => getScoreboard(league.id), [league]);
  const { data } = usePoll(loadScoreboard, INTERVALS.scoreboardPoll);

  const params = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search);
    } catch {
      return new URLSearchParams();
    }
  }, []);

  const style = (params.get('style') ?? TICKER.style) as 'scroll' | 'flip';
  const speed = Number(params.get('speed') ?? TICKER.speedPxPerSecond) || TICKER.speedPxPerSecond;
  const solid = (params.get('bg') ?? TICKER.background) === 'solid';

  // OBS composites on page alpha. index.css paints a background on html/body
  // for the TV screens, so it has to be cleared here or the ticker arrives as
  // an opaque black bar.
  useEffect(() => {
    // #root matters as much as html and body — index.css paints all three, and
    // missing one leaves an opaque bar exactly the height of the content.
    const targets = [document.documentElement, document.body, document.getElementById('root')]
      .filter((el): el is HTMLElement => el !== null);
    const previous = targets.map((el) => [el.style.background, el.style.height] as const);
    for (const el of targets) {
      el.style.background = 'transparent';
      // Fill the source height OBS is set to, rather than shrinking to content.
      el.style.height = '100%';
    }
    return () => {
      targets.forEach((el, i) => {
        el.style.background = previous[i][0];
        el.style.height = previous[i][1];
      });
    };
  }, []);

  const games = useMemo(() => {
    const all = sortGames(data?.games ?? [], favorites, league);
    const wantUpcoming = (params.get('upcoming') ?? String(TICKER.includeUpcoming)) !== 'false';
    const wantFinal = (params.get('final') ?? String(TICKER.includeFinal)) !== 'false';
    return all.filter((g) => {
      if (g.state === 'pre') return wantUpcoming;
      if (g.state === 'post') return wantFinal;
      return true;
    });
  }, [data, favorites, league, params]);

  if (games.length === 0) return <div className="h-full w-full" />;

  return style === 'flip' ? (
    <FlipTicker games={games} favorites={favorites} league={league} solid={solid} />
  ) : (
    <ScrollTicker games={games} favorites={favorites} league={league} solid={solid} speed={speed} />
  );
}

interface TickerProps {
  games: Game[];
  favorites: string[];
  league: ReturnType<typeof useLeague>;
  solid: boolean;
}

function ScrollTicker({ games, favorites, league, solid, speed }: TickerProps & { speed: number }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState(60);

  // Duration is derived from the measured width so the crawl runs at a
  // constant pixels-per-second regardless of how many games are on the slate.
  // A fixed duration would sprint through 12 games and crawl through 60.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      // The track holds two copies; one copy's width is what scrolls past.
      const half = el.scrollWidth / 2;
      if (half > 0) setDuration(Math.max(10, half / speed));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [games, speed]);

  return (
    <div
      className={
        'flex h-full w-full items-center overflow-hidden ' +
        (solid ? 'bg-field-950/95' : 'bg-transparent')
      }
      // Every size inside is in em, so this one value scales the whole ticker
      // to whatever height the OBS source is set to — 60px or 140px both work.
      style={{ fontSize: 'calc(100vh * 0.34)' }}
    >
      <div
        ref={trackRef}
        className="flex shrink-0 items-center will-change-transform"
        style={{ animation: `ticker-crawl ${duration}s linear infinite` }}
      >
        {/* Two copies, animated -50%, so the loop is seamless rather than
            snapping back to the start. */}
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
            {games.map((game) => (
              <TickerItem
                key={`${copy}-${game.id}`}
                game={game}
                favorite={isFavorite(game, favorites, league)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlipTicker({ games, favorites, league, solid }: TickerProps) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const hold = Number(TICKER.flipSeconds) * 1000;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % games.length);
        setVisible(true);
      }, 300);
    }, hold);
    return () => clearInterval(id);
  }, [games.length]);

  const game = games[index % games.length];
  if (!game) return null;

  return (
    <div
      className={
        'flex h-full w-full items-center justify-center overflow-hidden ' +
        (solid ? 'bg-field-950/95' : 'bg-transparent')
      }
      style={{ fontSize: 'calc(100vh * 0.34)' }}
    >
      <div
        className={'transition-opacity duration-300 ' + (visible ? 'opacity-100' : 'opacity-0')}
      >
        <TickerItem
          game={game}
          favorite={isFavorite(game, favorites, league)}
          showDivider={false}
        />
      </div>
    </div>
  );
}

/** One game, sized to the source height rather than to a fixed pixel value. */
function TickerItem({
  game,
  favorite,
  showDivider = true,
}: {
  game: Game;
  favorite: boolean;
  /** The crawl separates adjacent games; a lone flipped game needs no divider. */
  showDivider?: boolean;
}) {
  const live = game.state === 'in';
  const close = isCloseAndLate(game);
  const redZone = game.situation?.isRedZone === true;

  return (
    <div className="flex h-full shrink-0 items-center gap-[0.6em] px-[1.1em]">
      {/* A divider rather than a border, so it never affects layout width. */}
      {showDivider && <span className="mr-[0.4em] h-[1.6em] w-px bg-white/15" />}

      {favorite && <span className="text-[0.85em] leading-none text-close">★</span>}

      <TeamLogo src={game.away.logo} size="h-[1.5em] w-[1.5em]" />
      <span className="text-[0.95em] font-semibold tracking-tight text-white">
        {game.away.abbreviation}
      </span>
      <span
        className={
          'text-[1.05em] font-bold tabular-nums ' + (game.away.winner ? 'text-white' : 'text-white/85')
        }
      >
        {game.away.score ?? '–'}
      </span>

      <span className="px-[0.2em] text-[0.75em] text-white/40">at</span>

      <TeamLogo src={game.home.logo} size="h-[1.5em] w-[1.5em]" />
      <span className="text-[0.95em] font-semibold tracking-tight text-white">
        {game.home.abbreviation}
      </span>
      <span
        className={
          'text-[1.05em] font-bold tabular-nums ' + (game.home.winner ? 'text-white' : 'text-white/85')
        }
      >
        {game.home.score ?? '–'}
      </span>

      <span
        className={
          'pl-[0.35em] text-[0.72em] whitespace-nowrap ' +
          (redZone
            ? 'font-bold text-redzone'
            : close
              ? 'font-semibold text-close'
              : live
                ? 'text-live'
                : 'text-white/50')
        }
      >
        {redZone ? 'RED ZONE' : statusLine(game)}
      </span>
    </div>
  );
}
