import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** WCAG 2.x contrast of the design tokens, read from globals.css (docs/05 §2.4, docs/06 4.1). */
// Vitest runs in apps/web (jsdom gives import.meta.url an http scheme).
const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no ${selector} block`);
  return css.slice(start, css.indexOf('}', start));
}

const brand = Object.fromEntries(
  [...block('@theme {').matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [
    m[1],
    m[2],
  ]),
) as Record<string, string>;

function resolve(value: string): string {
  const v = value.trim();
  const ref = /var\(--color-([a-z0-9-]+)\)/.exec(v);
  if (ref?.[1] !== undefined) {
    const hex = brand[ref[1]];
    if (hex === undefined) throw new Error(`unknown brand token ${ref[1]}`);
    return hex;
  }
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  throw new Error(`cannot resolve ${v}`);
}

function theme(selector: string): Record<string, string> {
  return Object.fromEntries(
    [...block(selector).matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      resolve(m[2] ?? ''),
    ]),
  ) as Record<string, string>;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = c.map((x) =>
    x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([
  ['dark', ":root,\n[data-theme='dark']"],
  ['light', "[data-theme='light']"],
])('%s theme', (_, selector) => {
  const t = theme(selector);
  const surfaces = ['surface', 'surface-raised'];
  it.each([
    ['fg', 7],
    ['fg-muted', 4.5],
    ['data', 4.5],
    ['good', 4.5],
    ['warn', 4.5],
    ['bad', 4.5],
  ])('%s text reaches %s:1 on every surface', (token, min) => {
    for (const s of surfaces) {
      expect(contrast(t[token] ?? '', t[s] ?? ''), `${token} on ${s}`).toBeGreaterThanOrEqual(min);
    }
  });

  it('focus ring is visible on every surface (3:1)', () => {
    for (const s of surfaces)
      expect(contrast(t['focus'] ?? '', t[s] ?? '')).toBeGreaterThanOrEqual(3);
  });
});

it('action buttons use dark text (white on Safety Orange fails, docs/05 §2.4)', () => {
  expect(contrast(brand['night'] ?? '', brand['orange'] ?? '')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#ffffff', brand['orange'] ?? '')).toBeLessThan(4.5);
  expect(contrast(brand['night'] ?? '', brand['alarm'] ?? '')).toBeGreaterThanOrEqual(4.5);
});
