/* global console, process, URL, setTimeout */
// Lighthouse gate (docs/06 4.5): mobile performance >= 85, accessibility >= 95, best practices
// and SEO >= 90 on the static export, served like Cloudflare Pages would (e2e/serve.mjs). A page
// under the performance bar is measured three times and judged on the median.
// Uses Playwright's Chromium. Run after `npm run build`: node scripts/lighthouse.mjs [--json out]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';

const PORT = 4175;
const BASE = `http://127.0.0.1:${PORT}`;
const PAGES = [
  '/',
  '/docs/',
  '/economy/',
  '/contracts/',
  '/faq/',
  '/play/',
  '/train/',
  '/status/',
  '/s/0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
];
const MIN = { performance: 85, accessibility: 95, 'best-practices': 90, seo: 90 };
// Pages kept out of search on purpose (robots noindex): the SEO score does not apply.
const NOINDEX = new Set(['/play/', '/s/0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc']);

const server = spawn(process.execPath, ['e2e/serve.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});
const DEBUG_PORT = 9333;
const browser = await chromium.launch({ args: [`--remote-debugging-port=${DEBUG_PORT}`] });

const results = [];
let failed = false;
try {
  await new Promise((r) => setTimeout(r, 500));
  const audit = (path) =>
    lighthouse(`${BASE}${path}`, {
      port: DEBUG_PORT,
      output: 'json',
      logLevel: 'error',
      onlyCategories: Object.keys(MIN),
    });
  const perf = (r) => r?.lhr.categories.performance?.score ?? 0;
  for (const path of PAGES) {
    let run = await audit(path);
    // The performance score is a timing and swings a few points between runs on a busy machine
    // (the CI runner is a laptop). A page under the bar gets two more runs and the median counts,
    // as Lighthouse CI does; the other categories do not depend on timing.
    if (perf(run) * 100 < MIN.performance) {
      const runs = [run, await audit(path), await audit(path)].sort((a, b) => perf(a) - perf(b));
      console.log(
        `  ${path}: performance ${runs.map((r) => Math.round(perf(r) * 100)).join(', ')}, median counts`,
      );
      run = runs[1];
    }
    const scores = Object.fromEntries(
      Object.keys(MIN).map((c) => [c, Math.round((run?.lhr.categories[c]?.score ?? 0) * 100)]),
    );
    const misses = Object.entries(MIN)
      .filter(([c, min]) => !(c === 'seo' && NOINDEX.has(path)) && scores[c] < min)
      .map(([c, min]) => `${c} ${scores[c]} < ${min}`);
    const audits = run?.lhr.audits ?? {};
    const lcp = audits['largest-contentful-paint']?.displayValue ?? '?';
    const tbt = audits['total-blocking-time']?.displayValue ?? '?';
    const cls = audits['cumulative-layout-shift']?.displayValue ?? '?';
    const lcpNode =
      audits['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node;
    const shifts = (audits['layout-shifts']?.details?.items ?? []).map((i) => ({
      score: i.score,
      node: i.node?.snippet ?? i.node?.selector,
    }));
    const a11yFails = (run?.lhr.categories.accessibility?.auditRefs ?? [])
      .filter((r) => r.weight > 0 && audits[r.id]?.score === 0)
      .map((r) => r.id);
    if (a11yFails.length > 0)
      console.log(`  accessibility audits failing on ${path}: ${a11yFails.join(', ')}`);
    results.push({
      path,
      scores,
      lcp,
      tbt,
      cls,
      misses,
      lcpElement: lcpNode?.snippet,
      shifts,
      a11yFails,
    });
    console.log(
      `${path.padEnd(14).slice(0, 14)} perf ${scores.performance} a11y ${scores.accessibility} bp ${scores['best-practices']} seo ${scores.seo}  LCP ${lcp} TBT ${tbt} CLS ${cls}${misses.length > 0 ? `  FAIL: ${misses.join(', ')}` : ''}`,
    );
    if (misses.length > 0) failed = true;
  }
} finally {
  await browser.close();
  server.kill();
}
const jsonAt = process.argv.indexOf('--json');
if (jsonAt > 0) writeFileSync(process.argv[jsonAt + 1], JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
