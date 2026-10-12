'use client';

import { formatDepth, fuelLineWad, millimetres, sitePads, stratumAt } from '@mohonaut/sdk';
import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import { useAccount, useBalance, useSwitchChain } from 'wagmi';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Counter } from '../../components/Counter';
import { Tabs } from '../../components/Tabs';
import { TankGauge } from '../../components/TankGauge';
import { useGameAction } from '../../game/actions';
import { efficiency, perHourEstimate, shareOfNetwork, withHeadroom } from '../../game/derive';
import { gameChain } from '../../game/network';
import { SiteScene } from '../../game/SiteScene';
import { useGameState } from '../../game/state';
import type { GameState, RigType } from '../../game/state';
import { parseAmount, referrerFromUrl, rigName, scenePads } from '../../game/play';
import { useE2EConnect } from '../../game/e2e';
import { PlayFrame, Welcome } from './PlayFrame';
import { formatEth, formatLitres, formatMohn, formatUtc } from '../../lib/format';
import { setLowPower, useLowPower } from '../../lib/power';
import { apiEnabled } from '../../social/api';
import { CrewPanel, ProfilePanel, SeasonsPanel, SignedIn, SurveyPanel } from '../../social/panels';

type Action = ReturnType<typeof useGameAction>;

/** `openConnect`: the player already pressed Connect on the light welcome screen. */
export function PlayScreen({ openConnect = false }: { openConnect?: boolean }) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const lowPower = useLowPower();
  const { state, refetch } = useGameState(address, lowPower);
  const action = useGameAction(refetch);

  // Open the wallet list once, for the press that loaded this code (a ref: no re-render).
  const { openConnectModal } = useConnectModal();
  const opened = useRef(false);
  useEffect(() => {
    if (!openConnect || opened.current || isConnected || openConnectModal === undefined) return;
    opened.current = true;
    openConnectModal();
  }, [openConnect, isConnected, openConnectModal]);

  useE2EConnect();

  const wrongChain = isConnected && chainId !== gameChain.id;
  const paused = state !== null && state.network.pausedUntil > state.at;

  return (
    <PlayFrame connect={<ConnectButton chainStatus="icon" showBalance={false} />}>
      {paused && (
        <p role="alert" className="rounded-lg border border-bad p-4">
          The game is paused by the Guardian until {formatUtc(state.network.pausedUntil)}. Your
          rigs, tank and balances are safe; actions resume automatically.
        </p>
      )}
      {wrongChain && (
        <Card title="Wrong network">
          <p>Your wallet is on another network. Mohonaut runs on {gameChain.name}.</p>
          <Button className="mt-4" onClick={() => switchChain({ chainId: gameChain.id })}>
            Switch to {gameChain.name}
          </Button>
        </Card>
      )}
      {!isConnected && <Welcome connect={<ConnectButton label="Connect wallet" />} />}
      {isConnected && !wrongChain && state === null && (
        <p role="status" className="text-fg-muted">
          Reading the chain…
        </p>
      )}
      {isConnected && !wrongChain && state !== null && address !== undefined && (
        <Screens state={state} action={action} address={address} />
      )}
    </PlayFrame>
  );
}

/** The site, plus the off-chain social screens when the API is configured (docs/06 4.4). */
function Screens({
  state,
  action,
  address,
}: {
  state: GameState;
  action: Action;
  address: Address;
}) {
  const site = <Game state={state} action={action} />;
  if (!apiEnabled) return site;
  return (
    <Tabs
      label="Game screens"
      tabs={[
        { id: 'site', label: 'Site', content: site },
        {
          id: 'crew',
          label: 'Crew',
          content: <SignedIn>{(me) => <CrewPanel me={me} />}</SignedIn>,
        },
        {
          id: 'survey',
          label: 'Survey',
          content: <SignedIn>{() => <SurveyPanel now={state.at} />}</SignedIn>,
        },
        { id: 'seasons', label: 'Seasons', content: <SeasonsPanel address={address} /> },
        {
          id: 'profile',
          label: 'Profile',
          content: <SignedIn>{(me) => <ProfilePanel me={me} address={address} />}</SignedIn>,
        },
      ]}
    />
  );
}

function WorldLine({ emitted }: { emitted: bigint }) {
  const depth = millimetres(emitted);
  const { current } = stratumAt(depth);
  return (
    <p className="num text-sm text-fg-muted uppercase">
      World Bore {formatDepth(depth)} · Stratum {current.numeral} — {current.name}
    </p>
  );
}

function Game({ state, action }: { state: GameState; action: Action }) {
  const p = state.player;
  const n = state.network;
  const level = p?.level ?? 0;
  const tank = p?.tank ?? 0n;
  // Redraw the scene only when what it shows changes, not on every 12-second read.
  const sceneKey = `${level}:${tank > 0n}:${state.rigs.map((r) => `${r.owned}/${r.active}`).join(',')}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneKey covers every input
  const pads = useMemo(() => scenePads(level, state.rigs, tank), [sceneKey]);

  if (p === null || !p.registered) {
    return (
      <>
        <WorldLine emitted={n.emitted} />
        <FuelPanel state={state} action={action} first />
      </>
    );
  }

  const perHour = perHourEstimate(p.dp, n.activeDp, n.hourEmission);
  const capacity = fuelLineWad(p.level) * BigInt(n.maxTankHours);
  const owned = state.rigs.filter((r) => r.owned > 0);
  const summary = `Site level ${p.level}: ${p.padsUsed} of ${sitePads(p.level)} pads in use. ${owned
    .map((r) => `${r.owned} ${rigName(r.id)}, ${r.active} running`)
    .join('; ')}.`;

  return (
    <>
      <WorldLine emitted={n.emitted} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <SiteScene pads={pads} label={summary} />
        <Card label="Shift report" title={`Site L${p.level}`}>
          <p className="text-fg-muted">Unrefined $MOHN</p>
          <Counter
            base={p.pending}
            perHour={p.tank > 0n ? perHour : 0n}
            since={state.at}
            unit="MOHN"
          />
          <ul className="mt-4 flex flex-col gap-1">
            <li>
              Your share of network DP:{' '}
              <span className="num">{shareOfNetwork(p.dp, n.activeDp)}</span>
            </li>
            <li>
              Current estimate ≈ <span className="num">{formatMohn(perHour)}/h</span>, falls as
              others join
            </li>
            <li>
              Drill Power <span className="num">{p.dp.toString()} DP</span> · burn{' '}
              <span className="num">{formatLitres(p.burn, 2)}/h</span>
            </li>
            <li>
              Wallet <span className="num">{formatMohn(p.walletMohn)}</span>
            </li>
          </ul>
          <div className="mt-4">
            <TankGauge tank={p.tank} capacity={capacity} burnPerHour={p.burn} now={state.at} />
          </div>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <FuelPanel state={state} action={action} first={false} />
        <SitePanel state={state} action={action} />
        <MarketPanel state={state} action={action} />
        <RigsPanel state={state} action={action} />
        <RefineryPanel state={state} action={action} />
      </div>
      <LowPowerSwitch />
    </>
  );
}

function FuelPanel({ state, action, first }: { state: GameState; action: Action; first: boolean }) {
  const { address } = useAccount();
  const balance = useBalance({ address, query: { refetchInterval: 12_000 } });
  const [eth, setEth] = useState('0.001');
  const [referrer] = useState(referrerFromUrl);
  const wei = parseAmount(eth);
  const rate = state.network.litresPerEth;
  const litres = rate === null ? null : (wei * rate) / 10n ** 18n;
  return (
    <Card label="Diesel" title={first ? 'Fill your tank' : 'Diesel tank'}>
      {first && (
        <p className="mb-4 max-w-xl">
          Your first diesel purchase opens your drill site with a free Pilot Rig (10 DP, 0.25 ℓ/h).
        </p>
      )}
      {rate === null && (
        <p role="status" className="mb-4 text-warn">
          The ETH/USD price feed is late, so diesel sales wait for now. Rigs keep drilling.
        </p>
      )}
      <label className="block">
        <span className="text-fg-muted">ETH to spend</span>
        <input
          inputMode="decimal"
          value={eth}
          onChange={(e) => setEth(e.target.value)}
          className="num mt-1 block w-full rounded border border-line bg-surface-sunken px-3 py-2"
        />
      </label>
      <p className="mt-2 text-fg-muted">
        ≈ <span className="num">{litres === null ? '—' : formatLitres(litres)}</span> · in wallet{' '}
        <span className="num">
          {balance.data === undefined ? '—' : formatEth(balance.data.value)}
        </span>
      </p>
      <Button
        className="mt-4"
        busy={action.busy === 'buyFuel'}
        disabled={wei === 0n || rate === null}
        onClick={() =>
          void action.run({ fn: 'buyFuel', args: [referrer], value: wei, done: 'Diesel delivered' })
        }
      >
        Buy diesel
      </Button>
    </Card>
  );
}

function SitePanel({ state, action }: { state: GameState; action: Action }) {
  const p = state.player;
  if (p === null) return null;
  const price = p.siteUpgradePrice;
  return (
    <Card label="Drill site" title={`Level ${p.level}`}>
      <ul className="flex flex-col gap-1">
        <li>
          Pads{' '}
          <span className="num">
            {p.padsUsed} / {sitePads(p.level)}
          </span>
        </li>
        <li>
          Fuel line{' '}
          <span className="num">
            {formatLitres(p.burn, 2)}/h of {formatLitres(fuelLineWad(p.level), 2)}/h
          </span>
        </li>
        <li>
          Scrap credit <span className="num">{formatMohn(p.scrapCredit)}</span>
        </li>
      </ul>
      {price !== null && (
        <>
          <p className="mt-4">
            Level {p.level + 1}: <span className="num">{sitePads(p.level + 1)}</span> pads,{' '}
            <span className="num">{formatLitres(fuelLineWad(p.level + 1), 2)}/h</span> fuel line,
            for <span className="num">{formatMohn(price)}</span>
          </p>
          <Button
            className="mt-4"
            variant="secondary"
            busy={action.busy === 'upgradeSite'}
            onClick={() =>
              void action.run({
                fn: 'upgradeSite',
                args: [withHeadroom(price), false],
                done: `Site upgraded to L${p.level + 1}`,
              })
            }
          >
            Upgrade site
          </Button>
        </>
      )}
    </Card>
  );
}

function MarketPanel({ state, action }: { state: GameState; action: Action }) {
  const p = state.player;
  if (p === null) return null;
  return (
    <Card label="Equipment Market" title="Rigs">
      <p className="text-fg-muted">
        Prices follow the public auction formula and move with time and sales. Paid from scrap
        credit first, then unrefined $MOHN.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {state.rigs
          .filter((r) => r.id !== 0)
          .map((r) => (
            <MarketRow key={r.id} rig={r} level={p.level} action={action} />
          ))}
      </ul>
    </Card>
  );
}

function MarketRow({ rig, level, action }: { rig: RigType; level: number; action: Action }) {
  const locked = level < rig.minLevel;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
      <div>
        <p className="font-semibold">{rigName(rig.id)}</p>
        <p className="num text-sm text-fg-muted">
          {rig.dp.toString()} DP · {formatLitres(rig.burn, 2)}/h · {efficiency(rig.dp, rig.burn)} DP
          per ℓ/h
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="num">{formatMohn(rig.price, 0)}</span>
        {locked ? (
          <Badge>Site L{rig.minLevel}</Badge>
        ) : (
          <Button
            size="sm"
            busy={action.busy === 'buyMachines'}
            aria-label={`Buy one ${rigName(rig.id)}`}
            onClick={() =>
              void action.run({
                fn: 'buyMachines',
                args: [BigInt(rig.id), 1, withHeadroom(rig.price), false],
                done: `${rigName(rig.id)} installed`,
              })
            }
          >
            Buy
          </Button>
        )}
      </div>
    </li>
  );
}

function RigsPanel({ state, action }: { state: GameState; action: Action }) {
  const owned = state.rigs.filter((r) => r.owned > 0);
  return (
    <Card label="Your rigs" title="Run or rest">
      <p className="text-fg-muted">
        Stop a rig when its diesel is not worth it. Scrapping a rig credits 20% of its value as
        scrap credit, spendable on rigs and site levels; the Pilot Rig credits nothing.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {owned.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"
          >
            <p>
              {rigName(r.id)}{' '}
              <span className="num text-fg-muted">
                {r.active} / {r.owned} running
              </span>
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
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
              </Button>
              <Button
                size="sm"
                variant="secondary"
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
              </Button>
              <Button
                size="sm"
                variant="danger"
                busy={action.busy === 'scrapMachines'}
                aria-label={`Scrap one ${rigName(r.id)}`}
                onClick={() =>
                  void action.run({
                    fn: 'scrapMachines',
                    args: [BigInt(r.id), 1],
                    done: 'Rig scrapped',
                  })
                }
              >
                Scrap
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RefineryPanel({ state, action }: { state: GameState; action: Action }) {
  const { address } = useAccount();
  const [amount, setAmount] = useState('');
  const p = state.player;
  if (p === null || address === undefined) return null;
  const open = state.at >= state.network.marketOpenTime;
  const wei = parseAmount(amount);
  return (
    <Card label="Refinery" title="Refine">
      {!open ? (
        <p>Refining opens at Market Open: {formatUtc(state.network.marketOpenTime)}.</p>
      ) : (
        <>
          <p className="text-fg-muted">
            Standard refining waits in a 72-hour queue with no fee. Fast refining is immediate,
            minus the fast-refine fee (8% at launch): half is burned, half returns to the reserve.
          </p>
          <label className="mt-4 block">
            <span className="text-fg-muted">
              $MOHN to refine (you have {formatMohn(p.pending)})
            </span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="num mt-1 block w-full rounded border border-line bg-surface-sunken px-3 py-2"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              disabled={wei === 0n}
              busy={action.busy === 'refine'}
              onClick={() =>
                void action.run({ fn: 'refine', args: [wei, false], done: 'Queued for 72 hours' })
              }
            >
              Queue refine
            </Button>
            <Button
              variant="secondary"
              disabled={wei === 0n}
              busy={action.busy === 'refine'}
              onClick={() =>
                void action.run({ fn: 'refine', args: [wei, true], done: 'Refined to your wallet' })
              }
            >
              Fast refine
            </Button>
          </div>
        </>
      )}
      {p.refines.length > 0 && (
        <ul className="mt-6 flex flex-col gap-2" aria-label="Refine queue">
          {p.refines.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="num">{formatMohn(q.amount)}</span>
              {q.readyAt > state.at ? (
                <span className="text-fg-muted">ready {formatUtc(q.readyAt)}</span>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
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
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LowPowerSwitch() {
  const on = useLowPower();
  return (
    <label className="flex items-center gap-2 text-fg-muted">
      <input type="checkbox" checked={on} onChange={(e) => setLowPower(e.target.checked)} />
      Low-power mode: a still scene and slower updates, for older phones and saving battery
    </label>
  );
}
