import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { watchCsp } from './csp';
import type { Page } from '@playwright/test';

/** SHOTS=1 saves a screenshot of each step under test-results/shots (for reviewing the art). */
async function shot(page: Page, name: string): Promise<void> {
  if (process.env['SHOTS'] === '1')
    await page.screenshot({ path: `test-results/shots/${name}.png` });
}

const RPC = `http://127.0.0.1:${process.env['PLAY_ANVIL_PORT'] ?? '18546'}`; // e2e/play/start.mjs

async function rpc(page: Page, method: string, params: unknown[]): Promise<void> {
  const res = await page.request.post(RPC, { data: { jsonrpc: '2.0', id: 1, method, params } });
  const body = (await res.json()) as { error?: { message: string } };
  if (body.error !== undefined) throw new Error(`${method}: ${body.error.message}`);
}

test('a new player opens a drill site, then stops and restarts the Pilot Rig', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cspViolations = await watchCsp(page);
  await page.goto('/play/');

  // The mock connector connects the anvil account: sign in, name the site, then the first diesel.
  await page.getByRole('button', { name: 'Sign in' }).click({ timeout: 30_000 });
  await page.getByLabel('Site name').fill('night_driller');
  await page.getByRole('button', { name: 'Enter my site' }).click();
  await expect(page.getByRole('dialog', { name: 'Open your site' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Testnet', { exact: true })).toBeVisible();
  await shot(page, '1-open-your-site');
  await page.getByLabel('ETH to spend').fill('0.0009');
  await page.getByRole('button', { name: 'Open my site' }).click();
  await expect(page.getByText('Diesel delivered')).toBeVisible({ timeout: 30_000 });

  // The site is open with its free Pilot Rig running.
  await page.getByRole('button', { name: 'My rigs' }).click({ timeout: 30_000 });
  const rigs = page.getByRole('dialog', { name: 'My rigs' });
  await expect(rigs.getByText('1 / 1 on')).toBeVisible({ timeout: 30_000 });
  await shot(page, '2-my-rigs');

  await rigs.getByRole('button', { name: 'Stop one Pilot Rig' }).click();
  await expect(page.getByText('Rig stopped')).toBeVisible({ timeout: 30_000 });
  await expect(rigs.getByText('0 / 1 on')).toBeVisible({ timeout: 30_000 });

  await rigs.getByRole('button', { name: 'Start one Pilot Rig' }).click();
  await expect(page.getByText('Rig started')).toBeVisible({ timeout: 30_000 });
  await expect(rigs.getByText('1 / 1 on')).toBeVisible({ timeout: 30_000 });
  await rigs.getByRole('button', { name: 'Close' }).click();

  // Before Market Open the refinery explains when it opens.
  await page.getByRole('button', { name: 'Refinery', exact: true }).click();
  await expect(page.getByText(/Refining opens at Market Open/)).toBeVisible();
  await shot(page, '3-refinery');
  await page
    .getByRole('dialog', { name: 'Refinery' })
    .getByRole('button', { name: 'Close' })
    .click();
  await page.getByRole('button', { name: /^Diesel/ }).click();
  await expect(page.getByRole('dialog', { name: 'Diesel tank' })).toBeVisible();
  await shot(page, '4-diesel');
  await page
    .getByRole('dialog', { name: 'Diesel tank' })
    .getByRole('button', { name: 'Close' })
    .click();
  await shot(page, '5-site');

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  expect(await cspViolations()).toEqual([]);
  expect(errors).toEqual([]);
});

test('after genesis, a driller buys two Rotary Rigs in one go', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Genesis is at most three hours ahead (start.mjs): four hours on, the lone driller holds
  // a whole slice of the emission in unrefined $MOHN.
  await rpc(page, 'evm_increaseTime', [4 * 3600]);
  await rpc(page, 'evm_mine', []);
  await page.goto('/play/');
  await page.getByRole('button', { name: 'Sign in' }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Market', exact: true }).click({ timeout: 30_000 });
  const market = page.getByRole('dialog', { name: 'Market' });
  await market.getByRole('button', { name: 'One Rotary Rig more' }).click({ timeout: 30_000 });
  await expect(market.getByText('× 2')).toBeVisible();
  // The batch quote comes from the chain; the button waits for it.
  const buy = market.getByRole('button', { name: 'Buy 2 Rotary Rigs' });
  await expect(buy).toBeEnabled({ timeout: 30_000 });
  await shot(page, '6-market-two');
  await buy.click();
  await expect(page.getByText('2 Rotary Rigs installed')).toBeVisible({ timeout: 30_000 });
  await market.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'My rigs' }).click();
  const rigs = page.getByRole('dialog', { name: 'My rigs' });
  await expect(rigs.getByText('2 / 2 on')).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('without the chain, the game says so and keeps trying', async ({ page }) => {
  // Every JSON-RPC call to the local chain fails, as when the RPC is down.
  const port = process.env['PLAY_ANVIL_PORT'] ?? '18546'; // e2e/play/start.mjs
  await page.route(
    (url) => url.port === port,
    (route) => route.abort(),
  );
  await page.goto('/play/');
  await expect(page.getByRole('dialog', { name: 'No signal' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Try now' })).toBeVisible();
});
