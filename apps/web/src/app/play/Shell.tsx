'use client';

import { useMemo } from 'react';
import { PixelWorld } from '../../game/pixel/PixelWorld';
import { ForemanMo } from '../../game/pixel/ForemanMo';
import { RigPortrait } from '../../game/pixel/RigPortrait';
import type { ScenePad } from '../../game/play';
import { isTestnet } from '../../game/network';
import { PxButton, PxModal, Steps } from './px';

/** A site at work behind the welcome window, before any wallet is known. */
const DEMO_PADS: ScenePad[] = [
  { typeId: 1, running: true },
  { typeId: 0, running: true },
  { typeId: 3, running: true },
  { typeId: 2, running: false },
];

export const ONBOARDING_STEPS = ['Wallet', 'Sign in', 'Your site'];

/** The top-left badge: the casing mark and the name, plus the testnet tag. */
export function Brand() {
  return (
    <a
      href="/"
      className="px-dark fixed top-3 left-3 z-30 flex items-center gap-2 px-3 py-1.5 font-pixel text-xl font-bold text-orange uppercase"
    >
      <svg aria-hidden="true" viewBox="0 0 512 512" className="h-6 w-6">
        <circle cx="256" cy="256" r="224" fill="none" stroke="#ff6b1a" strokeWidth="64" />
        <circle cx="256" cy="256" r="128" fill="none" stroke="#ece7dc" strokeWidth="54" />
        <circle cx="256" cy="256" r="51" fill="#ff6b1a" />
      </svg>
      Mohonaut
      {isTestnet && <span className="bg-amber px-1.5 text-xs text-night">Testnet</span>}
    </a>
  );
}

/** Shown while the wallet code loads: a rig spudding in on its pad, and a striped load bar. */
export function LoadingScreen({ text = 'Spudding in…' }: { text?: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#0b0f17] font-pixel text-bone">
      <div className="flex flex-col items-center gap-5">
        <RigPortrait typeId={2} scale={3} />
        <p className="text-xl tracking-wider uppercase">{text}</p>
        <div className="px-inset h-6 w-72 p-1">
          <div className="px-hazard h-full w-1/2 animate-[loadbar_1.6s_steps(12)_infinite]" />
        </div>
      </div>
    </div>
  );
}

/**
 * Prerendered and light: the world and the welcome window. The wallet code (~300 KB) loads when
 * the player presses Connect (`onConnect`); without it the button waits.
 */
export function PlayShell({ onConnect }: { onConnect?: () => void }) {
  const model = useMemo(() => ({ pads: DEMO_PADS, tankFill: 0.6 }), []);
  return (
    <>
      <h1 className="sr-only">Mohonaut: your drill site</h1>
      <PixelWorld
        model={model}
        label="A drill site at night: four rigs on their pads, a diesel tank, the core shack and the World Bore."
      />
      <Brand />
      <PxModal title="Welcome">
        <Steps steps={ONBOARDING_STEPS} at={0} />
        <div className="flex items-center gap-3">
          <ForemanMo scale={3} label="Foreman Mo, the site foreman" />
          <p className="text-lg">
            Evening, driller. Run a drill site at night: fuel your rigs with diesel and core one
            shared bore with every other driller.
          </p>
        </div>
        <PxButton className="mt-5 w-full" onClick={onConnect} disabled={onConnect === undefined}>
          {onConnect === undefined ? 'Loading wallets…' : 'Connect wallet'}
        </PxButton>
        <p className="mt-3 text-center text-sm text-concrete">
          Connecting is free. The game never asks to approve token spending.
        </p>
        <p className="mt-2 text-center text-sm">
          No wallet?{' '}
          <a href="/train/" className="text-amber underline">
            Try the training site
          </a>
          .
        </p>
      </PxModal>
    </>
  );
}
