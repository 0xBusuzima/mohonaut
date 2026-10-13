import { P } from '../game/pixel/palette';

// The portrait's bands (src/game/pixel/portrait.ts): sky to row 24, lower sky and ridge to row 50,
// earth below, out of 92 rows.
const BANDS = `linear-gradient(${P.skyTop} 0 26%, ${P.skyMid} 26% 54%, ${P.earth} 54% 100%)`;

/**
 * A rig portrait PNG (drawn at build time by scripts/gen-pixel-art.mjs) at its own 300 px, so
 * every art pixel stays square; a wider card fills the sides with the scene's own bands.
 */
export function RigPicture({ id, name }: { id: number; name: string }) {
  return (
    <div style={{ background: BANDS }}>
      <img
        src={`/rigs/rig-${id}.png`}
        alt={`${name} on its pad at night`}
        width={300}
        height={276}
        loading="lazy"
        className="pixel-canvas mx-auto h-auto w-[300px] max-w-full"
      />
    </div>
  );
}
