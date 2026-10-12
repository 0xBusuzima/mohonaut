'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { PixelWorld } from '../game/pixel/PixelWorld';
import type { ScenePad } from '../game/play';

const PADS: ScenePad[] = [
  { typeId: 0, running: true },
  { typeId: 1, running: true },
  { typeId: 2, running: true },
  { typeId: 3, running: true },
  { typeId: 1, running: false },
  { typeId: 4, running: true },
  { typeId: null, running: false },
];

/** The opening screen: the drill site at night, full height, with the way into the game. */
export function HomeHero() {
  const model = useMemo(() => ({ pads: PADS, tankFill: 0.65 }), []);
  return (
    <section className="relative h-[calc(100dvh-4rem)] min-h-[34rem] overflow-hidden bg-[#0d1220]">
      <PixelWorld
        contained
        model={model}
        label="A drill site at night: rigs on their pads, a diesel tank, the core shack and the World Bore."
      />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4 pb-8 md:items-center md:justify-start md:p-10">
        <div className="px-panel pointer-events-auto flex max-w-md flex-col gap-4 p-5 pt-0 font-pixel">
          <div aria-hidden="true" className="px-hazard -mx-[14px] mb-1 h-3" />
          <h1 className="font-display text-5xl font-black tracking-wide uppercase sm:text-6xl">
            Not the moon. <span className="text-orange">The Moho.</span>
          </h1>
          <p className="text-lg">
            An on-chain idle drilling game. Run a drill site, fuel your rigs with diesel and core
            one shared hole with every other player: the World Bore. Every $MOHN comes out of the
            ground.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/play/" className="px-btn px-btn-primary px-6 py-3 text-xl uppercase">
              Play now
            </Link>
            <Link href="/train/" className="px-btn px-btn-light px-5 py-3 text-xl uppercase">
              Try the rig
            </Link>
          </div>
          <p className="text-sm">
            No wallet needed to try: the{' '}
            <Link href="/train/" className="text-amber underline">
              training site
            </Link>{' '}
            runs the game in your browser, nothing of value.{' '}
            <Link href="/docs/" className="text-amber underline">
              How it works
            </Link>
          </p>
          <p className="text-sm text-concrete">
            World Bore 0 m · Stratum I, Regolith · Genesis date to be announced
          </p>
        </div>
      </div>
    </section>
  );
}
