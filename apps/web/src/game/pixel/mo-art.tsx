import { PixelSvg } from './PixelSvg';

/** Foreman Mo's 24x24 pixel map and colours, shared by the animated canvas and the static SVG. */
export const ART = [
  '........OOOOOOOO........',
  '......OOooooooooOO......',
  '.....OooooyyyyooooO.....',
  '....OooooyywwyyooooO....',
  '....OoooooyyyyoooooO....',
  '..OOOOOOOOOOOOOOOOOOOO..',
  '....BbbbbbbbbbbbbbbB....',
  '...BbbkkbbbbbbbbkkbbB...',
  '...BbkwekkkkkkkkwekbB...',
  '...BbbkkbllllllbkkbbB...',
  '..hBbbbbbllllllbbbbbBh..',
  '...hbbbbllllllllbbbbh...',
  '..hBbbbblllppplllbbbBh..',
  '....BbbbllpppppllbbB....',
  '.....BBbbblllllbbBB.....',
  '....ggvvvvvvvvvvvvgg....',
  '...gggvvvvvvvvvvvvggg...',
  '..ggggssssssssssssgggg..',
  '.bbgggvvvvvvvvvvvvgggbb.',
  'cbbbggvvvvvvvvvvvvggbbbc',
  '.cbcggvvvvvvvvvvvvggcbc.',
  '....ggvvvvvvvvvvvvgg....',
  '....ggvvvvvvvvvvvvgg....',
  '....gggggggggggggggg....',
];

export const COLORS: Record<string, string> = {
  O: '#c4501a',
  o: '#ff6b1a',
  y: '#ffb31a',
  w: '#fff6e6',
  B: '#3e2a1e',
  b: '#6b4a35',
  l: '#9a7457',
  p: '#e88a8a',
  k: '#0e1013',
  g: '#39414a',
  v: '#ffb31a',
  s: '#ece7dc',
  c: '#ece7dc',
  h: '#b9b2a5',
  e: '#59626c',
};

/** Foreman Mo as a static SVG (no script), for pages that should not load the game's code. */
export function ForemanMoSvg({ size = 96, label }: { size?: number; label: string }) {
  return <PixelSvg rows={ART} palette={COLORS} size={size} label={label} />;
}
