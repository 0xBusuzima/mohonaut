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

/** Foreman Mo as a static SVG (no script): one rect per run of same-coloured pixels. */
export function ForemanMoSvg({ size = 96, label }: { size?: number; label: string }) {
  const rects: { x: number; y: number; w: number; fill: string }[] = [];
  ART.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x] ?? '.';
      let w = 1;
      while (row[x + w] === ch) w++;
      const fill = COLORS[ch];
      if (fill !== undefined) rects.push({ x, y, w, fill });
      x += w;
    }
  });
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
    >
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}
