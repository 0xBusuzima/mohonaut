import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchCsp } from './csp';

const PLAYER = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'; // anvil account 2, an admin here

async function axe(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('an operator answers a support request, publishes a banner and reads the audit log', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // A player writes in through the public form.
  await page.goto('/support/');
  await page.getByLabel('Topic').selectOption('transaction');
  await page.getByLabel(/^What happened/).fill('My refine from yesterday has not arrived yet.');
  await page.getByLabel(/^How to reach you/).fill('@someone');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Received as request #\d+/)).toBeVisible({ timeout: 15_000 });

  // The operator signs in to the panel.
  const cspViolations = await watchCsp(page);
  await page.goto('/ops/');
  await page.getByRole('button', { name: /Sign in|Connect wallet/ }).click();
  await page.getByRole('button', { name: /sign message/i }).click();
  await expect(page.getByRole('tab', { name: 'Health' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('table', { name: 'Indexer streams and lag' })).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // Support: answer the request.
  await page.getByRole('tab', { name: 'Support' }).click();
  await expect(page.getByText('My refine from yesterday has not arrived yet.')).toBeVisible();
  await page
    .getByRole('combobox', { name: /^Status/ })
    .last()
    .selectOption('answered');
  await page.getByLabel('Internal note').fill('72-hour queue; told them when');
  await page.getByLabel(/^Reason/).fill('answered on X');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Request updated')).toBeVisible({ timeout: 15_000 });

  // Players: find the wallet and open the file.
  await page.getByRole('tab', { name: 'Players' }).click();
  await page.getByLabel(/^Wallet \(start\)/).fill(PLAYER.slice(0, 8));
  await page.getByRole('button', { name: 'Search' }).click();
  await page
    .getByRole('button', { name: /^Open player / })
    .first()
    .click();
  await expect(page.getByText(/No one can touch on-chain assets from here/)).toBeVisible();

  // Announcements: publish a banner, then see it on the site.
  await page.getByRole('tab', { name: 'Announcements' }).click();
  await page.getByLabel(/^Title/).fill('Testnet maintenance at 14:00 UTC');
  await page
    .getByLabel(/^Reason/)
    .first()
    .fill('planned restart');
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published')).toBeVisible({ timeout: 15_000 });
  expect(await axe(page)).toEqual([]);

  // Audit: both writes are there with their reasons.
  await page.getByRole('tab', { name: 'Audit' }).click();
  await expect(page.getByRole('cell', { name: 'answered on X' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'planned restart' })).toBeVisible();
  expect(await cspViolations()).toEqual([]);

  await page.goto('/faq/');
  const banner = page.getByRole('complementary', { name: 'Announcement' });
  await expect(banner).toContainText('Testnet maintenance at 14:00 UTC', { timeout: 15_000 });
  await banner.getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner).toBeHidden();
  expect(errors).toEqual([]);
});
