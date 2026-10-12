import localFont from 'next/font/local';

/**
 * Brand fonts (docs/05 §2.3), self-hosted from @fontsource, Latin subset only. next/font adds
 * size-adjusted fallbacks, so swapping in the real font does not move the layout (CLS), and
 * preloads the faces seen first. Paths must be literals (next/font).
 */
const barlow = localFont({
  src: [
    {
      path: '../../../../node_modules/@fontsource/barlow/files/barlow-latin-400-normal.woff2',
      weight: '400',
    },
    {
      path: '../../../../node_modules/@fontsource/barlow/files/barlow-latin-600-normal.woff2',
      weight: '600',
    },
    {
      path: '../../../../node_modules/@fontsource/barlow/files/barlow-latin-700-normal.woff2',
      weight: '700',
    },
  ],
  variable: '--face-ui',
  fallback: ['system-ui', 'sans-serif'],
});

const barlowCondensed = localFont({
  src: '../../../../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2',
  weight: '600',
  variable: '--face-condensed',
  fallback: ['Arial Narrow', 'sans-serif'],
});

const bigShoulders = localFont({
  src: [
    {
      path: '../../../../node_modules/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff2',
      weight: '800',
    },
    {
      path: '../../../../node_modules/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff2',
      weight: '900',
    },
  ],
  variable: '--face-display',
  fallback: ['Arial Narrow', 'sans-serif'],
  // Preloaded and small: it is nearly always there for the first paint. If it is late, the
  // fallback stays for that view instead of swapping and re-wrapping the hero (layout shift).
  display: 'optional',
});

const jetbrainsMono = localFont({
  src: '../../../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2',
  weight: '500',
  variable: '--face-mono',
  fallback: ['ui-monospace', 'monospace'],
  adjustFontFallback: false,
  preload: false,
});

const sairaStencil = localFont({
  src: '../../../../node_modules/@fontsource/saira-stencil-one/files/saira-stencil-one-latin-400-normal.woff2',
  weight: '400',
  variable: '--face-stencil',
  fallback: ['sans-serif'],
  preload: false,
});

export const fontVariables = [barlow, barlowCondensed, bigShoulders, jetbrainsMono, sairaStencil]
  .map((f) => f.variable)
  .join(' ');
