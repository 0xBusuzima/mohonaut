'use client';

import { fuelLineWad, sitePads } from '@mohonaut/sdk';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Action } from '../../game/actions';
import { efficiency, maxRigsToBuy, withHeadroom } from '../../game/derive';
import type { QuoteHook } from '../../game/quote';
import { rigName } from '../../game/play';
import { RigPortrait } from '../../game/pixel/RigPortrait';
import type { GameState, RigType } from '../../game/state';
import { formatLitres, formatMohn } from '../../lib/format';
import { useTwoStep } from './confirm';
import { PxButton, PxIcon } from './px';

/** One rig as a card: the drawing on its pad, the numbers, and the card's own buttons. */
function RigCard({
  rig,
  running = true,
  dim = false,
  tag,
  children,
}: {
  rig: RigType;
  running?: boolean;
  dim?: boolean;
  tag?: ReactNode;
  children: ReactNode;
}) {
  const eff = efficiency(rig.dp, rig.burn);
  return (
    <li className="px-dark flex flex-col">
      <div className="rig-portrait relative flex justify-center overflow-hidden border-b-[3px] border-[#0b0d10] bg-[#0d1220]">
        <div className={dim ? 'opacity-50' : undefined}>
          <RigPortrait typeId={rig.id} running={running && !dim} />
        </div>
        {tag !== undefined && (
          <span className="absolute top-2 right-2 bg-amber px-1.5 text-sm font-bold text-night">
            {tag}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-xl font-bold text-orange">{rigName(rig.id)}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-base">
          <dt className="text-concrete">Drill power</dt>
          <dd className="text-right text-cyan">{rig.dp.toString()} DP</dd>
          <dt className="text-concrete">Diesel</dt>
          <dd className="text-right text-cyan">{formatLitres(rig.burn, 2)}/h</dd>
          <dt className="text-concrete">DP per ℓ/h</dt>
          <dd className="text-right text-cyan">{eff === null ? '—' : eff.toFixed(0)}</dd>
        </dl>
        <div className="mt-auto pt-2">{children}</div>
      </div>
    </li>
  );
}

/** The equipment market: every rig type as a card, cheapest first. */
export function MarketWindow({
  state,
  action,
  useQuote,
  openSite,
  history,
}: {
  state: GameState;
  action: Action;
  /** Prices more than one rig: the chain's batch quote (useRigQuote) or the training site's.
   * A prop, so the training site never loads the wallet code. */
  useQuote: QuoteHook;
  /** Opens the site window (more pads and fuel line); without it no button shows. */
  openSite?: () => void;
  /** Shown under the introduction: the live game's price chart (the training site has none). */
  history?: ReactNode;
}) {
  const p = state.player;
  if (p === null) return null;
  const freePads = sitePads(p.level) - p.padsUsed;
  // The auction's price of one Drill Power now: a premium-free rig's price over its DP.
  const base = state.rigs.find((r) => r.id !== 0 && r.premiumBps === 0 && r.dp > 0n);
  const perDp = base === undefined ? null : base.price / base.dp;
  return (
    <>
      <p className="mb-4 text-center text-base text-concrete">
        Choose rigs for your free pads. Prices follow the public auction formula and move with time
        and sales; you pay from scrap credit first, then unrefined $MOHN.
        {perDp !== null && perDp > 0n && (
          <>
            {' '}
            Right now 1 DP costs <span className="text-cyan">{formatMohn(perDp)}</span> before tier
            premiums.
          </>
        )}
      </p>
      {history}
      <p className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-lg">
        <PxIcon name="rig" /> {freePads > 0 ? freePads : 'No'} free pad
        {freePads === 1 ? '' : 's'} · Site level {p.level}
        {openSite !== undefined && (
          <PxButton
            variant={freePads > 0 ? 'light' : 'primary'}
            className="!px-3 !py-1 !text-base"
            onClick={openSite}
          >
            Expand the site
          </PxButton>
        )}
      </p>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {state.rigs
          .filter((r) => r.id !== 0)
          .map((r) => {
            const locked = p.level < r.minLevel;
            const max = maxRigsToBuy({
              freePads,
              fuelLine: fuelLineWad(p.level),
              burn: p.burn,
              rigBurn: r.burn,
              rigDp: r.dp,
            });
            return (
              <RigCard
                key={r.id}
                rig={r}
                dim={locked}
                tag={r.owned > 0 ? `Owned ${r.owned}` : undefined}
              >
                {locked ? (
                  <>
                    <p className="mb-2 flex items-center justify-center gap-2 text-xl font-bold">
                      <PxIcon name="coin" /> {formatMohn(r.price, 0)}
                    </p>
                    <PxButton
                      variant="dark"
                      className="flex w-full items-center justify-center gap-2"
                      disabled
                    >
                      <PxIcon name="lock" /> Site L{r.minLevel}
                    </PxButton>
                  </>
                ) : (
                  <BuyRig
                    rig={r}
                    max={max}
                    freePads={freePads}
                    action={action}
                    useQuote={useQuote}
                  />
                )}
              </RigCard>
            );
          })}
      </ul>
    </>
  );
}

/** The price and the buy button of one card, with a count from 1 to what fits. */
function BuyRig({
  rig,
  max,
  freePads,
  action,
  useQuote,
}: {
  rig: RigType;
  max: number;
  freePads: number;
  action: Action;
  useQuote: QuoteHook;
}) {
  const [wanted, setWanted] = useState(1);
  const qty = Math.max(1, Math.min(wanted, max));
  const { total, exact } = useQuote(rig.id, qty, rig.price);
  const name = rigName(rig.id);
  let blocked: string | null = null;
  if (freePads <= 0) blocked = 'No free pad';
  else if (max === 0) blocked = 'Fuel line full';
  return (
    <>
      <p className="mb-2 flex items-center justify-center gap-2 text-xl font-bold">
        <PxIcon name="coin" /> {exact ? '' : '≈ '}
        {formatMohn(total, 0)}
      </p>
      {max > 1 && (
        <div className="mb-2 flex items-center justify-center gap-2">
          <PxButton
            variant="dark"
            className="!px-3 !py-0.5"
            aria-label={`One ${name} fewer`}
            disabled={qty <= 1}
            onClick={() => setWanted(qty - 1)}
          >
            −
          </PxButton>
          <span aria-live="polite" className="min-w-16 text-center text-lg text-cyan">
            × {qty}
          </span>
          <PxButton
            variant="dark"
            className="!px-3 !py-0.5"
            aria-label={`One ${name} more`}
            disabled={qty >= max}
            onClick={() => setWanted(qty + 1)}
          >
            +
          </PxButton>
          <span className="text-xs text-concrete">max {max}</span>
        </div>
      )}
      <PxButton
        className="w-full"
        disabled={blocked !== null || !exact}
        busy={action.busy === 'buyMachines'}
        aria-label={qty === 1 ? `Buy one ${name}` : `Buy ${qty} ${name}s`}
        onClick={() =>
          void action.run({
            fn: 'buyMachines',
            args: [BigInt(rig.id), qty, withHeadroom(total), false],
            done: qty === 1 ? `${name} installed` : `${qty} ${name}s installed`,
          })
        }
      >
        {blocked ?? (qty === 1 ? 'Buy' : `Buy ${qty}`)}
      </PxButton>
    </>
  );
}

/** The rigs on the site: start, stop or scrap them. */
export function RigsWindow({
  state,
  action,
  openMarket,
  openSite,
}: {
  state: GameState;
  action: Action;
  openMarket: () => void;
  /** Opens the site window; without it no button shows. */
  openSite?: () => void;
}) {
  const owned = state.rigs.filter((r) => r.owned > 0);
  const p = state.player;
  const scrap = useTwoStep();
  return (
    <>
      <p className="mb-4 text-center text-base text-concrete">
        Stop a rig when its diesel is not worth it. Scrapping credits 20% of its value as scrap
        credit for rigs and site levels; the Pilot Rig credits nothing.
      </p>
      {p !== null && openSite !== undefined && (
        <p className="mb-4 flex flex-wrap items-center justify-center gap-3 text-lg">
          Site level {p.level} · {p.padsUsed} / {sitePads(p.level)} pads
          <PxButton variant="light" className="!px-3 !py-1 !text-base" onClick={openSite}>
            Expand the site
          </PxButton>
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {scrap.armed === null
          ? ''
          : `Press again to scrap one ${rigName(Number(scrap.armed))}. It cannot be undone.`}
      </p>
      {owned.length === 0 ? (
        <div className="text-center">
          <p className="mb-4 text-lg">No rigs on your site yet.</p>
          <PxButton onClick={openMarket}>Open the market</PxButton>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {owned.map((r) => (
            <RigCard key={r.id} rig={r} running={r.active > 0} tag={`${r.active} / ${r.owned} on`}>
              <div className="grid grid-cols-3 gap-2">
                <PxButton
                  variant="light"
                  className="!px-1 !text-base"
                  disabled={r.active >= r.owned}
                  busy={action.busy === 'setActiveRigs'}
                  aria-label={`Start one ${rigName(r.id)}`}
                  onClick={() =>
                    void action.run({
                      fn: 'setActiveRigs',
                      args: [BigInt(r.id), r.active + 1],
                      done: 'Rig started',
                    })
                  }
                >
                  Start
                </PxButton>
                <PxButton
                  variant="light"
                  className="!px-1 !text-base"
                  disabled={r.active === 0}
                  busy={action.busy === 'setActiveRigs'}
                  aria-label={`Stop one ${rigName(r.id)}`}
                  onClick={() =>
                    void action.run({
                      fn: 'setActiveRigs',
                      args: [BigInt(r.id), r.active - 1],
                      done: 'Rig stopped',
                    })
                  }
                >
                  Stop
                </PxButton>
                <PxButton
                  variant="dark"
                  className="!px-1 !text-base"
                  busy={action.busy === 'scrapMachines'}
                  aria-label={
                    scrap.armed === String(r.id)
                      ? `Confirm: scrap one ${rigName(r.id)}`
                      : `Scrap one ${rigName(r.id)}`
                  }
                  onBlur={scrap.disarm}
                  onKeyDown={scrap.ignoreRepeats}
                  onClick={() =>
                    // Scrapping destroys the rig: a second, separate press confirms.
                    scrap.press(String(r.id), () => {
                      void action.run({
                        fn: 'scrapMachines',
                        args: [BigInt(r.id), 1],
                        done: 'Rig scrapped',
                      });
                    })
                  }
                >
                  {scrap.armed === String(r.id) ? 'Sure?' : 'Scrap'}
                </PxButton>
              </div>
            </RigCard>
          ))}
        </ul>
      )}
    </>
  );
}
