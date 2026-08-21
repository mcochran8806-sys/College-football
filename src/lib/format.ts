import type { Game } from '../../shared/types';

/** 'Saturday, November 8' */
export function longDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

/** Kickoff time for scheduled games: '7:30 PM'. */
export function kickoffTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(t));
}

/** The line under the score: clock, 'Final', or kickoff time. */
export function statusLine(game: Game): string {
  if (game.state === 'pre') {
    return game.broadcast ? `${kickoffTime(game.date)} · ${game.broadcast}` : kickoffTime(game.date);
  }
  if (game.state === 'post') {
    return game.statusDetail || game.shortDetail || 'Final';
  }
  const clock = game.displayClock;
  const period = ordinalPeriod(game.period);
  if (game.shortDetail && /half/i.test(game.shortDetail)) return 'Halftime';
  if (clock && period) return `${clock} · ${period}`;
  return game.shortDetail || game.statusDetail || 'In Progress';
}

export function ordinalPeriod(period: number): string {
  if (!period) return '';
  if (period === 1) return '1st';
  if (period === 2) return '2nd';
  if (period === 3) return '3rd';
  if (period === 4) return '4th';
  return period === 5 ? 'OT' : `${period - 4}OT`;
}

export function rankLabel(rank: number | null): string | null {
  return rank ? `#${rank}` : null;
}
