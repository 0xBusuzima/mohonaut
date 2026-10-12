import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { STRATA, formatDepth, stratumAt } from './depth.js';

/**
 * Contribution card (docs/01 §4.11): the player's share of the shared World Bore, their crew and
 * the world depth. It shows no earnings, prices or USD, by design (docs/05 §6).
 */
export interface CardInput {
  /** Player's contribution in millimetres. */
  contributionMm: bigint;
  worldDepthMm: bigint;
  crew: string | null;
  name: string;
}

const FONT_DIR = dirname(
  createRequire(import.meta.url).resolve('@expo-google-fonts/inter/package.json'),
);
const FONTS = [
  join(FONT_DIR, '400Regular', 'Inter_400Regular.ttf'),
  join(FONT_DIR, '700Bold', 'Inter_700Bold.ttf'),
];

// Lithology colours of the bore log (docs/01 §7).
const STRATUM_COLOURS = [
  '#c8a77e',
  '#d9c9a3',
  '#b9a2a4',
  '#8f8f94',
  '#4a4a50',
  '#6b7a3a',
  '#c4512d',
  '#8a1f12',
];

const escapeXml = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch] ?? ch,
  );

export function cardSvg(input: CardInput): string {
  const { current } = stratumAt(input.worldDepthMm);
  const crewLine = input.crew === null ? '' : ` · Crew ${escapeXml(input.crew)}`;
  const bands = STRATA.map(
    (_, i) =>
      `<rect x="1080" y="${40 + i * 69}" width="80" height="69" fill="${STRATUM_COLOURS[i] ?? '#333'}"/>`,
  ).join('');
  const marker = 40 + STRATA.findIndex((s) => s.name === current.name) * 69 + 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#1c1d21"/>
  ${bands}
  <rect x="1060" y="${marker - 3}" width="120" height="6" fill="#2ee6d6"/>
  <text x="64" y="120" font-family="Inter" font-weight="700" font-size="40" fill="#f28c28">MOHONAUT</text>
  <text x="64" y="250" font-family="Inter" font-weight="700" font-size="64" fill="#f5f2ea">I've cored ${escapeXml(formatDepth(input.contributionMm))}</text>
  <text x="64" y="320" font-family="Inter" font-weight="400" font-size="40" fill="#f5f2ea">of the World Bore${crewLine}</text>
  <text x="64" y="430" font-family="Inter" font-weight="400" font-size="32" fill="#b8b3a7">World depth ${escapeXml(formatDepth(input.worldDepthMm))} · Stratum ${current.numeral} — ${escapeXml(current.name)}</text>
  <text x="64" y="560" font-family="Inter" font-weight="700" font-size="32" fill="#2ee6d6">Race to the Moho</text>
  <text x="1000" y="560" text-anchor="end" font-family="Inter" font-weight="400" font-size="24" fill="#8a857a">${escapeXml(input.name)}</text>
</svg>`;
}

export function renderCardPng(input: CardInput): Buffer {
  const resvg = new Resvg(cardSvg(input), {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' },
  });
  return resvg.render().asPng();
}
