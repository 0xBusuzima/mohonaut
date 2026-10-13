/**
 * A 3x5 pixel font for text drawn in the world: the "+0.08" that rises from a drilling rig and
 * the crew tag on the site's banner. Our own glyphs: digits, the decimal point, plus, minus and
 * capitals (M, N and W are wider). One pixel between characters.
 */
import { rect } from './draw';
import type { Ctx } from './draw';

const GLYPHS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '.': ['.', '.', '.', '.', '#'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  // Capitals for crew tags; M, N and W need the extra width.
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
};

/** Width in pixels of `text` in this font. */
export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += (GLYPHS[ch]?.[0]?.length ?? 3) + 1;
  return Math.max(0, w - 1);
}

/** Draws `text` with its top-left corner at (x, y), with a 1 px dark outline for contrast. */
export function drawText(
  c: Ctx,
  x: number,
  y: number,
  text: string,
  color: string,
  outline: string,
): void {
  const paint = (ox: number, oy: number, col: string) => {
    let cx = Math.round(x) + ox;
    for (const ch of text) {
      const g = GLYPHS[ch];
      if (g === undefined) {
        cx += 4;
        continue;
      }
      g.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] === '#') rect(c, cx + rx, Math.round(y) + oy + ry, 1, 1, col);
        }
      });
      cx += (g[0]?.length ?? 3) + 1;
    }
  };
  for (const [ox, oy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    paint(ox, oy, outline);
  }
  paint(0, 0, color);
}
