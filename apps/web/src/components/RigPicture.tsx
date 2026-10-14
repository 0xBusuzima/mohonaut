// The portrait's own backdrop (scripts/gen-voxel.mjs): night sky to the horizon at 52 %, the plain
// below, so a card wider than the picture carries the scene out to its edges.
const PORTRAIT_BANDS =
  'linear-gradient(#0a1022 0, #1a2445 31%, #2c2c50 52%, #2a2622 52%, #1f1b18 100%)';

/**
 * A rig portrait (rendered at build time by scripts/gen-voxel.mjs at 600 x 552) shown at 300 px;
 * `running: false` shows the rig stopped, its lamps dark.
 */
export function RigPicture({
  id,
  name,
  running = true,
  className = 'w-[300px]',
}: {
  id: number;
  name: string;
  running?: boolean;
  className?: string;
}) {
  return (
    <div style={{ background: PORTRAIT_BANDS }}>
      <img
        src={`/rigs/rig-${id}${running ? '' : '-off'}.webp`}
        alt={`${name} on its pad at night${running ? '' : ', stopped'}`}
        width={300}
        height={276}
        loading="lazy"
        className={`mx-auto block h-auto max-w-full ${className}`}
      />
    </div>
  );
}
