'use client';

import { miningCoreAbi, mohnTokenAbi } from '@mohonaut/sdk';
import { multicall3Abi } from 'viem';
import type { Address } from 'viem';
import { useReadContracts } from 'wagmi';
import { emittedAt } from './derive';
import { GAME } from './network';

const core = { address: GAME.MiningCore, abi: miningCoreAbi } as const;
const token = { address: GAME.MohnToken, abi: mohnTokenAbi } as const;
const REFRESH_MS = 12_000;
const LOW_POWER_REFRESH_MS = 30_000;
const MAX_TYPES = 16; // the contract caps a generation at 8 types; two generations fit
const LITRE_QUOTE_WEI = 10n ** 18n;
const TYPES_AT = 10; // index of the first machineType read

export interface RigType {
  id: number;
  dp: bigint;
  burn: bigint;
  premiumBps: number;
  minLevel: number;
  generation: number;
  /** Price of one rig right now (MOHN wei). */
  price: bigint;
  owned: number;
  active: number;
}

interface RefineItem {
  id: number;
  amount: bigint;
  readyAt: number;
}

export interface GameState {
  /** Unix seconds of the read. */
  at: number;
  network: {
    activeDp: bigint;
    hourEmission: bigint;
    /** All $MOHN emitted so far, as of `at` (World Bore depth = emitted / 1,000 $MOHN). */
    emitted: bigint;
    pausedUntil: number;
    marketOpened: boolean;
    marketOpenTime: number;
    genesisTime: number;
    litresPerEth: bigint | null; // null while the oracle is stale or invalid
    maxTankHours: number;
  };
  rigs: RigType[];
  player: null | {
    registered: boolean;
    level: number;
    dp: bigint;
    burn: bigint;
    tank: bigint;
    pending: bigint;
    scrapCredit: bigint;
    padsUsed: number;
    walletMohn: bigint;
    siteUpgradePrice: bigint | null;
    refines: RefineItem[];
  };
}

/** Multicall3, at the same address on every EVM chain (and on the e2e anvil). */
const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';

type Call = {
  address: Address;
  abi: typeof miningCoreAbi | typeof mohnTokenAbi | typeof multicall3Abi;
  functionName: string;
  args?: readonly unknown[];
};

function ok<T>(r: { status: string; result?: unknown } | undefined): T | undefined {
  return r?.status === 'success' ? (r.result as T) : undefined;
}

/** Everything the play screen shows, read in one multicall, every 12 s (30 s in low-power mode). */
export function useGameState(
  player: Address | undefined,
  lowPower = false,
): {
  state: GameState | null;
  refetch: () => void;
  /** The last read failed (no RPC, or the network's own numbers missing): `state` is null. */
  offline: boolean;
} {
  const types = Array.from({ length: MAX_TYPES }, (_, i) => i);
  const calls: Call[] = [
    { ...core, functionName: 'activeDp' },
    { ...core, functionName: 'hourEmission' },
    { ...core, functionName: 'emitted' },
    { ...core, functionName: 'pausedUntil' },
    { ...core, functionName: 'marketOpened' },
    { ...core, functionName: 'marketOpenTime' },
    { ...core, functionName: 'genesisTime' },
    { ...core, functionName: 'quoteLitres', args: [LITRE_QUOTE_WEI] },
    { ...core, functionName: 'machineTypeCount' },
    { ...core, functionName: 'maxTankHours' },
    ...types.map((i) => ({ ...core, functionName: 'machineType', args: [BigInt(i)] })),
    ...types.map((i) => ({ ...core, functionName: 'quoteMachines', args: [BigInt(i), 1] })),
    // Last, so the indices above stay put: the last checkpoint and the chain's own clock.
    { ...core, functionName: 'lastUpdate' },
    { address: MULTICALL3, abi: multicall3Abi, functionName: 'getCurrentBlockTimestamp' },
  ];
  const playerCalls: Call[] =
    player === undefined
      ? []
      : [
          { ...core, functionName: 'siteOf', args: [player] },
          { ...core, functionName: 'tankOf', args: [player] },
          { ...core, functionName: 'pendingOf', args: [player] },
          { ...core, functionName: 'refineRequestCount', args: [player] },
          { ...token, functionName: 'balanceOf', args: [player] },
          ...types.map((i) => ({ ...core, functionName: 'rigsOf', args: [player, BigInt(i)] })),
        ];
  const read = useReadContracts({
    contracts: [...calls, ...playerCalls] as never,
    query: { refetchInterval: lowPower ? LOW_POWER_REFRESH_MS : REFRESH_MS },
  });
  const r = read.data as ({ status: string; result?: unknown } | undefined)[] | undefined;

  // Second stage: the site upgrade price and the last refine requests depend on the first read.
  const site =
    r === undefined || player === undefined ? undefined : ok<{ level: number }>(r[calls.length]);
  const count =
    r === undefined || player === undefined ? 0 : Number(ok<bigint>(r[calls.length + 3]) ?? 0n);
  const ids = Array.from({ length: Math.min(count, 10) }, (_, i) => count - 1 - i);
  const second = useReadContracts({
    contracts: [
      ...(site !== undefined && site.level > 0 && site.level < 30
        ? [{ ...core, functionName: 'quoteSiteUpgrade', args: [site.level] }]
        : []),
      ...ids.map((id) => ({ ...core, functionName: 'refineRequest', args: [player, BigInt(id)] })),
    ] as never,
    query: {
      enabled: player !== undefined && r !== undefined,
      refetchInterval: lowPower ? LOW_POWER_REFRESH_MS : REFRESH_MS,
    },
  });

  const refetch = () => {
    void read.refetch();
    void second.refetch();
  };
  // With the RPC down the multicall falls back to single calls that each fail, and the "data"
  // is a list of failures: without the network's own numbers there is no state to show.
  const offline = read.isError || (r !== undefined && r[0]?.status !== 'success');
  if (r === undefined || offline) return { state: null, refetch, offline };

  const typeCount = Number(ok<bigint>(r[8]) ?? 0n);
  const rigs: RigType[] = [];
  for (let i = 0; i < Math.min(typeCount, MAX_TYPES); i++) {
    const m = ok<{
      dp: number;
      premiumBps: number;
      minLevel: number;
      generation: number;
      burn: bigint;
    }>(r[TYPES_AT + i]);
    if (m === undefined) continue;
    const held =
      player === undefined
        ? undefined
        : ok<{ owned: number; active: number }>(r[calls.length + 5 + i]);
    rigs.push({
      id: i,
      dp: BigInt(m.dp),
      burn: m.burn,
      premiumBps: m.premiumBps,
      minLevel: m.minLevel,
      generation: m.generation,
      price: ok<bigint>(r[TYPES_AT + MAX_TYPES + i]) ?? 0n,
      owned: held?.owned ?? 0,
      active: held?.active ?? 0,
    });
  }

  let playerState: GameState['player'] = null;
  if (player !== undefined) {
    const s = ok<{
      registered: boolean;
      level: number;
      dp: bigint;
      burn: bigint;
      tank: bigint;
      rigs: number;
      scrapCredit: bigint;
    }>(r[calls.length]);
    const s2 = second.data as ({ status: string; result?: unknown } | undefined)[] | undefined;
    const hasUpgrade = s !== undefined && s.level > 0 && s.level < 30;
    const refines: RefineItem[] = [];
    ids.forEach((id, k) => {
      const q = ok<{ amount: bigint; readyAt: bigint }>(s2?.[(hasUpgrade ? 1 : 0) + k]);
      if (q !== undefined && q.amount > 0n)
        refines.push({ id, amount: q.amount, readyAt: Number(q.readyAt) });
    });
    playerState = {
      registered: s?.registered ?? false,
      level: s?.level ?? 0,
      dp: s?.dp ?? 0n,
      burn: s?.burn ?? 0n,
      tank: ok<bigint>(r[calls.length + 1]) ?? 0n,
      pending: ok<bigint>(r[calls.length + 2]) ?? 0n,
      scrapCredit: s?.scrapCredit ?? 0n,
      padsUsed: s?.rigs ?? 0,
      walletMohn: ok<bigint>(r[calls.length + 4]) ?? 0n,
      siteUpgradePrice: hasUpgrade ? (ok<bigint>(s2?.[0]) ?? null) : null,
      refines,
    };
  }

  const at = Math.floor(read.dataUpdatedAt / 1000);
  const activeDp = ok<bigint>(r[0]) ?? 0n;
  const hourEmission = ok<bigint>(r[1]) ?? 0n;
  const pausedUntil = Number(ok<bigint>(r[3]) ?? 0n);
  const genesisTime = Number(ok<bigint>(r[6]) ?? 0n);
  return {
    refetch,
    offline,
    state: {
      at,
      network: {
        activeDp,
        hourEmission,
        // The chain stores `emitted` at each checkpoint; brought forward to the read, like the
        // player's own unrefined balance, so the World Bore never lags the HUD.
        emitted: emittedAt({
          emitted: ok<bigint>(r[2]) ?? 0n,
          hourEmission,
          activeDp,
          lastUpdate: Number(ok<bigint>(r[calls.length - 2]) ?? 0n),
          pausedUntil,
          genesisTime,
          now: Number(ok<bigint>(r[calls.length - 1]) ?? BigInt(at)),
        }),
        pausedUntil,
        marketOpened: ok<boolean>(r[4]) ?? false,
        marketOpenTime: Number(ok<bigint>(r[5]) ?? 0n),
        genesisTime,
        litresPerEth: ok<bigint>(r[7]) ?? null,
        maxTankHours: Number(ok<bigint>(r[9]) ?? 720n),
      },
      rigs,
      player: playerState,
    },
  };
}
