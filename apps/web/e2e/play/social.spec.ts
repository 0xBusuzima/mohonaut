import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { watchCsp } from './csp';
import type { Page } from '@playwright/test';

const PLAYER = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'; // anvil account 2 (start.mjs)

/** SHOTS=1 saves a screenshot of each step under test-results/shots (for reviewing the art). */
async function shot(page: Page, name: string): Promise<void> {
  if (process.env['SHOTS'] === '1')
    await page.screenshot({ path: `test-results/shots/${name}.png` });
}

async function axe(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('sign in, start a crew, survey, name the site, set alerts and see the public page', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cspViolations = await watchCsp(page);
  await page.goto('/play/');

  // A returning player signs in again; the name from the first visit leads straight to the site.
  await page.getByRole('button', { name: 'Sign in' }).click({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Market', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Crew', exact: true }).click();
  const win = page.getByRole('dialog');
  await expect(win.getByRole('heading', { name: 'Start a crew' })).toBeVisible({
    timeout: 30_000,
  });

  // Crew: create, become captain, not ranked until five members.
  await win.getByLabel(/^Name/).fill('Night Shift');
  await win.getByLabel(/^Tag/).fill('night');
  await win.getByRole('button', { name: 'Create' }).click();
  await expect(win.getByRole('heading', { name: 'Night Shift [NIGHT]' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(win.getByText('1 of 5 to rank')).toBeVisible();
  await expect(win.getByText('Captain')).toBeVisible();
  await shot(page, 's1-crew');
  expect(await axe(page)).toEqual([]);
  await win.getByRole('button', { name: 'Close' }).click();

  // Survey: one find a day.
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  await win.getByRole('button', { name: 'Survey', exact: true }).click();
  await expect(win.getByText(/You found: /)).toBeVisible({ timeout: 15_000 });
  await expect(win.getByRole('button', { name: 'Surveyed today' })).toBeDisabled();
  // The find can be shared, with the invite link.
  await expect(win.getByRole('link', { name: 'Share on X' })).toHaveAttribute(
    'href',
    /utm_campaign%3Dsurvey/,
  );
  await shot(page, 's2-survey');
  await win.getByRole('button', { name: 'Close' }).click();

  // Profile: display name and alerts.
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  await win.getByLabel(/^Display name/).fill('driller_one');
  await win.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(win.getByRole('heading', { name: 'driller_one' })).toBeVisible({ timeout: 15_000 });
  await win.getByLabel('My tank is running low').check();
  await win.getByLabel(/^Telegram chat id/).fill('123456');
  await win.getByRole('button', { name: 'Save alerts' }).click();
  await expect(page.getByText('Alerts saved')).toBeVisible({ timeout: 15_000 });
  await expect(win.getByRole('button', { name: 'Copy invite link' })).toBeVisible();
  await shot(page, 's3-profile');
  expect(await axe(page)).toEqual([]);
  await win.getByRole('button', { name: 'Close' }).click();

  // Seasons and the all-time board are public.
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  await expect(win.getByRole('heading', { name: 'World Bore contribution' })).toBeVisible();
  await shot(page, 's4-board');

  expect(await cspViolations()).toEqual([]);

  // The public page needs no wallet and carries the invite.
  await page.goto(`/s/${PLAYER}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('driller_one', {
    timeout: 15_000,
  });
  await expect(page.getByRole('img', { name: /^Drill site level 1 at night/ })).toBeVisible({
    timeout: 15_000,
  });
  await shot(page, 's5-public');
  await expect(page.getByRole('link', { name: 'Start drilling' })).toHaveAttribute(
    'href',
    `/play/?ref=${PLAYER}`,
  );
  expect(await axe(page)).toEqual([]);
  expect(await cspViolations()).toEqual([]);
  expect(errors).toEqual([]);
});

test('the economy page reads the chain through the indexer: rig sales by day', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/economy/');
  // The Rotary Rigs bought in play.spec.ts: a day with a price per DP (the chain runs hours
  // ahead of this clock after the time travel there, and the API follows the chain).
  const sales = page.getByRole('table', { name: 'Rig sales, last 7 days' });
  await expect(sales).toBeVisible({ timeout: 30_000 });
  await expect(sales.getByRole('row').filter({ hasText: /MOHN/ })).toHaveCount(1);
  await shot(page, 's6-economy');
  expect(await axe(page)).toEqual([]);
  expect(errors).toEqual([]);
});
