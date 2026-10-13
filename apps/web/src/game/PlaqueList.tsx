import { plaqueText, plaqueTier } from './plaques';
import type { Plaque } from './plaques';
import { PixelSvg } from './pixel/PixelSvg';

/** A screwed plate with the World Bore's casing rings engraved on it. */
const PLATE = [
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

const TIERS = {
  gold: { k: '#22272d', f: '#ffb31a', s: '#ffe27a', d: '#c4501a' },
  silver: { k: '#22272d', f: '#b9b2a5', s: '#ece7dc', d: '#59626c' },
  bronze: { k: '#22272d', f: '#c4501a', s: '#ff6b1a', d: '#5e4330' },
} as const;

/** Season plaques as pixel plates: gold for first, silver for second and third, bronze to 10th. */
export function PlaqueList({ plaques }: { plaques: readonly Plaque[] }) {
  if (plaques.length === 0) return null;
  return (
    <ul className="grid gap-2">
      {plaques.map((p) => (
        <li key={p.season} className="flex items-center gap-2">
          <PixelSvg rows={PLATE} palette={TIERS[plaqueTier(p.rank)]} size={32} />
          <span className="text-sm leading-tight text-bone">{plaqueText(p)}</span>
        </li>
      ))}
    </ul>
  );
}
