/**
 * A 3x5 pixel font for numbers drawn in the world (the "+0.08" that rises from a drilling rig).
 * Our own glyphs: digits, the decimal point, plus and minus. One pixel between characters.
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
