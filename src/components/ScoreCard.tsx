import type { Game, ScoringPlay } from '../../shared/types';
import { ordinalPeriod } from '../lib/format';
import TeamLogo from './TeamLogo';

interface Props {
  play: ScoringPlay;
  game: Game | undefined;
}

/**
 * Full-screen scoring-play interstitial.
 *
 * Clips lag the actual play by minutes to hours, so this is what fills the gap:
 * the moment /api/plays surfaces a score in a favorite game, this card takes
 * the screen for 12 seconds. If a matching video shows up later it plays
 * normally — the card is not a replacement for the highlight, it's the bridge.
 */
export default function ScoreCard({ play, game }: Props) {
  const away = game?.away;
  const home = game?.home;
  const scoringSide =
    game && play.teamId ? (game.home.id === play.teamId ? 'home' : 'away') : null;

  return (
    <div className="animate-fade-up flex h-full w-full flex-col justify-center gap-10 bg-field-950 p-[4%]">
      <div className="flex items-center gap-6">
        <TeamLogo src={play.teamLogo} size="h-32 w-32" />
        <div className="min-w-0">
          <div className="text-2xl font-semibold uppercase tracking-[0.2em] text-close">
            {play.scoringType === 'FG'
              ? 'Field Goal'
              : play.scoringType === 'SF'
                ? 'Safety'
                : 'Touchdown'}
          </div>
          <div className="truncate text-6xl font-bold tracking-tight text-field-100">
            {play.teamName ?? 'Score'}
          </div>
        </div>
      </div>

      <p className="max-w-[85%] text-4xl leading-snug text-field-300">{play.text}</p>

      <div className="flex items-end gap-12">
        <ScoreBlock
          label={away?.shortDisplayName ?? play.awayAbbr}
          logo={away?.logo ?? null}
          score={play.awayScore}
          highlight={scoringSide === 'away'}
        />
        <ScoreBlock
          label={home?.shortDisplayName ?? play.homeAbbr}
          logo={home?.logo ?? null}
          score={play.homeScore}
          highlight={scoringSide === 'home'}
        />
        <div className="pb-3 text-3xl text-field-500">
          {play.clock ? `${play.clock} · ` : ''}
          {ordinalPeriod(play.period)}
        </div>
      </div>
    </div>
  );
}

function ScoreBlock({
  label,
  logo,
  score,
  highlight,
}: {
  label: string;
  logo: string | null;
  score: number;
  highlight: boolean;
}) {
  return (
    <div className="flex items-end gap-4">
      <TeamLogo src={logo} size="h-16 w-16" className="pb-2" />
      <div>
        <div className="text-2xl text-field-500">{label}</div>
        <div
          className={
            'text-[7rem] font-bold leading-none ' +
            (highlight ? 'text-close' : 'text-field-100')
          }
        >
          {score}
        </div>
      </div>
    </div>
  );
}
