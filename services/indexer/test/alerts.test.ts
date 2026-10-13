import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mohnTokenAbi } from '@mohonaut/sdk';
import { asc } from 'drizzle-orm';
import { zeroAddress } from 'viem';
import { afterEach, describe, expect, it } from 'vitest';
import { Notifier, formatAlert, telegramTransport } from '../src/alerts/notify.js';
import type { AlertTransport } from '../src/alerts/notify.js';
import { contractSet } from '../src/contracts.js';
import { migrate, openDatabase } from '../src/db/client.js';
import type { Database } from '../src/db/client.js';
import { alerts } from '../src/db/schema.js';
import { Indexer, rebuildProjections } from '../src/indexer.js';
import { FakeChain } from './fixtures/chain.js';
import { ALICE, G, POOL_MANAGER, buildChain, deployment } from './fixtures/scenario.js';

const open: Database[] = [];
afterEach(async () => {
  while (open.length > 0) await open.pop()?.close();
});

async function index(chain: FakeChain): Promise<Database> {
  const database = await openDatabase('memory://');
  open.push(database);
  await migrate(database);
  const indexer = new Indexer(database, chain, {
    contracts: contractSet(deployment, POOL_MANAGER, 1),
    confirmations: 0n,
    maxBlockRange: 100_000n,
  });
  while (!(await indexer.step())) {
    // catch up
  }
  return database;
}

const rows = (database: Database) => database.db.select().from(alerts).orderBy(asc(alerts.id));

describe('on-chain alert rules', () => {
  it('raises governance and market alerts from the indexed events', async () => {
    const database = await index(buildChain());
    const raised = (await rows(database)).map((a) => `${a.severity} ${a.rule}`);
    expect(raised).toEqual([
      'warning MiningCore.MachineTypeAdded',
      'warning MiningCore.MachineTypeAdded',
      'critical ParamsTimelock.CallScheduled',
      'warning MiningCore.MarketOpened',
      'warning MiningCore.ParamChanged',
      'warning ParamsTimelock.CallExecuted',
    ]);
    const scheduled = (await rows(database)).find((a) => a.rule === 'ParamsTimelock.CallScheduled');
    expect(scheduled?.body).toBe('setParam(0, 120000000000000000), executable in 96 h');
  });

  it('does not raise an alert twice on a rebuild', async () => {
    const database = await index(buildChain());
    const before = (await rows(database)).length;
    await rebuildProjections(database, contractSet(deployment, POOL_MANAGER, 1));
    expect((await rows(database)).length).toBe(before);
  });

  it('flags MOHN minted beyond accrued emission, and large mints', async () => {
    const chain = new FakeChain(deployment.chainId, BigInt(deployment.startBlock), POOL_MANAGER);
    const mint = (to: string, value: bigint) => ({
      address: deployment.MohnToken,
      abi: mohnTokenAbi,
      event: 'Transfer',
      args: { from: zeroAddress, to, value },
    });
    chain.tx(G + 100n, [mint(ALICE, 60_000n * 10n ** 18n)]);
    const database = await index(chain);
    const raised = (await rows(database)).map((a) => `${a.severity} ${a.rule}`);
    expect(raised).toEqual(['critical mint-above-emission', 'warning large-mint']);
  });
});

describe('alert delivery', () => {
  const alertRow = {
    blockNumber: 7n,
    logIndex: 0,
    rule: 'MiningCore.Paused',
    severity: 'critical' as const,
    title: 'MiningCore.Paused',
    body: 'paused by 0x…',
    txHash: '0xabc',
  };

  async function outbox(times: bigint[], severities: ('critical' | 'warning' | 'info')[] = []) {
    const database = await openDatabase('memory://');
    open.push(database);
    await migrate(database);
    await database.db.insert(alerts).values(
      times.map((t, i) => ({
        ...alertRow,
        logIndex: i,
        blockTime: t,
        severity: severities[i] ?? 'critical',
      })),
    );
    return database;
  }

  it('sends through Telegram, skips stale or minor alerts, and retries failures', async () => {
    const received: { path: string; body: { chat_id: string; text: string } }[] = [];
    let fail = true;
    const server = createServer((req, res) => {
      let data = '';
      req.on('data', (c: Buffer) => (data += c.toString()));
      req.on('end', () => {
        received.push({ path: req.url ?? '', body: JSON.parse(data) });
        res.setHeader('content-type', 'application/json');
        if (fail) {
          res.statusCode = 502;
          res.end(JSON.stringify({ ok: false, description: 'Bad Gateway' }));
        } else res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const now = 1_800_000_000_000;
      const nowS = BigInt(now / 1000);
      const database = await outbox(
        [nowS - 10n, nowS - 200_000n, nowS - 5n],
        ['critical', 'critical', 'info'],
      );
      const notifier = new Notifier(database, [telegramTransport('TOKEN', '-1001', api)], {
        chainId: 46630,
        minSeverity: 'warning',
        maxAgeSeconds: 86_400,
        now: () => now,
      });

      // Telegram is down: the fresh critical alert stays pending; the stale and info ones are skipped.
      expect(await notifier.deliver()).toEqual({ sent: 0, skipped: 2, failed: 1, pending: 1 });
      fail = false;
      expect(await notifier.deliver()).toEqual({ sent: 1, skipped: 0, failed: 0, pending: 0 });
      expect(await notifier.deliver()).toEqual({ sent: 0, skipped: 0, failed: 0, pending: 0 });

      expect(received).toHaveLength(2);
      expect(received[1]?.path).toBe('/botTOKEN/sendMessage');
      expect(received[1]?.body.chat_id).toBe('-1001');
      expect(received[1]?.body.text).toContain('[CRITICAL] MiningCore.Paused');
      expect(received[1]?.body.text).toContain(
        'https://explorer.testnet.chain.robinhood.com/tx/0xabc',
      );
      const final = await rows(database);
      expect(final.map((a) => [a.skipped, a.attempts])).toEqual([
        [false, 2],
        [true, 0],
        [true, 0],
      ]);
    } finally {
      server.close();
    }
  });

  it('marks an alert delivered only when every transport accepted it', async () => {
    const database = await outbox([1_799_999_990n]);
    const sent: string[] = [];
    const ok: AlertTransport = { name: 'ok', send: async (t) => void sent.push(t) };
    const broken: AlertTransport = {
      name: 'broken',
      send: async () => {
        throw new Error('down');
      },
    };
    const notifier = new Notifier(database, [ok, broken], {
      chainId: 4663,
      minSeverity: 'warning',
      maxAgeSeconds: 86_400,
      now: () => 1_800_000_000_000,
    });
    expect((await notifier.deliver()).failed).toBe(1);
    expect((await rows(database))[0]?.deliveredAt).toBeNull();
    expect(sent[0]).toContain('https://robinhoodchain.blockscout.com/tx/0xabc');
  });

  it('formats without an explorer link on unknown chains', async () => {
    const database = await outbox([1n]);
    const [row] = await rows(database);
    if (row === undefined) throw new Error('no row');
    expect(formatAlert(row, 31337)).not.toContain('http');
  });
});
