import { MO_ART, MO_COLORS } from '@mohonaut/sdk';
import { PixelSvg } from './PixelSvg';

export const ART = MO_ART;
export const COLORS = MO_COLORS;

/** Foreman Mo as a static SVG (no script), for pages that should not load the game's code. */
export function ForemanMoSvg({ size = 96, label }: { size?: number; label: string }) {
  return <PixelSvg rows={ART} palette={COLORS} size={size} label={label} />;
}
