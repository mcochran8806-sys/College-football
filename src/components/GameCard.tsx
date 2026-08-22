import type { Game } from '../../shared/types';
import { statusLine } from '../lib/format';
import { isCloseAndLate } from '../lib/sortGames';
import TeamRow from './TeamRow';

interface Props {
  game: Game;
  favorite: boolean;
}

/** The single line under the scores: down & distance while live, otherwise
 *  whatever context is most useful for a game that hasn't started. */
function footnote(game: Game): string {
  if (game.situation?.downDistanceText) return game.situation.downDistanceText;
  if (game.state !== 'pre') return '';
  return game.note ?? game.venue ?? game.conference ?? '';
}

export default function GameCard({ game, favorite }: Props) {
  const close = isCloseAndLate(game);
  const live = game.state === 'in';
  const final = game.state === 'post';
  const redZone = game.situation?.isRedZone === true;

  // Close-and-late gets the accent ring; a favorite gets a quieter one. A close
  // favorite game gets the loud treatment — that's the whole point of the room.
  const ring = close
    ? 'border-close/70 shadow-[0_0_28px_-4px] shadow-close/45'
    : favorite
      ? 'border-field-700 shadow-[0_0_18px_-8px] shadow-field-300/30'
      : 'border-field-800';

  return (
    <article
      className={`flex flex-col justify-between rounded-2xl border bg-field-900 px-5 py-4 ${ring}`}
    >
      <div className="flex items-start justify-between gap-3 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          {live && <span className="h-3 w-3 shrink-0 rounded-full bg-live" />}
          <span
            className={
              'truncate text-2xl font-medium ' + (live ? 'text-field-100' : 'text-field-500')
            }
          >
            {statusLine(game)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {redZone && (
            <span className="animate-redzone rounded bg-redzone px-2.5 py-1 text-xl font-bold tracking-wide text-white">
              RED ZONE
            </span>
          )}
          {!redZone && live && game.broadcast && (
            <span className="text-2xl text-field-500">{game.broadcast}</span>
          )}
          {final && game.broadcast && <span className="text-2xl text-field-500">{game.broadcast}</span>}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-4">
        <TeamRow team={game.away} game={game} dim={final && game.home.winner} />
        <TeamRow team={game.home} game={game} dim={final && game.away.winner} />
      </div>

      {/* One line, one fact. Showing conference and note side by side just
          truncated both of them. */}
      <div className="flex h-8 items-baseline pt-3 text-2xl text-field-500">
        <span className="truncate">{footnote(game)}</span>
      </div>
    </article>
  );
}
