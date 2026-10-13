/**
 * Site decor for completed Core Collection sets (docs/01 4.9): cosmetic, our own pixel art. Each
 * prop stands on the ground point (x, y), like the other props.
 */
import { STRATA } from '@mohonaut/sdk';
import { box, line, px, rect } from './draw';
import type { Ctx } from './draw';
import { P } from './palette';

/** The set ids (services/api/src/game/survey.ts SURVEY_SETS), in the order they stand. */
export const DECOR_SETS = ['fossils', 'cores', 'bits', 'relics'] as const;
export type DecorSet = (typeof DECOR_SETS)[number];

/** Fossils: a glass case on a wooden stand with an ammonite inside. */
function fossilCase(c: Ctx, x: number, y: number): void {
  box(c, x, y + 4, 18, 5, P.wood, P.woodDark, P.earth);
  box(c, x, y - 1, 16, 7, P.glassTop, P.glass, P.glassDark);
  // The ammonite on the front face: a coiled shell in amber.
  const ax = x - 5;
  const ay = y + 6;
  for (const [dx, dy] of [
    [0, -2],
    [1, -2],
    [2, -1],
    [2, 0],
    [1, 1],
    [0, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, 0],
  ] as const) {
    px(c, ax + dx, ay + dy, (dx + dy) % 2 === 0 ? P.amber : P.flareHot);
  }
  line(c, x - 6, y + 1, x - 1, y + 3, P.glassShine);
}

/** Core samples: a rack of core tubes, one per upper stratum colour. */
function coreRack(c: Ctx, x: number, y: number): void {
  rect(c, x - 10, y + 2, 2, 8, P.graphite);
  rect(c, x + 8, y + 7, 2, 8, P.graphite);
  for (let i = 0; i < 4; i++) {
    const colour = STRATA[i]?.colour ?? P.concrete;
    const yy = y + 1 + i * 3;
    line(c, x - 11, yy, x + 9, yy + 5, colour, 2);
    px(c, x - 11, yy, P.night);
  }
}

/** Drill bits: three tricone bits on a steel stand, teeth catching the light. */
function bitStand(c: Ctx, x: number, y: number): void {
  box(c, x, y + 4, 20, 3, P.steelLight, P.steel, P.graphite);
  for (let k = 0; k < 3; k++) {
    const bx = x - 6 + k * 6;
    const by = y + 2 + k * 1;
    rect(c, bx - 1, by - 7, 3, 3, P.concrete); // shank
    rect(c, bx - 2, by - 4, 5, 3, P.steelLight); // body
    px(c, bx - 2, by - 1, P.amber);
    px(c, bx, by - 1, P.amber);
    px(c, bx + 2, by - 1, P.amber);
  }
}

/** Rig relics: a little old wooden cable-tool derrick with its walking beam. */
function relicDerrick(c: Ctx, x: number, y: number): void {
  const top = y - 26;
  line(c, x - 7, y + 6, x - 2, top, P.wood);
  line(c, x + 7, y + 6, x + 2, top, P.wood);
  line(c, x, y + 9, x, top + 2, P.woodDark);
  for (let i = 1; i < 5; i++) {
    const yy = y + 6 - i * 6;
    const half = 7 - i;
    line(c, x - half, yy, x + half, yy, P.woodDark);
  }
  line(c, x - 6, y, x + 5, y - 11, P.woodDark);
  rect(c, x - 3, top - 2, 7, 2, P.wood); // crown block
  // The walking beam beside it, on its samson post.
  rect(c, x + 10, y + 2, 2, 6, P.woodDark);
  line(c, x + 5, y + 1, x + 17, y + 3, P.wood, 2);
}

const DRAW: Record<DecorSet, (c: Ctx, x: number, y: number) => void> = {
  fossils: fossilCase,
  cores: coreRack,
  bits: bitStand,
  relics: relicDerrick,
};

/**
 * Where each piece stands, in site grid coordinates: a little trophy yard on the open ground
 * beyond the right fence, where no rig or fence stands in front of it.
 */
export const DECOR_SPOTS: Record<DecorSet, [number, number]> = {
  relics: [15.6, 1.4],
  cores: [15.8, 3.6],
  fossils: [15.8, 5.8],
  bits: [15.8, 8.0],
};

export function drawDecor(c: Ctx, set: DecorSet, x: number, y: number): void {
  DRAW[set](c, x, y);
}

/** The decor for a list of completed set ids, in standing order (unknown ids are ignored). */
export function decorFor(completed: readonly string[]): DecorSet[] {
  return DECOR_SETS.filter((s) => completed.includes(s));
}
