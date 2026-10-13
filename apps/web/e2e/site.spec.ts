import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = [
  '/',
  '/docs/',
  '/docs/economy/',
  '/docs/refining/',
  '/docs/genesis/',
  '/docs/eth/',
  '/economy/',
  '/contracts/',
  '/security/',
  '/faq/',
  '/status/',
  '/support/',
  '/season0/',
  '/faucet/',
  '/brand/',
  '/collab/',
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
    '/og-train.png',
    '/rigs/rig-5.png',
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
  await expect(page.getByRole('dialog', { name: 'Welcome' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('/s/<address> shows a public drill site page with a way in', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const address = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
  const res = await page.goto(`/s/${address}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('0x3c44…93bc');
  await expect(page.getByRole('link', { name: 'Start drilling' })).toHaveAttribute(
    'href',
    `/play/?ref=${address}`,
  );
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('every page carries a hash-based CSP and breaks none of it', async ({ page }) => {
  // About twenty pages, each to network idle: alone ~26 s, more beside the other workers.
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.route(/rpc\./, (route) => route.abort());
  for (const path of [
    ...PAGES,
    '/play/',
    '/train/',
    '/ops/',
    '/s/0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
  ]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(policy, path).toContain("script-src 'self' 'sha256-");
    expect(policy, path).not.toContain('unsafe-eval');
    expect(
      await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp),
      path,
    ).toEqual([]);
  }
});

test('/play/ loads the wallet code on Connect, within budget and the CSP', async ({ page }) => {
  const BUDGET = 450 * 1024; // brotli bytes of JavaScript: the light welcome plus the wallet app
  const sizes: Promise<number>[] = [];
  page.on('requestfinished', (req) => {
    if (req.url().endsWith('.js')) sizes.push(req.sizes().then((s) => s.responseBodySize));
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.route(/rpc\./, (route) => route.abort());
  await page.goto('/play/');
  await page.waitForLoadState('networkidle');
  const light = (await Promise.all(sizes)).reduce((a, b) => a + b, 0);
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  // The wallet list opens by itself once its code has loaded.
  await expect(page.getByRole('button', { name: 'Browser wallet' })).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForLoadState('networkidle');
  const total = (await Promise.all(sizes)).reduce((a, b) => a + b, 0);
  console.log(
    `/play/ JavaScript: ${(light / 1024).toFixed(1)} KB before Connect, ${(total / 1024).toFixed(1)} KB after (compressed)`,
  );
  expect(light).toBeLessThan(180 * 1024);
  expect(total).toBeLessThan(BUDGET);
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
});

test('/ops/ stays out of search and needs the API', async ({ page }) => {
  await page.goto('/ops/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByText('The API is not configured for this build')).toBeVisible();
});

test('the training site runs the game without a wallet', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // No chain access: the training site never needs one.
  await page.route(/rpc\./, (route) => route.abort());
  await page.goto('/train/');
  // Shared links show the training site's own card.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/og-train\.png$/,
  );
  await expect(page.getByRole('img', { name: /^Training site, level 1/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Market', exact: true }).click();
  // The training site's illustrative price: 10 practice $MOHN per DP.
  await expect(page.getByText(/Right now 1 DP costs 10\.00 MOHN/)).toBeVisible();
  await page.getByRole('button', { name: 'Buy one Rotary Rig' }).click();
  await expect(page.getByText('Rotary Rig installed')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'My rigs', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'My rigs' }).getByText('Rotary Rig')).toBeVisible();
  // Starting over asks once more before it erases the practice site.
  await page.getByRole('button', { name: 'Close' }).click();
  const fold = page.getByRole('button', { name: /^Simulation/ });
  if (await fold.isVisible()) await fold.click(); // phones: the panel is folded
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByRole('button', { name: 'Sure? Erase my site' })).toBeVisible();
  await page.getByRole('button', { name: 'My rigs', exact: true }).click();
  // The site window is a button away, not only a click on the world (keyboard players).
  await page
    .getByRole('dialog', { name: 'My rigs' })
    .getByRole('button', { name: 'Expand the site' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Expand your site' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('on a phone held sideways, nothing covers the main buttons or the HUD switches', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/train/');
  // A click lands only if the button is on top: the simulation panel and the guide keep clear.
  await page.getByRole('button', { name: 'Sound' }).click({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Sound' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Refinery', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Refinery' })).toBeVisible();
});

test('/timelock goes to the live queue on the economy page', async ({ request }) => {
  const res = await request.get('/timelock', { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers()['location']).toBe('/economy/#timelock');
});
