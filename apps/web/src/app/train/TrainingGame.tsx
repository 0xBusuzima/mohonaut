'use client';

import { fuelLineWad, millimetres } from '@mohonaut/sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useToast } from '../../components/Toast';
import type { Action, ActionInput } from '../../game/actions';
import { cue } from '../../game/audio';
import { perHourEstimate } from '../../game/derive';
import { PixelWorld } from '../../game/pixel/PixelWorld';
import type { Hit } from '../../game/pixel/world';
import { describeHit, scenePads } from '../../game/play';
import type { QuoteHook } from '../../game/quote';
import {
  applyCall,
  newTraining,
  tick,
  trainingGameState,
  trainingRigCost,
} from '../../game/training';
import type { TrainingState } from '../../game/training';
import { useLowPower } from '../../lib/power';
import { trainingPost, xIntentUrl } from '../../social/share';
import { BoreWindow } from '../play/BoreWindow';
import { Guide } from '../play/Guide';
import { HelpWindow } from '../play/HelpWindow';
import { Hud } from '../play/Hud';
import type { Panel } from '../play/Hud';
import { PxButton, PxModal, usePixelGame } from '../play/px';
import { MarketWindow, RigsWindow } from '../play/RigCards';
import { Brand } from '../play/Shell';
import { FuelWindow, RefineryWindow, SiteWindow } from '../play/windows';

/** 60x: each real second is a simulated minute. */
const SPEED = 60;
const KEY = 'mohonaut.training';
/** Stands in for the player's address where the windows want one. */
const TRAINEE = '0x0000000000000000000000000000000000007a17';

type Saved = { base: number; state: TrainingState };

function save(v: Saved): void {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(v, (_, x: unknown) => (typeof x === 'bigint' ? `${x}n` : x)),
    );
  } catch {
    // Storage blocked: the training lasts until the page closes.
  }
}

function load(): Saved {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== null) {
      const saved = JSON.parse(raw, (_, x: unknown) =>
        typeof x === 'string' && /^-?\d+n$/.test(x) ? BigInt(x.slice(0, -1)) : x,
      ) as Saved;
      // Resume where the clock stopped: the simulated time carries on from now, so nothing
      // accrues for the time the page was closed (and the HUD counter does not jump ahead).
      return { base: Math.floor(Date.now() / 1000) - saved.state.t, state: saved.state };
    }
  } catch {
    // Unreadable: start over.
  }
  return { base: Math.floor(Date.now() / 1000), state: newTraining() };
}

/** The training site's batch price: the practice price list (no chain to ask). */
const trainingQuote: QuoteHook = (typeId, qty) => ({
  total: trainingRigCost(typeId, qty),
  exact: true,
});

const TITLES: Partial<Record<Panel, string>> = {
  fuel: 'Diesel tank',
  market: 'Equipment market',
  rigs: 'My rigs',
  refinery: 'Refinery',
  site: 'Expand your site',
  bore: 'World Bore',
  help: 'How to play',
};

/**
 * The training site (docs/09 §A): the whole game in the browser, no wallet, no chain, nothing
 * of value. The game's own world, HUD and windows run on a local simulation at 60x speed; the
 * progress stays on this device.
 */
export function TrainingGame() {
  usePixelGame();
  const toast = useToast();
  const lowPower = useLowPower();
  const [saved, setSaved] = useState(load);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [about, setAbout] = useState(false);
  const { base, state: sim } = saved;

  // The clock: a simulated minute every second (every 5 in low-power mode, 5 minutes at a time).
  useEffect(() => {
    const step = lowPower ? 5 : 1;
    const id = window.setInterval(() => {
      setSaved((v) => ({ ...v, state: tick(v.state, SPEED * step) }));
    }, step * 1000);
    return () => window.clearInterval(id);
  }, [lowPower]);
  useEffect(() => save(saved), [saved]);
  // The latest state for actions: a click must not undo a clock tick that just landed.
  const latest = useRef(saved.state);
  useEffect(() => {
    latest.current = saved.state;
  }, [saved]);

  const game = useMemo(() => trainingGameState(sim, base), [sim, base]);
  const p = game.player;
  const fuelled = sim.tank > 0n;
  const rigsKey = sim.rigs.map((r) => `${r.owned}/${r.active}`).join(',');
  const capacity = fuelLineWad(sim.level) * BigInt(game.network.maxTankHours);
  const fill = Number((sim.tank * 100n) / capacity) / 100;
  // Less than half a day of diesel: the tank's lamp blinks red.
  const tankLow = (p?.burn ?? 0n) > 0n && sim.tank < (p?.burn ?? 0n) * 12n;
  const perHour =
    p === null || p.dp === 0n
      ? 0
      : Number(perHourEstimate(p.dp, game.network.activeDp, game.network.hourEmission)) / 1e18;
  // A simulated hour passes every real minute, so the floats over the rigs run 60x too.
  const yieldPerDp =
    p === null || p.dp === 0n ? 0 : Number(((perHour / Number(p.dp)) * SPEED).toPrecision(3));
  const model = useMemo(
    () => ({
      pads: scenePads(
        sim.level,
        sim.rigs.map((r, id) => ({ id, ...r })),
        fuelled ? 1n : 0n,
      ),
      tankFill: fill,
      tankLow,
      yieldPerDp,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rigsKey stands for sim.rigs
    [sim.level, rigsKey, fuelled, fill, yieldPerDp, tankLow],
  );

  const action: Action = {
    busy: null,
    run: (input: ActionInput) => {
      const result = applyCall(latest.current, input);
      if (result.error !== null) {
        toast({ tone: 'warning', title: 'Not done', body: result.error });
        cue('error');
        return Promise.resolve(false);
      }
      setSaved((v) => {
        const next = applyCall(v.state, input);
        return next.error === null ? { ...v, state: next.state } : v;
      });
      toast({ tone: 'success', title: input.done });
      return Promise.resolve(true);
    },
  };

  const onSelect = (hit: Hit) => {
    if (hit === 'tank') setPanel('fuel');
    else if (hit === 'market') setPanel('market');
    else if (hit === 'shack') setPanel('refinery');
    else if (hit === 'bore') setPanel('bore');
    else setPanel(Number(hit.slice(4)) < model.pads.length ? 'rigs' : 'site');
  };

  let body: ReactNode = null;
  if (panel === 'fuel')
    body = <FuelWindow state={game} action={action} first={false} ethBalance={sim.eth} />;
  else if (panel === 'market')
    body = <MarketWindow state={game} action={action} useQuote={trainingQuote} />;
  else if (panel === 'rigs')
    body = <RigsWindow state={game} action={action} openMarket={() => setPanel('market')} />;
  else if (panel === 'refinery')
    body = <RefineryWindow state={game} action={action} address={TRAINEE} />;
  else if (panel === 'site') body = <SiteWindow state={game} action={action} />;
  else if (panel === 'bore') body = <BoreWindow depthMm={millimetres(sim.emitted)} />;
  else if (panel === 'help') body = <HelpWindow />;

  return (
    <>
      <h1 className="sr-only">Mohonaut training site: a simulated drill site</h1>
      <PixelWorld
        model={model}
        onSelect={panel === null ? onSelect : undefined}
        describe={(hit) => describeHit(hit, model.pads)}
        label={`Training site, level ${sim.level}: a simulation, nothing of value.`}
      />
      <Brand />
      <Hud state={game} open={setPanel} training />
      <div className="px-dark fixed top-[7.6rem] right-3 z-20 flex max-w-[16rem] md:max-w-xs flex-col gap-2 p-2 font-pixel text-sm md:top-[9.4rem]">
        <button
          type="button"
          aria-expanded={about}
          className="text-left text-amber uppercase md:hidden"
          onClick={() => setAbout(!about)}
        >
          Simulation {about ? '▴' : '▾'}
        </button>
        <p className="hidden text-amber uppercase md:block">Training site · simulation</p>
        <div className={`${about ? 'flex' : 'hidden'} flex-col gap-2 md:flex`}>
          <p className="text-concrete">
            60× speed, practice ETH and practice $MOHN with no value, illustrative prices. Nothing
            here touches a wallet or the chain.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/play/" className="px-btn px-btn-primary px-2 py-1">
              Play for real
            </a>
            <a
              href={xIntentUrl(
                trainingPost({
                  level: sim.level,
                  rigs: sim.rigs.reduce((n, r) => n + r.owned, 0),
                }),
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="px-btn px-btn-light px-2 py-1"
            >
              Share
            </a>
            <PxButton
              variant="dark"
              className="!px-2 !py-1 !text-sm"
              onClick={() =>
                setSaved({ base: Math.floor(Date.now() / 1000), state: newTraining() })
              }
            >
              Start over
            </PxButton>
          </div>
        </div>
      </div>
      {panel === null && <Guide state={game} address="training" open={setPanel} social={false} />}
      {panel !== null && body !== null && (
        <PxModal
          title={TITLES[panel] ?? ''}
          onClose={() => setPanel(null)}
          wide={panel === 'market' || panel === 'rigs' || panel === 'help'}
        >
          {body}
        </PxModal>
      )}
    </>
  );
}
