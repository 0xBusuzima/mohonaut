/**
 * A pixel map drawn as a static SVG (no script): one rect per run of same-coloured pixels on a
 * row. `rows` are strings of palette keys; '.' is empty.
 */
export function PixelSvg({
  rows,
  palette,
  size,
  label,
  dim = false,
}: {
  rows: readonly string[];
  palette: Record<string, string>;
  size: number;
  /** Accessible name; without one the picture is decorative. */
  label?: string;
  /** Draws every pixel in one dark colour (a silhouette of what is not found yet). */
  dim?: boolean;
}) {
  const w = rows[0]?.length ?? 0;
  const rects: { x: number; y: number; w: number; fill: string }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x] ?? '.';
      let run = 1;
      while (row[x + run] === ch) run++;
      const fill = palette[ch];
      if (fill !== undefined) rects.push({ x, y, w: run, fill: dim ? '#262c33' : fill });
      x += run;
    }
  });
  return (
    <svg
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      width={size}
      height={(size * rows.length) / Math.max(1, w)}
      viewBox={`0 0 ${w} ${rows.length}`}
      shapeRendering="crispEdges"
      className="block shrink-0"
    >
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}
