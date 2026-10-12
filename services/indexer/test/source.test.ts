import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Metrics } from '../src/metrics.js';
import { RpcSource } from '../src/source.js';

const LOG = {
  address: '0xa59335238d87c192d0f8af7cc237e941bfb2ad9b',
  topics: ['0x' + '11'.repeat(32)],
  data: '0x',
  blockNumber: '0x7f01b72',
  logIndex: '0x2',
  transactionHash: '0x' + '22'.repeat(32),
};

const calls: string[] = [];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk: Buffer) => (body += chunk.toString()));
  req.on('end', () => {
    const { id, method } = JSON.parse(body) as { id: number; method: string };
    calls.push(method);
    const result: unknown = {
      eth_chainId: '0xb626',
      eth_blockNumber: '0x7f05afe',
      // As Robinhood Chain's RPC answers: blockTimestamp present but zero, plus a removed log.
      eth_getLogs: [
        { ...LOG, blockTimestamp: '0x0' },
        { ...LOG, logIndex: '0x3', blockTimestamp: '0x6aca0000' },
        { ...LOG, logIndex: '0x4', removed: true },
      ],
      eth_getBlockByNumber: { timestamp: '0x6acb0000' },
    }[method];
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  });
});

let source: RpcSource;
const metrics = new Metrics();

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  source = new RpcSource(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, metrics);
});

afterAll(() => {
  server.close();
});

describe('RpcSource', () => {
  it('maps eth_getLogs, treating a zero blockTimestamp as missing and dropping removed logs', async () => {
    expect(await source.chainId()).toBe(46630);
    expect(await source.head()).toBe(0x7f05afen);
    const logs = await source.logs({ address: [] }, 1n, 2n);
    expect(logs.map((l) => [l.logIndex, l.blockTime])).toEqual([
      [2, null],
      [3, 0x6aca0000n],
    ]);
    expect(logs[0]?.address).toBe('0xa59335238D87C192d0F8Af7CC237E941BfB2aD9B');
    expect(await source.blockTime(0x7f01b72n)).toBe(0x6acb0000n);
  });

  it('counts requests and estimated compute units', async () => {
    const text = await metrics.registry.metrics();
    expect(text).toContain('indexer_rpc_requests_total{method="eth_getLogs"} 1');
    // chainId 0 + blockNumber 10 + getLogs 75 + getBlockByNumber 16
    expect(text).toContain('indexer_rpc_compute_units_total 101');
    expect(calls).toEqual([
      'eth_chainId',
      'eth_blockNumber',
      'eth_getLogs',
      'eth_getBlockByNumber',
    ]);
  });
});
