/* global process, console */
// Captures the drill-site scene, HUD hidden, as a PNG sequence for brand video (tools/brand/
// teaser.sh). Virtual time: every frame is exactly 100 ms of the scene, which draws at 10 fps,
// however long a screenshot takes. Serve the built site first (PORT=4178 node e2e/serve.mjs).
//
//   node scripts/capture-scene.mjs <url> <out dir> [width] [height] [seconds] [warm-up ms]
//   DPR=2 for a phone layout (e.g. 540 x 960 CSS pixels -> 1080 x 1920 frames)
//
// Use the design preview with ?hd=1 (no pixel budget) and ?pads=N (no rig-drop demo), e.g.
// http://127.0.0.1:4178/design/site/?decor=1&pads=12&hd=1
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [url, outDir, w = '1920', h = '1080', secs = '9', warm = '8000'] = process.argv.slice(2);
if (url === undefined || outDir === undefined) {
  console.error('usage: capture-scene.mjs <url> <out dir> [width] [height] [seconds] [warm-up ms]');
  process.exit(1);
}
const dpr = Number(process.env.DPR ?? 1);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: dpr,
  isMobile: dpr > 1,
  hasTouch: dpr > 1,
});
await page.goto(url);
// Only the scene: no HUD, windows, Foreman Mo or the floating amounts (the top canvas).
await page.addStyleTag({
  content:
    'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}' +
    ' canvas[role=img],canvas.shrink-0{visibility:hidden !important}' +
    ' nextjs-portal{display:none !important}',
});
await page.waitForTimeout(Number(warm));
await page.clock.install();
const frames = Math.round(Number(secs) * 10);
for (let n = 0; n < frames; n++) {
  await page.clock.runFor(100);
  writeFileSync(`${outDir}/f${String(n).padStart(4, '0')}.png`, await page.screenshot());
}
await browser.close();
console.log(`capture-scene: ${frames} frames at 10 fps in ${outDir}`);
