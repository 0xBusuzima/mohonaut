/**
 * Season plaques (docs/05 P-34): a top-10 place in a season's World Bore contribution, shown
 * as a screwed metal plate with the World Bore's casing rings engraved on it. Cosmetic only.
 */

/** First place is gold, second and third silver, the rest of the top ten bronze. */
export function plaqueTier(rank: number): 'gold' | 'silver' | 'bronze' {
  return rank === 1 ? 'gold' : rank <= 3 ? 'silver' : 'bronze';
}

/** 12x12 pixel plate; k frame, f face, s shine, d screws and engraving. */
export const PLAQUE_ART: readonly string[] = [
  '............',
  '.kkkkkkkkkk.',
  '.kdsfffffdk.',
  '.kfsffffffk.',
  '.kffddddffk.',
  '.kffdffdffk.',
  '.kffddddffk.',
  '.kffffffffk.',
  '.kdffffffdk.',
  '.kkkkkkkkkk.',
  '............',
  '............',
];

export const PLAQUE_PALETTES: Readonly<
  Record<'gold' | 'silver' | 'bronze', Readonly<Record<string, string>>>
> = {
  gold: { k: '#22272d', f: '#ffb31a', s: '#ffe27a', d: '#c4501a' },
  silver: { k: '#22272d', f: '#b9b2a5', s: '#ece7dc', d: '#59626c' },
  bronze: { k: '#22272d', f: '#c4501a', s: '#ff6b1a', d: '#5e4330' },
};
