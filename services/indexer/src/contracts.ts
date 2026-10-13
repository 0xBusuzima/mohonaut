import {
  buybackBurnerAbi,
  liquidityManagerAbi,
  miningCoreAbi,
  mohnPoolKey,
  mohnTokenAbi,
  poolId,
  poolManagerEventsAbi,
  revenueRouterAbi,
  timelockControllerAbi,
} from '@mohonaut/sdk';
import { decodeEventLog, decodeFunctionData, encodeEventTopics, zeroAddress } from 'viem';
import type { Abi, Address, Hex } from 'viem';
import type { Deployment } from './config.js';
import type { LogFilter, RawLog } from './source.js';

const ABIS = {
  MiningCore: miningCoreAbi,
  MohnToken: mohnTokenAbi,
  RevenueRouter: revenueRouterAbi,
  BuybackBurner: buybackBurnerAbi,
  LiquidityManager: liquidityManagerAbi,
  ParamsTimelock: timelockControllerAbi,
  UpgradeTimelock: timelockControllerAbi,
  PoolManager: poolManagerEventsAbi,
} as const satisfies Record<string, Abi>;

export type ContractName = keyof typeof ABIS;

/** Our own contracts: every log they emit is indexed (the "core" stream). */
const CORE_CONTRACTS = [
  'MiningCore',
  'MohnToken',
  'RevenueRouter',
  'BuybackBurner',
  'LiquidityManager',
  'ParamsTimelock',
  'UpgradeTimelock',
] as const satisfies readonly ContractName[];

export interface Stream {
  name: 'core' | 'pool';
  filter: LogFilter;
  /** Poll on every n-th tick. */
  every: number;
}

export interface ContractSet {
  deployment: Deployment;
  poolManager: Address;
  byAddress: ReadonlyMap<Address, ContractName>;
  /** Addresses whose MOHN balance is protocol-owned (excluded from holder distributions). */
  protocolAddresses: ReadonlySet<Address>;
  streams: Stream[];
  /** MOHN transfers and mints at or above this (wei) raise a warning alert. */
  largeTransferWei: bigint;
}

/** Default large-transfer alert threshold: 50,000 MOHN. */
const DEFAULT_LARGE_TRANSFER_WEI = 50_000n * 10n ** 18n;

export function contractSet(
  deployment: Deployment,
  poolManager: Address,
  poolPollEvery: number,
  largeTransferWei: bigint = DEFAULT_LARGE_TRANSFER_WEI,
): ContractSet {
  const byAddress = new Map<Address, ContractName>();
  for (const name of CORE_CONTRACTS) byAddress.set(deployment[name], name);
  byAddress.set(poolManager, 'PoolManager');
  const id = poolId(mohnPoolKey(deployment.MohnToken, deployment.LiquidityManager));
  return {
    deployment,
    poolManager,
    byAddress,
    protocolAddresses: new Set<Address>([
      zeroAddress,
      poolManager,
      ...CORE_CONTRACTS.map((n) => deployment[n]),
    ]),
    largeTransferWei,
    streams: [
      { name: 'core', filter: { address: CORE_CONTRACTS.map((n) => deployment[n]) }, every: 1 },
      {
        name: 'pool',
        filter: {
          address: [poolManager],
          topics: encodeEventTopics({ abi: poolManagerEventsAbi, eventName: 'Swap', args: { id } }),
        },
        every: poolPollEvery,
      },
    ],
  };
}

export interface IndexedEvent {
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
  blockTime: bigint;
  address: Address;
  contract: ContractName;
  /** 'Unknown' when the log does not match the contract's ABI. */
  event: string;
  args: Record<string, unknown>;
  topics: Hex[];
  data: Hex;
}

export function decodeLog(
  log: RawLog,
  blockTime: bigint,
  byAddress: ReadonlyMap<Address, ContractName>,
): IndexedEvent | null {
  const contract = byAddress.get(log.address);
  if (contract === undefined) return null;
  let event = 'Unknown';
  let args: Record<string, unknown> = {};
  try {
    const decoded = decodeEventLog({
      abi: ABIS[contract] as Abi,
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data,
    });
    event = decoded.eventName ?? 'Unknown';
    args = (decoded.args ?? {}) as Record<string, unknown>;
  } catch {
    // Kept raw; projections ignore it.
  }
  return {
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    txHash: log.txHash,
    blockTime,
    address: log.address,
    contract,
    event,
    args,
    topics: log.topics,
    data: log.data,
  };
}

/** Function name and arguments of a timelock call, if the target is one of our contracts. */
export function decodeCall(
  target: Address,
  data: Hex,
  byAddress: ReadonlyMap<Address, ContractName>,
): { fn: string; args: unknown[] } | null {
  const contract = byAddress.get(target);
  if (contract === undefined || contract === 'PoolManager') return null;
  try {
    const decoded = decodeFunctionData({ abi: ABIS[contract] as Abi, data });
    return { fn: decoded.functionName, args: [...(decoded.args ?? [])] };
  } catch {
    return null;
  }
}

/** JSON-safe copy (bigint → decimal string). */
export function toJson(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return value;
}
