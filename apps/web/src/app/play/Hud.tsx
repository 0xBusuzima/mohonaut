'use client';

import { STRATA, formatDepth, millimetres, stratumAt } from '@mohonaut/sdk';
import { Counter } from '../../components/Counter';
import { perHourEstimate, shareOfNetwork } from '../../game/derive';
import type { GameState } from '../../game/state';
import { formatDuration, formatLitres, formatMohn, formatUnits18 } from '../../lib/format';
import { setLowPower, useLowPower } from '../../lib/power';
import { setSound, useAmbience, useSound } from '../../game/audio';
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
  | 'profile'
  | 'help';

/**
 * The game HUD over the world. Kept apart from the wallet code so previews can render it on the
 * server.
 */
export function Hud({
  state,
  open,
  training = false,
}: {
  state: GameState;
  open: (p: Panel) => void;
  /** The training site: no boards, crews or profile (nothing is on-chain or signed in). */
  training?: boolean;
}) {
  const lowPower = useLowPower();
  const sound = useSound();
  const p = state.player;
  const n = state.network;
  const depth = millimetres(n.emitted);
  const { current } = stratumAt(depth);
  // The ambience's drone follows the stratum being cored.
  useAmbience(
    sound,
    STRATA.findIndex((s) => s.numeral === current.numeral),
  );
  if (p === null) return null;
  const perHour = perHourEstimate(p.dp, n.activeDp, n.hourEmission);
  const side = 'flex items-center gap-2 !px-2 !py-1 !text-base';
  const main =
    'flex flex-col items-center gap-1 whitespace-nowrap !px-2 !py-2 !text-base md:flex-row md:gap-2 md:!px-5 md:!py-3 md:!text-xl';
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
      {/* Until the market opens: when it does (refining and the pool wait for it). */}
      {!n.marketOpened && (
        <p className="pointer-events-auto absolute top-[7.6rem] right-3 px-dark px-2 py-0.5 text-sm text-amber md:top-[6.7rem]">
          {n.marketOpenTime > state.at
            ? `Market Open in ${formatDuration(n.marketOpenTime - state.at)}`
            : 'Market Open: waiting for the opening call'}
        </p>
      )}
      {/* Left: help, boards, crew, the World Bore, and the sound and low power switches. */}
      <div className="hud-side pointer-events-auto absolute top-[7.6rem] left-3 flex flex-col items-start gap-2 md:top-16">
        <PxButton
          variant="light"
          className={side}
          aria-label="How to play"
          onClick={() => open('help')}
        >
          <span className="w-5 text-center text-lg leading-none">?</span>
          <span className="hidden md:inline">How to play</span>
        </PxButton>
        {!training && (
          <PxButton variant="light" className={side} onClick={() => open('board')}>
            <PxIcon name="trophy" />
            <span className="hidden md:inline">Leaderboard</span>
          </PxButton>
        )}
        {apiEnabled && !training && (
          <>
            <PxButton variant="light" className={side} onClick={() => open('crew')}>
              <PxIcon name="crew" />
              <span className="hidden md:inline">Crew</span>
            </PxButton>
            <PxButton variant="light" className={side} onClick={() => open('profile')}>
              <PxIcon name="link" />
              <span className="hidden md:inline">Invite</span>
            </PxButton>
            <PxButton variant="light" className={side} onClick={() => open('survey')}>
              <PxIcon name="survey" />
              <span className="hidden md:inline">Survey</span>
            </PxButton>
          </>
        )}
        <PxButton
          variant="light"
          className={side}
          aria-label={`World Bore, ${formatDepth(depth)}`}
          onClick={() => open('bore')}
        >
          <PxIcon name="bore" /> {formatDepth(depth)}
        </PxButton>
        {/* Settings: two switches, lit teal when on. */}
        <div className="flex gap-2">
          <PxButton
            variant="light"
            aria-pressed={sound}
            aria-label="Sound"
            title={`Sound ${sound ? 'on' : 'off'}: rain, the generator and the odd pipe clank`}
            className="!p-1.5"
            onClick={() => setSound(!sound)}
          >
            <PxIcon name={sound ? 'sound' : 'mute'} />
          </PxButton>
          <PxButton
            variant="light"
            aria-pressed={lowPower}
            aria-label="Low power"
            title={`Low power ${lowPower ? 'on' : 'off'}: a still scene and slower updates, for older phones and saving battery`}
            className="!p-1.5"
            onClick={() => setLowPower(!lowPower)}
          >
            {/* Full cells at full power, one cell when saving. */}
            <PxIcon name={lowPower ? 'battery' : 'batteryFull'} />
          </PxButton>
        </div>
      </div>
      {/* Bottom: the main buttons. */}
      <div className="pointer-events-auto absolute inset-x-3 bottom-3 grid grid-cols-3 gap-2 md:inset-x-auto md:bottom-4 md:left-1/2 md:flex md:-translate-x-1/2 md:gap-3">
        <PxButton variant="light" className={main} onClick={() => open('market')}>
          <PxIcon name="market" /> Market
        </PxButton>
        <PxButton variant="light" className={main} onClick={() => open('rigs')}>
          <PxIcon name="rig" /> My rigs
        </PxButton>
        <PxButton variant="light" className={main} onClick={() => open('refinery')}>
          <PxIcon name="core" /> Refinery
        </PxButton>
      </div>
    </div>
  );
}
