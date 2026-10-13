import { PLAQUE_ART, PLAQUE_PALETTES, plaqueTier } from '@mohonaut/sdk';
import { plaqueText } from './plaques';
import type { Plaque } from './plaques';
import { PixelSvg } from './pixel/PixelSvg';

/** Season plaques as pixel plates: gold for first, silver for second and third, bronze to 10th. */
export function PlaqueList({ plaques }: { plaques: readonly Plaque[] }) {
  if (plaques.length === 0) return null;
  return (
    <ul className="grid gap-2">
      {plaques.map((p) => (
        <li key={p.season} className="flex items-center gap-2">
          <PixelSvg rows={PLAQUE_ART} palette={PLAQUE_PALETTES[plaqueTier(p.rank)]} size={32} />
          <span className="text-sm leading-tight text-bone">{plaqueText(p)}</span>
        </li>
      ))}
    </ul>
  );
}
