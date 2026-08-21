import { useEffect, useRef, useState } from 'react';
import type { Game, TeamSide } from '../../shared/types';
import TeamLogo from './TeamLogo';

interface Props {
  team: TeamSide;
  game: Game;
  /** Dim the loser once a game is final. */
  dim: boolean;
}

/**
 * One team line: rank, logo, name, score.
 *
 * The score flashes when it changes so a glance across the room catches what
 * moved. The first render never flashes — otherwise every page turn would set
 * the whole board pulsing.
 */
export default function TeamRow({ team, game, dim }: Props) {
  const [flash, setFlash] = useState(false);
  const previous = useRef<number | null>(null);
  const seenOnce = useRef(false);

  useEffect(() => {
    const score = team.score;
    if (!seenOnce.current) {
      seenOnce.current = true;
      previous.current = score;
      return;
    }
    if (score !== null && previous.current !== null && score !== previous.current) {
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 1200);
      previous.current = score;
      return () => clearTimeout(id);
    }
    previous.current = score;
  }, [team.score]);

  const hasBall = game.situation?.possession === team.id && team.id !== '';
  const score = team.score;

  return (
    <div className={`flex items-center gap-2 ${dim ? 'opacity-45' : ''}`}>
      {/* Possession marker holds its width whether or not the ball is here, so
          the row doesn't shift as possession changes. Kept narrow: every pixel
          here comes out of the team name, and long names ("Mississippi State")
          are the tightest thing on the card. */}
      <span className="w-2.5 shrink-0 text-xl leading-none text-possession">
        {hasBall ? '●' : ''}
      </span>

      <TeamLogo src={team.logo} size="h-10 w-10" />

      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        {team.rank && (
          <span className="shrink-0 text-lg font-semibold text-field-500">{team.rank}</span>
        )}
        <span className="truncate text-[1.75rem] font-semibold leading-tight tracking-tight text-field-100">
          {team.shortDisplayName}
        </span>
      </div>

      <span
        className={
          'shrink-0 text-[4rem] font-bold leading-none tabular-nums ' +
          (flash ? 'animate-score-pulse' : '')
        }
      >
        {score === null ? '–' : score}
      </span>
    </div>
  );
}
