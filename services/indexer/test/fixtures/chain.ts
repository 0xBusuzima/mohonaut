import { encodeAbiParameters, encodeEventTopics, getAbiItem, getAddress } from 'viem';
import type { Abi, AbiEvent, Address, Hex } from 'viem';
import type { LogFilter, LogSource, RawLog } from '../../src/source.js';

/** Encodes a log exactly as the EVM would (indexed arguments in topics, the rest in data). */
function encodeLog(
  abi: Abi,
  eventName: string,
  args: Record<string, unknown>,
): { topics: Hex[]; data: Hex } {
  const item = getAbiItem({ abi, name: eventName } as never) as AbiEvent;
  const topics = encodeEventTopics({ abi, eventName, args } as never) as Hex[];
  const nonIndexed = item.inputs.filter((i) => i.indexed !== true);
  const data = encodeAbiParameters(nonIndexed, nonIndexed.map((i) => args[i.name ?? '']) as never);
  return { topics, data };
}

/** An in-memory chain: one block per transaction, logs filtered like eth_getLogs. */
export class FakeChain implements LogSource {
  readonly allLogs: RawLog[] = [];
  private block: bigint;
  private readonly times = new Map<bigint, bigint>();
  /** When set, getLogs over more than this many blocks throws (like a provider limit). */
  rangeLimit: bigint | null = null;
  rpcCalls = 0;

  constructor(
    readonly id: number,
    startBlock: bigint,
    private readonly poolManagerAddress: Address,
  ) {
    this.block = startBlock - 1n;
  }

  /** A transaction at `time` emitting `logs` in order. */
  tx(
    time: bigint,
    logs: { address: Address; abi: Abi; event: string; args: Record<string, unknown> }[],
  ): void {
    this.block += 1n;
    this.times.set(this.block, time);
    logs.forEach((l, i) => {
      const { topics, data } = encodeLog(l.abi, l.event, l.args);
      this.allLogs.push({
        blockNumber: this.block,
        logIndex: i,
        txHash: `0x${this.block.toString(16).padStart(64, '0')}`,
        address: getAddress(l.address),
        topics,
        data,
        // Some logs carry their block time, some do not (fetched per block).
        blockTime: this.block % 2n === 0n ? time : null,
      });
    });
  }

  async chainId(): Promise<number> {
    return this.id;
  }

  async head(): Promise<bigint> {
    this.rpcCalls += 1;
    return this.block;
  }

  async logs(filter: LogFilter, from: bigint, to: bigint): Promise<RawLog[]> {
    this.rpcCalls += 1;
    if (this.rangeLimit !== null && to - from + 1n > this.rangeLimit) {
      throw new Error('block range too large');
    }
    const addresses = new Set(filter.address);
    return this.allLogs
      .filter((l) => l.blockNumber >= from && l.blockNumber <= to && addresses.has(l.address))
      .filter((l) =>
        (filter.topics ?? []).every((t, i) => {
          if (t === null) return true;
          const topic = l.topics[i];
          return Array.isArray(t) ? topic !== undefined && t.includes(topic) : topic === t;
        }),
      )
      .map((l) => ({ ...l }));
  }

  async blockTime(block: bigint): Promise<bigint> {
    this.rpcCalls += 1;
    const t = this.times.get(block);
    if (t === undefined) throw new Error(`no block ${block}`);
    return t;
  }

  async poolManager(): Promise<Address> {
    return this.poolManagerAddress;
  }
}
