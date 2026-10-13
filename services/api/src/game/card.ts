import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import {
  BADGES,
  BADGE_PALETTE,
  MO_ART,
  MO_COLORS,
  STRATA,
  formatDepth,
  stratumAt,
} from '@mohonaut/sdk';

/**
 * Contribution card (docs/01 §4.11): the player's share of the shared World Bore, their crew and
 * the world depth, in the brand palette and type (docs/05 §2.4, §2.5). It shows no earnings,
 * prices or USD, by design (docs/05 §6).
 */
export interface CardInput {
  /** Player's contribution in millimetres. */
  contributionMm: bigint;
  worldDepthMm: bigint;
  crew: string | null;
  name: string;
  /** Earned badge ids, drawn as their pixel plates (unknown ids are skipped). */
  badges?: readonly string[];
}

const require = createRequire(import.meta.url);
const fontDir = (pkg: string) => dirname(require.resolve(`@expo-google-fonts/${pkg}/package.json`));
const FONTS = [
  join(fontDir('big-shoulders-display'), 'BigShouldersDisplay_900Black.ttf'),
  join(fontDir('barlow'), '400Regular', 'Barlow_400Regular.ttf'),
  join(fontDir('barlow'), '700Bold', 'Barlow_700Bold.ttf'),
  join(fontDir('jetbrains-mono'), '500Medium', 'JetBrainsMono_500Medium.ttf'),
];

const C = {
  charcoal: '#16191D',
  steel: '#39414A',
  concrete: '#8B939C',
  bone: '#ECE7DC',
  orange: '#FF6B1A',
  cyan: '#2EE6D6',
};

const escapeXml = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch] ?? ch,
  );

/** Pixel art as rects: one per run of same-coloured pixels, `px` pixels per art pixel. */
function pixelRects(
  art: readonly string[],
  colors: Readonly<Record<string, string>>,
  x: number,
  y: number,
  px: number,
): string {
  const out: string[] = [];
  art.forEach((row, ry) => {
    let rx = 0;
    while (rx < row.length) {
      const ch = row[rx] ?? '.';
      let run = 1;
      while (row[rx + run] === ch) run++;
      const fill = colors[ch];
      if (fill !== undefined) {
        out.push(
          `<rect x="${x + rx * px}" y="${y + ry * px}" width="${run * px}" height="${px}" fill="${fill}"/>`,
        );
      }
      rx += run;
    }
  });
  return out.join('');
}

/** A strip of hazard stripes along the bottom edge, stair-stepped like the game's. */
function hazard(width: number, y: number, h: number): string {
  const out: string[] = [
    `<rect x="0" y="${y}" width="${width}" height="${h}" fill="${C.charcoal}"/>`,
  ];
  for (let x = -h; x < width; x += h * 2) {
    out.push(
      `<polygon points="${x},${y + h} ${x + h},${y} ${x + h * 2},${y} ${x + h},${y + h}" fill="#FFB31A"/>`,
    );
  }
  return out.join('');
}

export function cardSvg(input: CardInput): string {
  const { current } = stratumAt(input.worldDepthMm);
  const crewLine = input.crew === null ? '' : ` · Crew ${escapeXml(input.crew)}`;
  const band = 69;
  const bands = STRATA.map(
    (s, i) =>
      `<rect x="1080" y="${40 + i * band}" width="80" height="${band}" fill="${s.colour}" stroke="${C.steel}" stroke-width="1"/>`,
  ).join('');
  // "We are here": the current stratum's band on the bore log, in gauge cyan (data only).
  const marker = 40 + STRATA.findIndex((s) => s.name === current.name) * band + band / 2;
  // Earned badges in a row under the world depth: 12x12 plates at 4x.
  const plates = BADGES.filter((b) => input.badges?.includes(b.id) === true)
    .map((b, i) => pixelRects(b.icon, BADGE_PALETTE, 64 + i * 60, 462, 4))
    .join('');
  const mono = (text: string) =>
    `<tspan font-family="JetBrains Mono" font-weight="500">${escapeXml(text)}</tspan>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${C.charcoal}"/>
  ${bands}
  <rect x="1060" y="${marker - 2}" width="120" height="4" fill="${C.cyan}"/>
  ${pixelRects(MO_ART, MO_COLORS, 852, 330, 8)}
  ${plates}
  ${hazard(1040, 606, 24)}
  <text x="64" y="116" font-family="Big Shoulders Display" font-weight="900" font-size="56" fill="${C.orange}">MOHONAUT</text>
  <text x="64" y="250" font-family="Barlow" font-weight="700" font-size="64" fill="${C.bone}">I've cored ${mono(formatDepth(input.contributionMm))}</text>
  <text x="64" y="320" font-family="Barlow" font-weight="400" font-size="40" fill="${C.bone}">of the World Bore${crewLine}</text>
  <text x="64" y="430" font-family="Barlow" font-weight="400" font-size="32" fill="${C.concrete}">World depth ${mono(formatDepth(input.worldDepthMm))} · Stratum ${current.numeral} — ${escapeXml(current.name)}</text>
  <text x="64" y="560" font-family="Barlow" font-weight="700" font-size="32" fill="${C.bone}">Race to the Moho</text>
  <text x="64" y="590" font-family="Barlow" font-weight="400" font-size="24" fill="${C.concrete}">${escapeXml(input.name)}</text>
</svg>`;
}

export function renderCardPng(input: CardInput): Buffer {
  const resvg = new Resvg(cardSvg(input), {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Barlow' },
  });
  return resvg.render().asPng();
}
