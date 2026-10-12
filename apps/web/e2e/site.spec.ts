import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = [
  '/',
  '/docs/',
  '/docs/economy/',
  '/docs/refining/',
  '/docs/genesis/',
  '/economy/',
  '/contracts/',
  '/security/',
  '/faq/',
  '/status/',
  '/terms/',
  '/privacy/',
];

for (const path of PAGES) {
  test(`${path} renders, is accessible and has no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource'))
        errors.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
    expect(await page.title()).toContain('Mohonaut');
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('every internal link leads to a page', async ({ page, request }) => {
  const seen = new Set<string>();
  for (const path of PAGES) {
    await page.goto(path);
    const hrefs = await page
      .locator('a[href^="/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    for (const href of hrefs) seen.add(href.split('#')[0] ?? href);
  }
  const broken: string[] = [];
  for (const href of seen) {
    const res = await request.get(href);
    if (res.status() !== 200) broken.push(`${href} â†’ ${res.status()}`);
  }
  expect(broken).toEqual([]);
});

test('unknown pages show the 404 page', async ({ page }) => {
  const res = await page.goto('/no-such-page/');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Nothing at this depth' })).toBeVisible();
});

test('SEO and PWA files are served', async ({ request }) => {
  for (const path of [
    '/sitemap.xml',
    '/robots.txt',
    '/manifest.webmanifest',
    '/og.png',
    '/.well-known/security.txt',
  ]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /play/');
});

test('/play/ offers a wallet connection, is accessible and is not indexed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // No chain access in this test: the not-connected screen must not depend on the RPC.
  await page.route(/rpc\./, (route) => route.abort());
  await page.goto('/play/');
  await expect(page.getByRole('heading', { name: 'Open your drill site' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
