import { longDate } from '../lib/format';
import PageDots from './PageDots';

interface Props {
  secondsSinceUpdate: number | null;
  stale: boolean;
  degraded: boolean;
  mock: boolean;
  pageCount: number;
  pageIndex: number;
  gameCount: number;
  /** How many are actually in the rotation after the page cap. */
  shownCount: number;
  favorites: string[];
  favoritesSource: 'url' | 'storage' | 'config';
  leagueLabel: string;
}

export default function ScoreboardHeader({
  secondsSinceUpdate,
  stale,
  degraded,
  mock,
  pageCount,
  pageIndex,
  gameCount,
  shownCount,
  favorites,
  favoritesSource,
  leagueLabel,
}: Props) {
  const freshness =
    secondsSinceUpdate === null ? 'connecting…' : `updated ${secondsSinceUpdate}s ago`;

  // Green while the feed is healthy, amber once it's serving stale data or a
  // poll has failed. Visible from the couch, ignorable when everything's fine.
  const dot = degraded || stale ? 'bg-close' : 'bg-live';

  return (
    <header className="flex shrink-0 items-baseline justify-between pb-3">
      <div className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-field-100">{longDate()}</h1>
        <span className="rounded bg-field-800 px-2 py-0.5 text-base font-semibold uppercase tracking-wider text-field-300">
          {leagueLabel}
        </span>
        <span className="text-lg text-field-500">
          {shownCount < gameCount
            ? `${shownCount} of ${gameCount} games`
            : `${gameCount} ${gameCount === 1 ? 'game' : 'games'}`}
        </span>
        {/* Which favorites are live on this screen. Without this you have no
            way to tell whether a ?favorites= URL actually took effect. */}
        {favorites.length > 0 && (
          <span className="max-w-[36rem] truncate text-lg text-field-500">
            ★ {favorites.join(' · ')}
            {favoritesSource === 'config' && ' (defaults)'}
          </span>
        )}
        {mock && (
          <span className="rounded bg-close/20 px-2 py-0.5 text-sm font-semibold text-close">
            MOCK DATA
          </span>
        )}
      </div>

      <div className="flex items-center gap-6">
        <PageDots count={pageCount} active={pageIndex} />
        <div className="flex items-center gap-2 text-lg text-field-500">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <span>{stale ? `${freshness} · stale` : freshness}</span>
        </div>
      </div>
    </header>
  );
}
