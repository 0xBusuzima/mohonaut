'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { PixelWorld } from '../../../game/pixel/PixelWorld';
import { describeHit } from '../../../game/play';
import type { ScenePad } from '../../../game/play';
import type { GameState } from '../../../game/state';
import { GEN1_RIGS } from '../../../lib/catalog';
import { Hud } from '../../play/Hud';
import type { Panel } from '../../play/Hud';
import { PxModal } from '../../play/px';
import { Brand } from '../../play/Shell';

const E18 = 10n ** 18n;

// Six rigs drilling, two switched off; the rest of the pads stay locked.
const PADS: ScenePad[] = [
  ...GEN1_RIGS.map((_, i) => ({ typeId: i, running: true })),
  { typeId: 1, running: false },
  { typeId: 4, running: false },
];

/** The sample bore, a little into the Granite Basement. */
const SAMPLE_DEPTH_MM = 7_350_000n;

const noSubscribe = () => () => {};

/** Rigs the preview installs one after another. */
const DEMO_ADDS: ScenePad[] = [
  { typeId: 2, running: true },
  { typeId: 3, running: true },
];

/** A made-up site for the preview (no wallet or chain). */
const SAMPLE: GameState = {
  at: 1_791_900_000,
  network: {
    activeDp: 5_000n,
    hourEmission: 2083n * E18,
    emitted: 47_000n * E18,
    pausedUntil: 0,
    marketOpened: true,
    marketOpenTime: 1_791_000_000,
    genesisTime: 1_790_740_800,
    litresPerEth: 25_000n * E18,
    maxTankHours: 720,
  },
  rigs: GEN1_RIGS.map((r) => ({
    id: r.id,
    dp: BigInt(r.dp),
    burn: BigInt(Math.round(r.litresPerHour * 100)) * 10n ** 16n,
    premiumBps: r.premiumPct * 100,
    minLevel: [0, 1, 3, 6, 10, 15][r.id] ?? 0,
    generation: 1,
    price: BigInt(Math.round(r.dp * 9.5)) * E18,
    owned: [1, 3, 2, 1, 0, 0][r.id] ?? 0,
    active: [1, 2, 2, 1, 0, 0][r.id] ?? 0,
  })),
  player: {
    registered: true,
    level: 5,
    dp: 980n,
    burn: 7n * E18,
    tank: 1_240n * E18,
    pending: 1_234n * E18,
    scrapCredit: 0n,
    padsUsed: 6,
    walletMohn: 560n * E18,
    siteUpgradePrice: 2_400n * E18,
    refines: [],
  },
};

const Guide = dynamic(() => import('../../play/Guide').then((m) => m.Guide), { ssr: false });
const HelpWindow = dynamic(() => import('../../play/HelpWindow').then((m) => m.HelpWindow), {
  ssr: false,
});
const BoreWindow = dynamic(() => import('../../play/BoreWindow').then((m) => m.BoreWindow), {
  ssr: false,
});

const ShiftPreview = dynamic(() => import('./shift-preview').then((m) => m.ShiftPreview), {
  ssr: false,
});

/** The rig windows read the chain (batch quotes): loaded with their providers when opened. */
const RigWindows = dynamic(() => import('./rig-windows').then((m) => m.RigWindows), {
  ssr: false,
});

export function SitePreview() {
  // A living sample: every few seconds a rig is installed and diesel arrives, then it resets.
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((k) => (k + 1) % 4), 5000);
    return () => window.clearInterval(id);
  }, []);
  // ?pads=N shows a site of N pads (a big site, e.g. 33 at level 30), all drilling.
  const big = useSyncExternalStore(
    noSubscribe,
    () => Number(new URLSearchParams(window.location.search).get('pads') ?? 0),
    () => 0,
  );
  const pads = useMemo(
    () =>
      big > 0
        ? Array.from({ length: big }, (_, i) => ({ typeId: i % 6, running: i % 7 !== 3 }))
        : [...PADS, ...DEMO_ADDS.slice(0, step % 3)],
    [step, big],
  );
  // 367 MOHN/h over 980 DP, as the sample HUD says.
  const model = useMemo(
    () => ({ pads, tankFill: 0.4 + (step % 3) * 0.2, yieldPerDp: 0.375 }),
    [pads, step],
  );
  const [panel, setPanel] = useState<Panel | null>(null);
  // ?shift=1 opens the shift report a returning player sees.
  const shift = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).has('shift'),
    () => false,
  );
  return (
    <>
      <PixelWorld
        model={model}
        onSelect={(hit) => {
          if (hit === 'market') setPanel('market');
          else if (hit.startsWith('pad:')) setPanel('rigs');
        }}
        describe={(hit) => describeHit(hit, pads)}
        label={`Sample drill site: ${GEN1_RIGS.map((r) => r.name).join(', ')}.`}
      />
      <Brand />
      <Hud state={SAMPLE} open={setPanel} />
      {panel === null && (
        <Guide
          state={SAMPLE}
          address="0x000000000000000000000000000000000000dEaD"
          open={(t) => setPanel(t === 'market' ? 'market' : 'rigs')}
        />
      )}
      {shift && panel === null && <ShiftPreview state={SAMPLE} open={setPanel} />}
      {panel === 'help' && (
        <PxModal title="How to play" onClose={() => setPanel(null)} wide>
          <HelpWindow />
        </PxModal>
      )}
      {panel === 'bore' && (
        <PxModal title="World Bore" onClose={() => setPanel(null)}>
          <BoreWindow depthMm={SAMPLE_DEPTH_MM} />
        </PxModal>
      )}
      {(panel === 'market' || panel === 'rigs') && (
        <PxModal
          title={panel === 'market' ? 'Equipment market' : 'My rigs'}
          onClose={() => setPanel(null)}
          wide
        >
          <RigWindows panel={panel} state={SAMPLE} openMarket={() => setPanel('market')} />
        </PxModal>
      )}
    </>
  );
}
