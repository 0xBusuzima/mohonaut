import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// A fixed clock so the live counter and times render identically in every run.
const FROZEN = new Date('2026-10-13T14:40:00Z');

test('design system has no accessibility violations (WCAG 2.1 AA)', async ({ page }) => {
  await page.goto('/design/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
});

test('keyboard: the modal opens, traps focus and closes with Escape', async ({ page }) => {
  await page.goto('/design/');
  const open = page.getByRole('button', { name: 'Open modal' }).first();
  await open.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Refine 1,000 MOHN' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
});

test('reduced motion is respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/design/');
  const spinner = page.locator('[aria-busy="true"] .animate-spin').first();
  const duration = await spinner.evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.1);
});

test('visual: design system', async ({ page }) => {
  test.skip(process.env['VISUAL'] !== '1', 'baselines come from the Linux CI image (VISUAL=1)');
  // Paused clock (only here: axe and the keyboard test need running timers).
  await page.clock.install({ time: FROZEN });
  await page.clock.pauseAt(FROZEN);
  await page.goto('/design/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('design.png', { fullPage: true });
});
