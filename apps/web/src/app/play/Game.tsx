'use client';

import { formatDepth, fuelLineWad, millimetres, stratumAt } from '@mohonaut/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Address } from 'viem';
import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi';
import { siweAdapter } from '../../game/auth';
import { useE2EConnect } from '../../game/e2e';
import { gameChain } from '../../game/network';
import { PixelWorld } from '../../game/pixel/PixelWorld';
import type { Hit } from '../../game/pixel/world';
import { describeHit, scenePads } from '../../game/play';
import { useGameAction } from '../../game/actions';
import { perHourEstimate } from '../../game/derive';
import type { Action } from '../../game/actions';
import { useGameState } from '../../game/state';
import type { GameState } from '../../game/state';
import { formatUtc } from '../../lib/format';
import { useLowPower } from '../../lib/power';
import { api, apiEnabled, apiMessage } from '../../social/api';
import { ME_KEY, useMe } from '../../social/session';
import { CrewPanel, ProfilePanel, SeasonsPanel, SignedIn, SurveyPanel } from '../../social/panels';
import { Hud } from './Hud';
import type { Panel } from './Hud';
import { PxButton, PxIcon, PxModal, Steps, usePixelGame } from './px';
import { MarketWindow, RigsWindow } from './RigCards';
import { FuelWindow, RefineryWindow, SiteWindow } from './windows';
import { Brand, LoadingScreen, ONBOARDING_STEPS } from './Shell';

const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const localNameKey = (a: Address) => `mohonaut.siteName.${a.toLowerCase()}`;

function localName(a: Address): string | null {
  try {
    return window.localStorage.getItem(localNameKey(a));
  } catch {
    return null;
  }
}

/** The full-screen game: the world, the HUD, and every screen as a window over the world. */
export function Game({ openConnect = false }: { openConnect?: boolean }) {
  const { address, chainId, isConnected } = useAccount();
  const lowPower = useLowPower();
  const { state, refetch } = useGameState(address, lowPower);
  const action = useGameAction(refetch);
  useE2EConnect();
  usePixelGame();

  const p = state?.player ?? null;
  const level = p?.level ?? 0;
  const tank = p?.tank ?? 0n;
  const rigsKey = state?.rigs.map((r) => `${r.owned}/${r.active}`).join(',') ?? '';
  const capacity =
    state === null ? 1n : fuelLineWad(Math.max(level, 1)) * BigInt(state.network.maxTankHours);
  // The tank gauge in whole percent, so the scene redraws only when it visibly moves.
  const fill = capacity === 0n ? 0 : Number((tank * 100n) / capacity) / 100;
  const running = tank > 0n;
  // Unrefined $MOHN per hour per DP (3 significant figures), for the floats over drilling rigs.
  const perHour =
    state === null || p === null || p.dp === 0n
      ? 0
      : Number(perHourEstimate(p.dp, state.network.activeDp, state.network.hourEmission)) / 1e18;
  const yieldPerDp =
    p === null || p.dp === 0n ? 0 : Number((perHour / Number(p.dp)).toPrecision(3));
  const model = useMemo(
    () => ({
      pads: state === null ? [] : scenePads(level, state.rigs, running ? 1n : 0n),
      tankFill: fill,
      yieldPerDp,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rigsKey stands for state.rigs
    [level, running, rigsKey, fill, yieldPerDp],
  );
  const [panel, setPanel] = useState<Panel | null>(null);
  const [named, setNamed] = useState(false);

  const wrongChain = isConnected && chainId !== gameChain.id;
  const onSelect = (hit: Hit) => {
    if (hit === 'tank') setPanel('fuel');
    else if (hit === 'market') setPanel('market');
    else if (hit === 'shack') setPanel('refinery');
    else if (hit === 'bore') setPanel('bore');
    else if (p !== null && p.registered) {
      const i = Number(hit.slice(4));
      setPanel(i < (model.pads.length || 0) ? 'rigs' : 'site');
    }
  };

  // Onboarding: wallet, sign-in (when the API is configured), a name, the first diesel.
  let onboarding: ReactNode = null;
  if (!isConnected) onboarding = <WalletStep autoOpen={openConnect} />;
  else if (wrongChain) onboarding = <ChainStep />;
  else if (state === null) return <LoadingScreen text="Reading the chain…" />;
  else if (address !== undefined && !named) {
    onboarding = <NameStep address={address} onDone={() => setNamed(true)} />;
  } else if (p === null || !p.registered) {
    onboarding = (
      <PxModal title="Open your site">
        <Steps steps={[...ONBOARDING_STEPS, 'Diesel']} at={3} />
        <FuelWindow state={state} action={action} first />
      </PxModal>
    );
  }

  return (
    <>
      <h1 className="sr-only">Mohonaut: your drill site</h1>
      <PixelWorld
        model={model}
        onSelect={onboarding === null ? onSelect : undefined}
        describe={(hit) => describeHit(hit, model.pads)}
        label={`Your drill site, level ${level}.`}
      />
      <Brand />
      {state !== null && onboarding === null && p !== null && <Hud state={state} open={setPanel} />}
      {onboarding}
      {state !== null && onboarding === null && panel !== null && address !== undefined && (
        <PanelWindow
          panel={panel}
          state={state}
          action={action}
          address={address}
          onClose={() => setPanel(null)}
          go={setPanel}
        />
      )}
      {state !== null && state.network.pausedUntil > state.at && (
        <p
          role="alert"
          className="px-panel fixed bottom-24 left-1/2 z-30 -translate-x-1/2 px-4 py-2 font-pixel"
        >
          Paused by the Guardian until {formatUtc(state.network.pausedUntil)}. Rigs and balances are
          safe.
        </p>
      )}
    </>
  );
}

// ------------------------------------------------------------------ onboarding

function WalletStep({ autoOpen }: { autoOpen: boolean }) {
  const { connectors, connect, isPending, error } = useConnect();
  // One entry per wallet name (browser wallets announce themselves; WalletConnect is separate).
  const list = connectors.filter(
    (c, i) => connectors.findIndex((d) => d.name === c.name) === i && c.id !== 'mock',
  );
  return (
    <PxModal title="Welcome">
      <Steps steps={ONBOARDING_STEPS} at={0} />
      <p className="mb-4 text-center text-lg">Connect your wallet to open your drill site.</p>
      <ul className="flex flex-col gap-2">
        {list.map((c) => (
          <li key={c.uid}>
            <button
              type="button"
              autoFocus={autoOpen && c === list[0]}
              disabled={isPending}
              onClick={() => connect({ connector: c })}
              className="px-btn px-btn-light flex w-full items-center gap-3 px-3 py-2 text-left text-lg"
            >
              {c.icon !== undefined ? (
                <img src={c.icon} alt="" width={28} height={28} className="h-7 w-7" />
              ) : (
                <PxIcon name="link" size={28} />
              )}
              {c.id === 'injected' ? 'Browser wallet' : c.name}
            </button>
          </li>
        ))}
      </ul>
      {error !== null && (
        <p className="mt-3 text-center text-sm text-[#ff7a6e]">{error.message.split('\n')[0]}</p>
      )}
      <p className="mt-4 text-center text-sm text-concrete">
        Connecting is free. The game never asks to approve token spending.
      </p>
    </PxModal>
  );
}

function ChainStep() {
  const { switchChain, isPending } = useSwitchChain();
  const { disconnect } = useDisconnect();
  return (
    <PxModal title="Wrong network">
      <p className="mb-4 text-center">Mohonaut runs on {gameChain.name}.</p>
      <PxButton
        className="w-full"
        busy={isPending}
        onClick={() => switchChain({ chainId: gameChain.id })}
      >
        Switch to {gameChain.name}
      </PxButton>
      <PxButton variant="light" className="mt-3 w-full" onClick={() => disconnect()}>
        Use another wallet
      </PxButton>
    </PxModal>
  );
}

/** Sign in (when the API is up) and name the site; the name is shown on boards and cards. */
function NameStep({ address, onDone }: { address: Address; onDone: () => void }) {
  const { me, loading } = useMe();
  const client = useQueryClient();
  const { signMessageAsync } = useSignMessage();
  const { chainId } = useAccount();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const known = apiEnabled ? (me?.displayName ?? null) : localName(address);
  if (known !== null && known !== '') {
    // Named before: straight to the site.
    queueMicrotask(onDone);
    return null;
  }
  if (apiEnabled && loading) return <LoadingScreen text="Checking your sign-in…" />;

  if (apiEnabled && me === null) {
    const signIn = async () => {
      setBusy(true);
      setErr(null);
      try {
        const nonce = await siweAdapter.getNonce();
        const message = await siweAdapter.createMessage({
          nonce,
          address,
          chainId: chainId ?? gameChain.id,
        });
        const signature = await signMessageAsync({ message });
        const ok = await siweAdapter.verify({ message, signature });
        if (!ok) throw new Error('The sign-in was not accepted. Try again.');
        await client.invalidateQueries({ queryKey: ME_KEY });
      } catch (e) {
        setErr(
          e instanceof Error ? (e.message.split('\n')[0] ?? 'Sign-in failed') : 'Sign-in failed',
        );
      } finally {
        setBusy(false);
      }
    };
    return (
      <PxModal title="Sign in">
        <Steps steps={ONBOARDING_STEPS} at={1} />
        <p className="mb-4 text-center">
          Sign a message to log in. It is free, costs no gas and cannot move funds.
        </p>
        <PxButton className="w-full" busy={busy} onClick={() => void signIn()}>
          Sign in
        </PxButton>
        {err !== null && <p className="mt-3 text-center text-sm text-[#ff7a6e]">{err}</p>}
      </PxModal>
    );
  }

  const save = async () => {
    setErr(null);
    if (!NAME_RE.test(name)) {
      setErr('3-20 letters, digits or _.');
      return;
    }
    setBusy(true);
    try {
      if (apiEnabled) {
        await api.setName(name);
        await client.invalidateQueries({ queryKey: ME_KEY });
      } else {
        window.localStorage.setItem(localNameKey(address), name);
      }
      onDone();
    } catch (e) {
      setErr(apiMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PxModal title="Name your site">
      <Steps steps={ONBOARDING_STEPS} at={2} />
      <p className="mb-3 text-center">
        {apiEnabled ? 'Your site carries your name on the boards.' : 'Give your drill site a name.'}
      </p>
      <label className="block">
        <span className="text-sm tracking-widest uppercase">Site name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
          maxLength={20}
          placeholder="Your driller name"
          className="px-input mt-1 block w-full px-3 py-2 text-lg"
        />
      </label>
      <PxButton className="mt-4 w-full" busy={busy} onClick={() => void save()}>
        Enter my site
      </PxButton>
      {err !== null && <p className="mt-3 text-center text-sm text-[#ff7a6e]">{err}</p>}
      <p className="mt-3 text-center text-sm text-concrete">You can change it later.</p>
    </PxModal>
  );
}

// ------------------------------------------------------------------ windows

function PanelWindow({
  panel,
  state,
  action,
  address,
  onClose,
  go,
}: {
  panel: Panel;
  state: GameState;
  action: Action;
  address: Address;
  onClose: () => void;
  go: (p: Panel) => void;
}) {
  const titles: Record<Panel, string> = {
    fuel: 'Diesel tank',
    market: 'Equipment market',
    rigs: 'My rigs',
    refinery: 'Refinery',
    site: 'Expand your site',
    bore: 'World Bore',
    crew: 'Crew',
    board: 'Leaderboard',
    survey: 'Daily survey',
    profile: 'Profile & invites',
  };
  const n = state.network;
  const depth = millimetres(n.emitted);
  const { current } = stratumAt(depth);
  let body: ReactNode;
  if (panel === 'fuel') body = <FuelWindow state={state} action={action} first={false} />;
  else if (panel === 'market') body = <MarketWindow state={state} action={action} />;
  else if (panel === 'rigs')
    body = <RigsWindow state={state} action={action} openMarket={() => go('market')} />;
  else if (panel === 'refinery') body = <RefineryWindow state={state} action={action} />;
  else if (panel === 'site') body = <SiteWindow state={state} action={action} />;
  else if (panel === 'crew') body = <SignedIn>{(me) => <CrewPanel me={me} />}</SignedIn>;
  else if (panel === 'board') body = <SeasonsPanel address={address} />;
  else if (panel === 'survey') body = <SignedIn>{() => <SurveyPanel now={state.at} />}</SignedIn>;
  else if (panel === 'profile')
    body = <SignedIn>{(me) => <ProfilePanel me={me} address={address} />}</SignedIn>;
  else
    body = (
      <div className="text-center">
        <p className="text-4xl font-bold">{formatDepth(depth)}</p>
        <p className="mt-2">
          Stratum {current.numeral} — {current.name}
        </p>
        <p className="mt-4 text-concrete">
          Every driller cores this one shared bore. It deepens as $MOHN is mined, and the rock gets
          harder the deeper it goes.
        </p>
      </div>
    );
  return (
    <PxModal title={titles[panel]} onClose={onClose} wide={panel === 'market' || panel === 'rigs'}>
      <div className="game-panel">{body}</div>
    </PxModal>
  );
}
