/* global process, console */
// Screenshots of pages for reviewing the art, headless (no window needed).
// Usage (FULL=1 for whole pages): node scripts/shoot.mjs <base-url> <out-dir> <path>[@WxH][#click-text] ...
// e.g. node scripts/shoot.mjs http://localhost:3100 shots /design/site/ "/design/site/@375x812" "/design/site/#Market"
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [base, out, ...targets] = process.argv.slice(2);
if (base === undefined || out === undefined || targets.length === 0) {
  console.error('usage: node scripts/shoot.mjs <base-url> <out-dir> <path>[@WxH][#click-text] ...');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [i, target] of targets.entries()) {
  const [pathSize, click] = target.split('#');
  const [path, size = '1440x900'] = pathSize.split('@');
  const [width, height] = size.split('x').map(Number);
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path);
  await page.waitForTimeout(2500);
  if (click !== undefined) {
    await page.getByRole('button', { name: click }).first().click();
    await page.waitForTimeout(800);
  }
  const file = join(out, `${i + 1}.png`);
  await page.screenshot({ path: file, fullPage: process.env.FULL === '1' });
  console.log(file, target, errors.length === 0 ? '' : `ERRORS: ${errors.join(' | ')}`);
  await page.close();
}
await browser.close();
