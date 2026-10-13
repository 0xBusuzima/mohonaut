'use client';

import { fuelLineWad, sitePads } from '@mohonaut/sdk';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Address } from 'viem';
import type { Action } from '../../game/actions';
import { tankRoom, weiForAtMostLitres, withHeadroom } from '../../game/derive';
import { parseAmount, referrerFromUrl } from '../../game/play';
import type { GameState } from '../../game/state';
import { useNow } from '../../lib/clock';
import {
  formatDuration,
  formatEth,
  formatEthInput,
  formatLitres,
  formatMohn,
  formatUtc,
} from '../../lib/format';
import { PxButton, PxIcon } from './px';

/** A dark read-out box: label on the left, value on the right. */
export function Readout({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="px-inset grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 py-3 text-lg">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-concrete">{k}</dt>
          <dd className="text-right text-cyan">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A segmented pixel gauge, `fill` in [0, 1]. */
function Gauge({
  fill,
  label,
  segments = 16,
  progress = false,
  low = false,
  valueText,
}: {
  fill: number;
  label: string;
  segments?: number;
  /** A progress bar (cyan) rather than a tank level. */
  progress?: boolean;
  /** A tank level that is running low: red. */
  low?: boolean;
  /** What a screen reader says for the value, when a percentage says too little. */
  valueText?: string;
}) {
  const n = segments;
  // Anything in it lights at least one segment: a few litres in a big tank is not "empty".
  const lit = fill > 0 ? Math.max(1, Math.round(Math.min(1, fill) * n)) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(1, Math.max(0, fill)) * 100)}
      aria-valuetext={valueText}
      className="flex gap-0.5 border-[3px] border-charcoal bg-night p-1"
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={`h-5 flex-1 ${i < lit ? (progress ? 'bg-cyan' : low ? 'bg-alarm' : 'bg-amber') : 'bg-steel'}`}
        />
      ))}
    </div>
  );
}

function AmountInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-lg">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-input mt-1 block w-full px-3 py-2 text-2xl"
      />
    </label>
  );
}

const DEFAULT_ETH = '0.001';

/** The standard refine queue at launch (docs/02): 72 hours. Only for the progress bar. */
const REFINE_QUEUE_S = 72 * 3600;

/** The diesel tank: buy diesel with ETH. The first purchase opens the site. */
export function FuelWindow({
  state,
  action,
  first,
  ethBalance,
}: {
  state: GameState;
  action: Action;
  first: boolean;
  /** ETH in the player's wallet, when known. */
  ethBalance: bigint | undefined;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const [referrer] = useState(referrerFromUrl);
  const rate = state.network.litresPerEth;
  // What the tank takes now; a new site starts at level 1 with the Pilot Rig's burn.
  const p = state.player;
  const registered = p !== null && p.registered;
  const now = Math.floor((useNow(30_000) ?? 0) / 1000);
  const capacityPerHour = fuelLineWad(registered ? p.level : 1);
  const room = tankRoom({
    now,
    genesisTime: state.network.genesisTime,
    marketOpenTime: state.network.marketOpenTime,
    maxTankHours: state.network.maxTankHours,
    capacityPerHour,
    burn: registered ? p.burn : (state.rigs[0]?.burn ?? 0n),
    tank: p?.tank ?? 0n,
  });
  const maxWei = rate === null || now === 0 ? null : weiForAtMostLitres(room, rate);
  const beforeOpen = now < state.network.marketOpenTime;
  // Until the player types, offer the default or the most the tank takes, whichever is less.
  const eth =
    typed ??
    (maxWei !== null && parseAmount(DEFAULT_ETH) > maxWei ? formatEthInput(maxWei) : DEFAULT_ETH);
  const wei = parseAmount(eth);
  const litres = rate === null ? null : (wei * rate) / 10n ** 18n;
  const tank = p?.tank ?? 0n;
  const full = tank + room;
  const hoursLeft = registered && p.burn > 0n ? Number((tank * 10n) / p.burn) / 10 : null;
  // Said before the wallet opens, not after it fails.
  const overBalance = ethBalance !== undefined && wei > ethBalance;
  // How long the diesel being bought runs the site's rigs (a new site: the Pilot Rig).
  const siteBurn = registered ? p.burn : (state.rigs[0]?.burn ?? 0n);
  const buysHours =
    litres === null || siteBurn === 0n || litres === 0n
      ? null
      : Number((litres * 10n) / siteBurn) / 10;
  return (
    <div className="flex flex-col gap-4">
      {first && (
        <p className="text-center text-lg">
          Your first diesel opens your drill site with a free Pilot Rig (10 DP, 0.25 ℓ/h).
        </p>
      )}
      {rate === null && (
        <p role="status" className="px-dark px-3 py-2 text-amber">
          The ETH/USD price feed is late, so diesel sales wait for now. Rigs keep drilling.
        </p>
      )}
      {registered && (
        <>
          <Gauge
            fill={full > 0n ? Number((tank * 1_000_000n) / full) / 1e6 : 0}
            label="Diesel in tank"
            low={hoursLeft !== null && hoursLeft < 12}
            valueText={`${formatLitres(tank)}${hoursLeft === null ? '' : `, about ${hoursLeft.toFixed(1)} h of diesel`}${hoursLeft !== null && hoursLeft < 12 ? ', running low' : ''}`}
          />
          <Readout
            rows={[
              ['In tank', formatLitres(tank)],
              [
                'Burn',
                // The burn in ETH too (docs/01 6): what an hour of drilling costs in diesel.
                rate === null || rate === 0n
                  ? `${formatLitres(p.burn, 2)}/h`
                  : `${formatLitres(p.burn, 2)}/h ≈ ${formatEth((p.burn * 10n ** 18n) / rate, 6)}/h`,
              ],
              [
                'Runs until',
                hoursLeft === null || now === 0
                  ? '—'
                  : `${formatUtc(now + Math.floor(hoursLeft * 3600))} (≈ ${hoursLeft.toFixed(1)} h)`,
              ],
            ]}
          />
        </>
      )}
      <AmountInput label="ETH to spend" value={eth} onChange={setTyped} />
      <p className="text-base">
        ≈ <b>{litres === null ? '—' : formatLitres(litres)}</b>
        {buysHours !== null && <>, about {formatHours(buysHours)} for your rigs</>} · in wallet{' '}
        <b>{ethBalance === undefined ? '—' : formatEth(ethBalance)}</b>
      </p>
      {overBalance && (
        <p role="status" className="text-base text-amber">
          That is more than your wallet holds. Leave a little ETH for gas.
        </p>
      )}
      {maxWei !== null && (
        <p className="text-base text-concrete">
          Your tank takes up to {formatLitres(room)} now (≈ {formatEth(maxWei)}).{' '}
          {beforeOpen && 'Until Market Open + 24 h a tank holds only what its rigs burn by then. '}
          <button
            type="button"
            className="font-bold text-amber underline"
            onClick={() => setTyped(formatEthInput(maxWei))}
          >
            Use max
          </button>
        </p>
      )}
      <PxButton
        className="flex w-full items-center justify-center gap-2 py-3 text-xl"
        busy={action.busy === 'buyFuel'}
        disabled={wei === 0n || rate === null || overBalance}
        onClick={() =>
          void action.run({ fn: 'buyFuel', args: [referrer], value: wei, done: 'Diesel delivered' })
        }
      >
        <PxIcon name="fuel" /> {first ? 'Open my site' : 'Buy diesel'}
      </PxButton>
    </div>
  );
}

/** "36 h" under three days, "4.2 days" after. */
function formatHours(h: number): string {
  return h < 72 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`;
}

/** The site level: pads and fuel line, and the upgrade. */
export function SiteWindow({ state, action }: { state: GameState; action: Action }) {
  const p = state.player;
  if (p === null) return null;
  const price = p.siteUpgradePrice;
  return (
    <div className="flex flex-col gap-4">
      <Readout
        rows={[
          ['Site level', p.level],
          ['Pads', `${p.padsUsed} / ${sitePads(p.level)}`],
          [
            'Fuel line',
            `${formatLitres(p.burn, 2)}/h of ${formatLitres(fuelLineWad(p.level), 2)}/h`,
          ],
          ['Scrap credit', formatMohn(p.scrapCredit)],
        ]}
      />
      {price !== null ? (
        <>
          <PadMap used={p.padsUsed} now={sitePads(p.level)} next={sitePads(p.level + 1)} />
          <p className="text-center text-lg">
            Level {p.level + 1}: {sitePads(p.level + 1)} pads,{' '}
            {formatLitres(fuelLineWad(p.level + 1), 2)}/h fuel line
          </p>
          <PxButton
            className="flex w-full items-center justify-center gap-2 py-3 text-xl"
            busy={action.busy === 'upgradeSite'}
            onClick={() =>
              void action.run({
                fn: 'upgradeSite',
                args: [withHeadroom(price), false],
                done: `Site upgraded to L${p.level + 1}`,
              })
            }
          >
            <PxIcon name="coin" /> Upgrade for {formatMohn(price, 0)}
          </PxButton>
        </>
      ) : (
        <p className="text-center text-lg">Your site is at the top level.</p>
      )}
    </div>
  );
}

/** The site's pads as tiles: rigs on them, free ones, and the ones the next level adds. */
function PadMap({ used, now, next }: { used: number; now: number; next: number }) {
  return (
    <div
      role="img"
      aria-label={`${used} of ${now} pads in use; the next level adds ${next - now}.`}
      className="px-inset flex flex-wrap justify-center gap-1.5 p-3"
    >
      {Array.from({ length: next }, (_, i) => {
        let cls = 'border-[3px] border-[#0b0d10] bg-orange';
        if (i >= used) cls = 'border-[3px] border-steel bg-[#262c33]';
        if (i >= now) cls = 'border-[3px] border-dashed border-amber bg-transparent text-amber';
        return (
          <span key={i} className={`grid h-7 w-7 place-items-center text-sm ${cls}`}>
            {i >= now ? '+' : ''}
          </span>
        );
      })}
    </div>
  );
}

/** Refining unrefined $MOHN into the wallet: the 72-hour queue or the fast route. */
export function RefineryWindow({
  state,
  action,
  address,
}: {
  state: GameState;
  action: Action;
  /** The player (finalizeRefine takes the account). */
  address: Address | undefined;
}) {
  const [amount, setAmount] = useState('');
  const p = state.player;
  if (p === null || address === undefined) return null;
  // The contract opens the refinery once openMarket has run, not at the time alone.
  const open = state.network.marketOpened;
  const wei = parseAmount(amount);
  return (
    <div className="flex flex-col gap-4">
      <Readout rows={[['Unrefined', formatMohn(p.pending)]]} />
      {!open ? (
        <p className="text-center text-lg">
          Refining opens at Market Open ({formatUtc(state.network.marketOpenTime)}), as soon as the
          market is opened on chain.
        </p>
      ) : (
        <>
          <p className="text-base text-concrete">
            Standard refining waits in a 72-hour queue with no fee. Fast refining is immediate,
            minus the fast-refine fee (8% at launch): half is burned, half returns to the reserve.
          </p>
          <AmountInput label="$MOHN to refine" value={amount} onChange={setAmount} />
          <button
            type="button"
            className="-mt-2 self-start text-base font-bold text-amber underline"
            onClick={() => setAmount(formatEthInput(p.pending))}
          >
            Use all
          </button>
          <div className="grid grid-cols-2 gap-3">
            <PxButton
              disabled={wei === 0n}
              busy={action.busy === 'refine'}
              onClick={() =>
                void action.run({ fn: 'refine', args: [wei, false], done: 'Queued for 72 hours' })
              }
            >
              Queue (72 h)
            </PxButton>
            <PxButton
              variant="dark"
              disabled={wei === 0n}
              busy={action.busy === 'refine'}
              onClick={() =>
                void action.run({ fn: 'refine', args: [wei, true], done: 'Refined to your wallet' })
              }
            >
              Fast refine
            </PxButton>
          </div>
        </>
      )}
      {p.refines.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Refine queue">
          {p.refines.map((q) => (
            <li
              key={q.id}
              className="px-dark flex flex-wrap items-center justify-between gap-3 px-3 py-2"
            >
              <span>{formatMohn(q.amount)}</span>
              {q.readyAt > state.at ? (
                <span className="flex min-w-40 flex-col items-end gap-1">
                  <span className="text-sm text-concrete">
                    ready in {formatDuration(q.readyAt - state.at)}
                  </span>
                  <Gauge
                    fill={1 - (q.readyAt - state.at) / REFINE_QUEUE_S}
                    label={`Refine ${q.id} in the queue`}
                    segments={12}
                    progress
                  />
                </span>
              ) : (
                <PxButton
                  variant="light"
                  className="!py-1 !text-base"
                  busy={action.busy === 'finalizeRefine'}
                  onClick={() =>
                    void action.run({
                      fn: 'finalizeRefine',
                      args: [address, BigInt(q.id)],
                      done: 'Refined to your wallet',
                    })
                  }
                >
                  Collect
                </PxButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
