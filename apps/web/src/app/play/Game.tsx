'use client';

import { fuelLineWad, millimetres } from '@mohonaut/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Address } from 'viem';
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { useE2EConnect } from '../../game/e2e';
import { gameChain } from '../../game/network';
import { decorFor } from '../../game/pixel/decor';
import { ForemanMo } from '../../game/pixel/ForemanMo';
import { PixelWorld } from '../../game/pixel/PixelWorld';
import type { Hit } from '../../game/pixel/world';
import { describeHit, scenePads, yardWords } from '../../game/play';
import { useGameAction, useResumeTx } from '../../game/actions';
import { useSignIn } from '../../game/signin';
import { perHourEstimate } from '../../game/derive';
import type { Action } from '../../game/actions';
import { useGameState } from '../../game/state';
import type { GameState } from '../../game/state';
import { formatUtc } from '../../lib/format';
import { useLowPower } from '../../lib/power';
import { api, apiEnabled, apiMessage } from '../../social/api';
import { ME_KEY, useMe } from '../../social/session';
import { CrewPanel, ProfilePanel, SeasonsPanel, SignedIn, SurveyPanel } from '../../social/panels';
import { BadgeNotice } from './BadgeNotice';
import { MilestoneNotice } from './MilestoneNotice';
import { BoreWindow } from './BoreWindow';
import { Guide } from './Guide';
import { HelpWindow } from './HelpWindow';
import { Hud } from './Hud';
import { PriceHistory } from './PriceHistory';
import { ShiftReportNotice } from './ShiftReport';
import { WindowBoundary } from './WindowBoundary';
import { StratumNotice } from './StratumNotice';
import type { Panel } from './Hud';
import { PxButton, PxIcon, PxModal, Steps, usePixelGame } from './px';
import { useRigQuote } from '../../game/quote';
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
  const { state, refetch, offline } = useGameState(address, lowPower);
  const ethBalance = useBalance({ address, query: { refetchInterval: 12_000 } }).data?.value;
  const action = useGameAction(refetch);
  useResumeTx(refetch);
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
  const burn = p?.burn ?? 0n;
  // Less than half a day of diesel: the tank's lamp blinks red.
  const tankLow = p !== null && p.registered && burn > 0n && tank < burn * 12n;
  // Unrefined $MOHN per hour per DP (3 significant figures), for the floats over drilling rigs.
  const perHour =
    state === null || p === null || p.dp === 0n
      ? 0
      : Number(perHourEstimate(p.dp, state.network.activeDp, state.network.hourEmission)) / 1e18;
  const yieldPerDp =
    p === null || p.dp === 0n ? 0 : Number((perHour / Number(p.dp)).toPrecision(3));
  // From the public profile: completed Core Collection sets put their decor on the site,
  // and the crew's tag flies on the shack's flagpole.
  const profile = useQuery({
    queryKey: ['profile', address],
    queryFn: () => api.profile(address as Address),
    enabled: apiEnabled && address !== undefined,
    staleTime: 300_000,
    retry: false,
  }).data;
  const decorKey = (profile?.collection.completedSets ?? []).join(',');
  const crewTag = profile?.crew?.tag;
  const plaqueKey = (profile?.plaques ?? []).map((p) => p.rank).join(',');
  const model = useMemo(
    () => ({
      pads: state === null ? [] : scenePads(level, state.rigs, running ? 1n : 0n),
      tankFill: fill,
      tankLow,
      yieldPerDp,
      decor: decorFor(decorKey === '' ? [] : decorKey.split(',')),
      ...(crewTag === undefined ? {} : { crewTag }),
      ...(plaqueKey === '' ? {} : { plaques: plaqueKey.split(',').map(Number) }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rigsKey stands for state.rigs
    [level, running, rigsKey, fill, yieldPerDp, tankLow, decorKey, crewTag, plaqueKey],
  );
  const [panel, setPanel] = useState<Panel | null>(null);
  const [named, setNamed] = useState(false);
  const { me } = useMe();
  // Named before (on the API, or on this device without it): straight to the site.
  const known =
    address === undefined ? null : apiEnabled ? (me?.displayName ?? null) : localName(address);

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
  else if (state === null) {
    if (!offline) return <LoadingScreen text="Reading the chain…" />;
    onboarding = (
      <PxModal title="No signal">
        <div className="flex items-center gap-3">
          <ForemanMo scale={3} label="Foreman Mo" />
          <p>
            Can&apos;t reach {gameChain.name} right now. Your site is safe on-chain; the game tries
            again every few seconds.
          </p>
        </div>
        <PxButton className="mt-4 w-full" onClick={refetch}>
          Try now
        </PxButton>
        <p className="mt-3 text-center text-sm">
          What we know is on the{' '}
          <a href="/status/" className="text-amber underline">
            status page
          </a>
          .
        </p>
      </PxModal>
    );
  } else if (address !== undefined && !named && (known === null || known === '')) {
    onboarding = <NameStep address={address} onDone={() => setNamed(true)} />;
  } else if (p === null || !p.registered) {
    onboarding = (
      <PxModal title="Open your site">
        <Steps steps={[...ONBOARDING_STEPS, 'Diesel']} at={3} />
        <FuelWindow state={state} action={action} first ethBalance={ethBalance} />
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
        label={`${siteSummary(level, model.pads)} ${yardWords(model)}`.trim()}
      />
      <Brand />
      {state !== null && onboarding === null && p !== null && <Hud state={state} open={setPanel} />}
      {state !== null && onboarding === null && panel === null && address !== undefined && (
        <Guide key={address} state={state} address={address} open={setPanel} />
      )}
      {state !== null && onboarding === null && panel === null && address !== undefined && (
        <ShiftReportNotice state={state} address={address} open={setPanel}>
          {/* A crossing comes first; a badge waits for it (one window at a time). */}
          <StratumNotice depthMm={millimetres(state.network.emitted)} address={address}>
            <BadgeNotice key={address} address={address} held={profile?.badges.map((b) => b.id)}>
              <MilestoneNotice key={address} address={address} state={state} />
            </BadgeNotice>
          </StratumNotice>
        </ShiftReportNotice>
      )}
      {onboarding}
      {state !== null && onboarding === null && panel !== null && address !== undefined && (
        <PanelWindow
          panel={panel}
          state={state}
          action={action}
          address={address}
          onClose={() => setPanel(null)}
          go={setPanel}
          ethBalance={ethBalance}
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
      <div className="mb-4 flex items-center gap-3">
        <ForemanMo scale={2} label="Foreman Mo, the site foreman" />
        <p className="text-lg">Connect your wallet and I will show you to your drill site.</p>
      </div>
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
                <PxIcon name="link" />
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
  const login = useSignIn();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (apiEnabled && loading) return <LoadingScreen text="Checking your sign-in…" />;

  if (apiEnabled && me === null) {
    return (
      <PxModal title="Sign in">
        <Steps steps={ONBOARDING_STEPS} at={1} />
        <p className="mb-4 text-center">
          Sign a message to log in. It is free, costs no gas and cannot move funds.
        </p>
        <PxButton className="w-full" busy={login.busy} onClick={() => void login.signIn()}>
          Sign in
        </PxButton>
        {login.error !== null && (
          <p className="mt-3 text-center text-sm text-[#ff7a6e]">{login.error}</p>
        )}
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
  ethBalance,
}: {
  panel: Panel;
  state: GameState;
  action: Action;
  address: Address;
  onClose: () => void;
  go: (p: Panel) => void;
  ethBalance: bigint | undefined;
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
    help: 'How to play',
  };
  const n = state.network;
  const depth = millimetres(n.emitted);
  let body: ReactNode;
  if (panel === 'fuel')
    body = <FuelWindow state={state} action={action} first={false} ethBalance={ethBalance} />;
  else if (panel === 'market')
    body = (
      <MarketWindow
        state={state}
        action={action}
        useQuote={useRigQuote}
        openSite={() => go('site')}
        history={<PriceHistory />}
      />
    );
  else if (panel === 'rigs')
    body = (
      <RigsWindow
        state={state}
        action={action}
        openMarket={() => go('market')}
        openSite={() => go('site')}
      />
    );
  else if (panel === 'refinery')
    body = <RefineryWindow state={state} action={action} address={address} />;
  else if (panel === 'site') body = <SiteWindow state={state} action={action} />;
  else if (panel === 'crew') body = <SignedIn>{(me) => <CrewPanel me={me} />}</SignedIn>;
  else if (panel === 'board') body = <SeasonsPanel address={address} />;
  else if (panel === 'survey')
    body = <SignedIn>{() => <SurveyPanel now={state.at} address={address} />}</SignedIn>;
  else if (panel === 'profile')
    body = <SignedIn>{(me) => <ProfilePanel me={me} address={address} />}</SignedIn>;
  else if (panel === 'help') body = <HelpWindow />;
  else body = <BoreWindow depthMm={depth} />;
  return (
    <PxModal
      title={titles[panel]}
      onClose={onClose}
      wide={['market', 'rigs', 'board', 'crew', 'profile', 'help'].includes(panel)}
    >
      <WindowBoundary key={panel} onClose={onClose}>
        {body}
      </WindowBoundary>
    </PxModal>
  );
}

/** The site in words, for screen readers (the canvas is a picture). */
function siteSummary(level: number, pads: { typeId: number | null; running: boolean }[]): string {
  if (level === 0) return 'A drill site at night, not opened yet.';
  const rigs = pads.filter((p) => p.typeId !== null);
  const drilling = rigs.filter((p) => p.running).length;
  const free = pads.length - rigs.length;
  return `Your drill site, level ${level}: ${drilling} rig${drilling === 1 ? '' : 's'} drilling, ${rigs.length - drilling} stopped, ${free} free pad${free === 1 ? '' : 's'}.`;
}
