import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { watchCsp } from './csp';

test('a new player opens a drill site, then stops and restarts the Pilot Rig', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cspViolations = await watchCsp(page);
  await page.goto('/play/');

  // The mock connector signs in the anvil account; the site does not exist yet.
  await expect(page.getByRole('heading', { name: 'Fill your tank' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Testnet · Season 0')).toBeVisible();
  await page.getByLabel('ETH to spend').fill('0.0009');
  await page.getByRole('button', { name: 'Buy diesel' }).click();
  await expect(page.getByText('Diesel delivered')).toBeVisible({ timeout: 30_000 });

  // The site is open with its free Pilot Rig running.
  await expect(page.getByRole('heading', { name: 'Site L1' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('1 / 1 running')).toBeVisible();

  await page.getByRole('button', { name: 'Stop one Pilot Rig' }).click();
  await expect(page.getByText('Rig stopped')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('0 / 1 running')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Start one Pilot Rig' }).click();
  await expect(page.getByText('Rig started')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('1 / 1 running')).toBeVisible({ timeout: 30_000 });

  // Before Market Open the refinery explains when it opens.
  await expect(page.getByText(/Refining opens at Market Open/)).toBeVisible();

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  expect(await cspViolations()).toEqual([]);
  expect(errors).toEqual([]);
});
