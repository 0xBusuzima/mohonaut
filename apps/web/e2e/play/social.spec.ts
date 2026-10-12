import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { watchCsp } from './csp';
import type { Page } from '@playwright/test';

const PLAYER = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'; // anvil account 2 (start.mjs)

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
  await expect(page.getByRole('tab', { name: 'Site' })).toBeVisible({ timeout: 30_000 });

  // Sign-In with Ethereum through RainbowKit and the mock wallet.
  await page.getByRole('tab', { name: 'Crew' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /sign message/i }).click();
  await expect(page.getByRole('heading', { name: 'Start a crew' })).toBeVisible({
    timeout: 30_000,
  });

  // Crew: create, become captain, not ranked until five members.
  await page.getByLabel(/^Name/).fill('Night Shift');
  await page.getByLabel(/^Tag/).fill('night');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Night Shift [NIGHT]' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('1 of 5 to rank')).toBeVisible();
  await expect(page.getByText('Captain')).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // Survey: one find a day.
  await page.getByRole('tab', { name: 'Survey' }).click();
  await page.getByRole('button', { name: 'Survey' }).click();
  await expect(page.getByText(/You found: /)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Surveyed today' })).toBeDisabled();

  // Profile: display name and alerts.
  await page.getByRole('tab', { name: 'Profile' }).click();
  await page.getByLabel(/^Display name/).fill('driller_one');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'driller_one' })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('My tank is running low').check();
  await page.getByLabel(/^Telegram chat id/).fill('123456');
  await page.getByRole('button', { name: 'Save alerts' }).click();
  await expect(page.getByText('Alerts saved')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Copy invite link' })).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // Seasons and the all-time board are public.
  await page.getByRole('tab', { name: 'Seasons' }).click();
  await expect(page.getByRole('heading', { name: 'World Bore contribution' })).toBeVisible();

  expect(await cspViolations()).toEqual([]);

  // The public page needs no wallet and carries the invite.
  await page.goto(`/s/${PLAYER}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('driller_one', {
    timeout: 15_000,
  });
  await expect(page.getByRole('link', { name: 'Start drilling' })).toHaveAttribute(
    'href',
    `/play/?ref=${PLAYER}`,
  );
  expect(await axe(page)).toEqual([]);
  expect(await cspViolations()).toEqual([]);
  expect(errors).toEqual([]);
});
