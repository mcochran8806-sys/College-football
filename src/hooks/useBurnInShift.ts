import { useEffect, useState } from 'react';
import { INTERVALS } from '../../config';

/**
 * Burn-in mitigation.
 *
 * A static scoreboard left on an OLED for twelve Saturdays in a row will ghost
 * its own layout into the panel. Nudging the whole tree a few pixels on a slow
 * cycle keeps any given pixel from holding the same bright element forever.
 * Six positions, one every ten minutes, so a full lap takes an hour and the
 * movement is invisible to anyone watching.
 */
const OFFSETS: Array<[number, number]> = [
  [0, 0],
  [4, 2],
  [7, -3],
  [2, 5],
  [-4, 3],
  [-6, -2],
];

export function useBurnInShift(): { transform: string } {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % OFFSETS.length), INTERVALS.burnInShift);
    return () => clearInterval(id);
  }, []);

  const [x, y] = OFFSETS[index];
  return { transform: `translate3d(${x}px, ${y}px, 0)` };
}
