'use client';

import { useMemo, useState } from 'react';
import { PixelWorld } from '../../../game/pixel/PixelWorld';
import { describeHit } from '../../../game/play';
import type { ScenePad } from '../../../game/play';
import type { GameState } from '../../../game/state';
import { GEN1_RIGS } from '../../../lib/catalog';
import { Hud } from '../../play/Hud';
import type { Panel } from '../../play/Hud';
import { PxModal } from '../../play/px';
import { MarketWindow, RigsWindow } from '../../play/RigCards';
import { Brand } from '../../play/Shell';

const E18 = 10n ** 18n;

// Six rigs drilling, two switched off; the rest of the pads stay locked.
const PADS: ScenePad[] = [
  ...GEN1_RIGS.map((_, i) => ({ typeId: i, running: true })),
  { typeId: 1, running: false },
  { typeId: 4, running: false },
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
    burn: 22n * E18,
    tank: 1_240n * E18,
    pending: 1_234n * E18,
    scrapCredit: 0n,
    padsUsed: 6,
    walletMohn: 560n * E18,
    siteUpgradePrice: 2_400n * E18,
    refines: [],
  },
};

/** The windows open without a wallet: buttons do nothing here. */
const NO_ACTION = { busy: null, run: () => Promise.resolve(false) };

export function SitePreview() {
  const model = useMemo(() => ({ pads: PADS, tankFill: 0.7 }), []);
  const [panel, setPanel] = useState<Panel | null>(null);
  return (
    <>
      <PixelWorld
        model={model}
        onSelect={(hit) => {
          if (hit === 'market') setPanel('market');
          else if (hit.startsWith('pad:')) setPanel('rigs');
        }}
        describe={(hit) => describeHit(hit, PADS)}
        label={`Sample drill site: ${GEN1_RIGS.map((r) => r.name).join(', ')}.`}
      />
      <Brand />
      <Hud state={SAMPLE} open={setPanel} />
      {(panel === 'market' || panel === 'rigs') && (
        <PxModal
          title={panel === 'market' ? 'Equipment market' : 'My rigs'}
          onClose={() => setPanel(null)}
          wide
        >
          {panel === 'market' ? (
            <MarketWindow state={SAMPLE} action={NO_ACTION} />
          ) : (
            <RigsWindow state={SAMPLE} action={NO_ACTION} openMarket={() => setPanel('market')} />
          )}
        </PxModal>
      )}
    </>
  );
}
