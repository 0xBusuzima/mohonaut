import { liquidityManagerAbi } from '@mohonaut/sdk';
import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  hexToBigInt,
  hexToNumber,
  http,
  toHex,
} from 'viem';
import type { Address, Hex } from 'viem';
import type { Metrics } from './metrics.js';

export interface RawLog {
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
  address: Address;
  topics: Hex[];
  data: Hex;
  /** Block time when the node includes it in logs; otherwise null and fetched per block. */
  blockTime: bigint | null;
}

export interface LogFilter {
  address: Address[];
  /** Positional topic filter; null matches anything. */
  topics?: (Hex | Hex[] | null)[];
}

export interface LogSource {
  chainId(): Promise<number>;
  head(): Promise<bigint>;
  logs(filter: LogFilter, from: bigint, to: bigint): Promise<RawLog[]>;
  blockTime(block: bigint): Promise<bigint>;
  poolManager(liquidityManager: Address): Promise<Address>;
}

interface RpcLog {
  address: Hex;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  logIndex: Hex;
  transactionHash: Hex;
  blockTimestamp?: Hex;
  removed?: boolean;
}

/** JSON-RPC source; every request is counted in the metrics (method and compute units). */
export class RpcSource implements LogSource {
  private readonly client;

  constructor(
    url: string,
    private readonly metrics?: Metrics,
  ) {
    this.client = createPublicClient({ transport: http(url, { retryCount: 3, timeout: 30_000 }) });
  }

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    this.metrics?.rpcRequest(method);
    // Raw requests: viem's typed helpers drop fields such as blockTimestamp.
    return (await this.client.request({ method, params } as never)) as T;
  }

  async chainId(): Promise<number> {
    return hexToNumber(await this.call<Hex>('eth_chainId', []));
  }

  async head(): Promise<bigint> {
    return hexToBigInt(await this.call<Hex>('eth_blockNumber', []));
  }

  async logs(filter: LogFilter, from: bigint, to: bigint): Promise<RawLog[]> {
    const raw = await this.call<RpcLog[]>('eth_getLogs', [
      {
        address: filter.address,
        topics: filter.topics,
        fromBlock: toHex(from),
        toBlock: toHex(to),
      },
    ]);
    return raw
      .filter((l) => l.removed !== true)
      .map((l) => ({
        blockNumber: hexToBigInt(l.blockNumber),
        logIndex: hexToNumber(l.logIndex),
        txHash: l.transactionHash,
        address: getAddress(l.address),
        topics: l.topics,
        data: l.data,
        // Robinhood Chain's RPC returns blockTimestamp "0x0"; treat zero as missing.
        blockTime:
          l.blockTimestamp === undefined || hexToBigInt(l.blockTimestamp) === 0n
            ? null
            : hexToBigInt(l.blockTimestamp),
      }));
  }

  async blockTime(block: bigint): Promise<bigint> {
    const b = await this.call<{ timestamp: Hex } | null>('eth_getBlockByNumber', [
      toHex(block),
      false,
    ]);
    if (b === null) throw new Error(`block ${block} not found`);
    return hexToBigInt(b.timestamp);
  }

  async poolManager(liquidityManager: Address): Promise<Address> {
    const data = encodeFunctionData({ abi: liquidityManagerAbi, functionName: 'poolManager' });
    const result = await this.call<Hex>('eth_call', [{ to: liquidityManager, data }, 'latest']);
    return decodeFunctionResult({
      abi: liquidityManagerAbi,
      functionName: 'poolManager',
      data: result,
    });
  }
}
