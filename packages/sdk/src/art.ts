/**
 * Foreman Mo (docs/05 §2.3), the one mascot, as a 24x24 pixel map: one string per row, one
 * character per pixel ('.' is empty), coloured by MO_COLORS. Shared by the game (animated canvas
 * and static SVG) and the API's share card, so he looks the same everywhere.
 */
export const MO_ART: readonly string[] = [
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

export const MO_COLORS: Readonly<Record<string, string>> = {
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
