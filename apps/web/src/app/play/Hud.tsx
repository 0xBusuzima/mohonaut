'use client';

import { formatDepth, millimetres, stratumAt } from '@mohonaut/sdk';
import { Counter } from '../../components/Counter';
import { perHourEstimate, shareOfNetwork } from '../../game/derive';
import type { GameState } from '../../game/state';
import { formatLitres, formatMohn, formatUnits18 } from '../../lib/format';
import { setLowPower, useLowPower } from '../../lib/power';
import { apiEnabled } from '../../social/api';
import { HudChip, PxButton, PxIcon } from './px';

/** The windows the HUD and the world open. */
export type Panel =
  | 'fuel'
  | 'market'
  | 'rigs'
  | 'refinery'
  | 'site'
  | 'bore'
  | 'crew'
  | 'board'
  | 'survey'
  | 'profile';

/**
 * The game HUD over the world. Kept apart from the wallet code so previews can render it on the
 * server.
 */
export function Hud({ state, open }: { state: GameState; open: (p: Panel) => void }) {
  const lowPower = useLowPower();
  const p = state.player;
  const n = state.network;
  if (p === null) return null;
  const perHour = perHourEstimate(p.dp, n.activeDp, n.hourEmission);
  const depth = millimetres(n.emitted);
  const { current } = stratumAt(depth);
  const side = 'flex items-center gap-2 !px-2 !py-1 !text-base';
  const main =
    'flex flex-col items-center gap-1 !px-2 !py-2 !text-base md:flex-row md:gap-2 md:!px-5 md:!py-3 md:!text-xl';
  return (
    <div className="pointer-events-none fixed inset-0 z-20 font-pixel">
      {/* Readouts: a row under the brand on phones, top right on wider screens. */}
      <div className="pointer-events-auto absolute inset-x-3 top-16 grid grid-cols-3 gap-1.5 md:inset-x-auto md:top-3 md:right-3 md:flex md:gap-2">
        <HudChip icon={<PxIcon name="fuel" />} label="Diesel" onClick={() => open('fuel')}>
          {formatLitres(p.tank)}
        </HudChip>
        <HudChip icon={<PxIcon name="coin" />} label="Wallet MOHN">
          {formatUnits18(p.walletMohn, 2)}
        </HudChip>
        <HudChip
          icon={<PxIcon name="core" />}
          label="Unrefined MOHN"
          accent
          onClick={() => open('refinery')}
        >
          <Counter
            base={p.pending}
            perHour={p.tank > 0n ? perHour : 0n}
            since={state.at}
            unit=""
            digits={2}
            numberClass=""
          />
        </HudChip>
      </div>
      <p className="pointer-events-auto absolute top-[4.9rem] right-3 hidden px-dark px-2 py-0.5 text-sm md:block">
        {shareOfNetwork(p.dp, n.activeDp)} of network DP · ≈ {formatMohn(perHour)}/h, falls as
        others join · Stratum {current.numeral}
      </p>
      {/* Left: boards, crew, the World Bore and the power switch. */}
      <div className="pointer-events-auto absolute top-[7.6rem] left-3 flex flex-col items-start gap-2 md:top-16">
        <PxButton variant="light" className={side} onClick={() => open('board')}>
          <PxIcon name="trophy" size={20} />
          <span className="hidden md:inline">Leaderboard</span>
        </PxButton>
        {apiEnabled && (
          <>
            <PxButton variant="light" className={side} onClick={() => open('crew')}>
              <PxIcon name="crew" size={20} />
              <span className="hidden md:inline">Crew</span>
            </PxButton>
            <PxButton variant="light" className={side} onClick={() => open('profile')}>
              <PxIcon name="link" size={20} />
              <span className="hidden md:inline">Invite</span>
            </PxButton>
            <PxButton variant="light" className={side} onClick={() => open('survey')}>
              <PxIcon name="core" size={20} />
              <span className="hidden md:inline">Survey</span>
            </PxButton>
          </>
        )}
        <PxButton variant="light" className={side} onClick={() => open('bore')}>
          <PxIcon name="core" size={20} /> {formatDepth(depth)}
        </PxButton>
        <PxButton
          variant="dark"
          aria-pressed={lowPower}
          title="A still scene and slower updates, for older phones and saving battery"
          className="!px-2 !py-1 !text-sm"
          onClick={() => setLowPower(!lowPower)}
        >
          Low power {lowPower ? 'on' : 'off'}
        </PxButton>
      </div>
      {/* Bottom: the main buttons. */}
      <div className="pointer-events-auto absolute inset-x-3 bottom-3 grid grid-cols-3 gap-2 md:inset-x-auto md:bottom-4 md:left-1/2 md:flex md:-translate-x-1/2 md:gap-3">
        <PxButton variant="light" className={main} onClick={() => open('market')}>
          <PxIcon name="market" size={28} /> Market
        </PxButton>
        <PxButton variant="light" className={main} onClick={() => open('rigs')}>
          <PxIcon name="rig" size={28} /> My rigs
        </PxButton>
        <PxButton variant="light" className={main} onClick={() => open('refinery')}>
          <PxIcon name="core" size={28} /> Refinery
        </PxButton>
      </div>
    </div>
  );
}
