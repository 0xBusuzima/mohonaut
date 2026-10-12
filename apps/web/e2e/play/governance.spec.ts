import AxeBuilder from '@axe-core/playwright';
import { timelockControllerAbi } from '@mohonaut/sdk';
import type { SafeBatchFile } from '@mohonaut/sdk';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { encodeFunctionData } from 'viem';
import type { Hex } from 'viem';
import { watchCsp } from './csp';

// e2e/play/start.mjs: the anvil RPC and the Ops Safe stand-in (account 5, unlocked on anvil).
const RPC = `http://127.0.0.1:${process.env['PLAY_ANVIL_PORT'] ?? '18546'}`;
const OPS = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';

async function rpc(page: Page, method: string, params: unknown[]): Promise<unknown> {
  const res = await page.request.post(RPC, {
    data: { jsonrpc: '2.0', id: 1, method, params },
  });
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error !== undefined) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/** Sends the one call of a Transaction Builder file from `from`, as the Safe would. */
async function sendBatch(page: Page, file: SafeBatchFile, from: string): Promise<void> {
  const tx = file.transactions[0];
  if (tx === undefined) throw new Error('empty batch');
  const v = tx.contractInputsValues;
  const data =
    tx.contractMethod.name === 'schedule'
      ? encodeFunctionData({
          abi: timelockControllerAbi,
          functionName: 'schedule',
          args: [
            v['target'] as Hex,
            0n,
            v['data'] as Hex,
            v['predecessor'] as Hex,
            v['salt'] as Hex,
            BigInt(v['delay'] ?? '0'),
          ],
        })
      : encodeFunctionData({
          abi: timelockControllerAbi,
          functionName: 'execute',
          args: [
            v['target'] as Hex,
            0n,
            v['payload'] as Hex,
            v['predecessor'] as Hex,
            v['salt'] as Hex,
          ],
        });
  const hash = (await rpc(page, 'eth_sendTransaction', [{ from, to: tx.to, data }])) as string;
  for (let i = 0; i < 30; i++) {
    const receipt = (await rpc(page, 'eth_getTransactionReceipt', [hash])) as {
      status: string;
    } | null;
    if (receipt !== null) {
      expect(receipt.status).toBe('0x1');
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error('no receipt');
}

async function downloaded(page: Page, label: string): Promise<SafeBatchFile> {
  const href = (await page.getByRole('link', { name: label }).getAttribute('href')) ?? '';
  return JSON.parse(
    decodeURIComponent(href.replace(/^data:application\/json;charset=utf-8,/, '')),
  ) as SafeBatchFile;
}

test('a parameter change goes from the panel through the timelock to the chain', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cspViolations = await watchCsp(page);
  await page.goto('/ops/');
  const signIn = page.getByRole('button', { name: /sign message/i });
  await page.getByRole('button', { name: /Sign in|Connect wallet/ }).click();
  await signIn.click();

  // Parameter centre: current diesel price, a +10 % proposal, the two Safe files.
  await page.getByRole('tab', { name: 'Parameters' }).click();
  await expect(page.getByRole('table', { name: 'MiningCore parameters' })).toBeVisible({
    timeout: 30_000,
  });
  await page
    .getByRole('button', { name: 'Propose a change to Diesel price (USD per litre)' })
    .click();
  await page.getByLabel('New value').fill('$0.5');
  await expect(page.getByText(/^step too large/)).toBeVisible();
  await page.getByLabel('New value').fill('0.11');
  await page.getByRole('button', { name: 'Prepare Safe files' }).click();
  const schedule = await downloaded(page, '1-schedule.json');
  const execute = await downloaded(page, '2-execute.json');
  expect(schedule.chainId).toBe('31337');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // The Ops Safe signs the schedule file; the queue shows the change, decoded.
  await sendBatch(page, schedule, OPS);
  await page.getByRole('tab', { name: 'Timelock' }).click();
  await expect(page.getByText('setParam(FuelPrice, $0.1100)')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^runs in /)).toBeVisible();

  // Four days later anyone runs the execute file; the chain has the new price.
  await rpc(page, 'evm_increaseTime', [345_600 + 60]);
  await rpc(page, 'evm_mine', []);
  await sendBatch(page, execute, OPS);
  await page.getByRole('tab', { name: 'Parameters' }).click();
  await page.reload();
  await page.getByRole('tab', { name: 'Parameters' }).click();
  const row = page.getByRole('row', { name: /Diesel price/ });
  await expect(row).toContainText('$0.1100', { timeout: 30_000 });

  // Emergency: no pause button, a prepared Guardian file instead.
  await page.getByRole('tab', { name: 'Emergency' }).click();
  await page.getByRole('button', { name: 'Prepare Guardian pause file' }).click();
  const pause = await downloaded(page, 'guardian-pause.json');
  expect(pause.transactions[0]?.contractMethod.name).toBe('pause');
  expect(await cspViolations()).toEqual([]);
  expect(errors).toEqual([]);
});
