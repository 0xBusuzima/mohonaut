import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { watchCsp } from './csp';

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
  await page.getByLabel('ETH to spend').fill('0.0009');
  await page.getByRole('button', { name: 'Open my site' }).click();
  await expect(page.getByText('Diesel delivered')).toBeVisible({ timeout: 30_000 });

  // The site is open with its free Pilot Rig running.
  await page.getByRole('button', { name: 'My rigs' }).click({ timeout: 30_000 });
  const rigs = page.getByRole('dialog', { name: 'My rigs' });
  await expect(rigs.getByText('1 / 1 on')).toBeVisible({ timeout: 30_000 });

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

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  expect(await cspViolations()).toEqual([]);
  expect(errors).toEqual([]);
});
