import type { Game } from '../../shared/types';
import { statusLine } from '../lib/format';
import { isCloseAndLate, sortGames } from '../lib/sortGames';
import TeamLogo from './TeamLogo';

interface Props {
  games: Game[];
  favorites: string[];
  limit?: number;
}

/**
 * Dead-air filler for the highlight wall: when the video queue is empty and
 * there's no fresh scoring play to show, this beats a black screen.
 */
export default function CompactScoreboard({ games, favorites, limit = 10 }: Props) {
  const rows = sortGames(games.filter((g) => g.state !== 'pre'), favorites).slice(0, limit);

  return (
    <div className="animate-fade-up flex h-full w-full flex-col justify-center gap-4 bg-field-950 p-[4%]">
      <h2 className="pb-2 text-3xl font-semibold tracking-tight text-field-500">
        Around the country
      </h2>
      {rows.length === 0 && (
        <p className="text-4xl text-field-500">Waiting on kickoff…</p>
      )}
      {rows.map((game) => (
        <div
          key={game.id}
          className={
            'flex items-center gap-6 rounded-xl border px-5 py-3 ' +
            (isCloseAndLate(game) ? 'border-close/60 bg-field-900' : 'border-field-800 bg-field-900')
          }
        >
          <div className="flex flex-1 items-center gap-4">
            <TeamLogo src={game.away.logo} size="h-9 w-9" />
            <span className="w-56 truncate text-3xl text-field-100">{game.away.shortDisplayName}</span>
            <span className="w-16 text-right text-4xl font-bold">{game.away.score ?? '–'}</span>
          </div>
          <div className="flex flex-1 items-center gap-4">
            <TeamLogo src={game.home.logo} size="h-9 w-9" />
            <span className="w-56 truncate text-3xl text-field-100">{game.home.shortDisplayName}</span>
            <span className="w-16 text-right text-4xl font-bold">{game.home.score ?? '–'}</span>
          </div>
          <span className="w-56 shrink-0 text-right text-2xl text-field-500">
            {statusLine(game)}
          </span>
        </div>
      ))}
    </div>
  );
}
