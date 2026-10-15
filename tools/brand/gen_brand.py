"""Mohonaut brand vectors (docs/05 §2.4-2.6, direction A "Casing Wordmark"), as pure SVG paths.

Letters come from Big Shoulders Display Black and Barlow (both SIL OFL, already dependencies of
apps/web) and are converted to outlines, so the files need no font. The first O of MOHONAUT is a
well seen from above: three steel casing rings. Drafts for the founder to refine in Inkscape
(docs/05 §2.8); colours are the palette in docs/05 §2.4.

    sim/.venv/Scripts/python.exe tools/brand/gen_brand.py          (fontTools comes with the sim)
    sim/.venv/Scripts/python.exe tools/brand/gen_brand.py --check  (fail if brand/ is stale)

Writes brand/logo/*.svg and brand/social/*.svg; apps/web/scripts/gen-assets.mjs rasterizes them.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
FONTS = ROOT / "node_modules" / "@expo-google-fonts"
OUT = ROOT / "brand"

ORANGE = "#FF6B1A"
BONE = "#ECE7DC"
CHARCOAL = "#16191D"
STEEL = "#39414A"
CONCRETE = "#8B939C"
CYAN = "#2EE6D6"
AMBER = "#FFB31A"
ALARM = "#FF3D2E"
BLACK = "#0E1013"
STRATA = ["#B08A5E", "#D8C8A0", "#B79A9A", "#7E8288", "#4A4444", "#6E7D3C", "#D2512B", "#FFE27A"]


class Face:
    """One font, its outlines as SVG path data at a given cap height."""

    def __init__(self, path: Path) -> None:
        self.font = TTFont(path)
        self.glyphs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.hmtx = self.font["hmtx"]
        self.cap = self.font["OS/2"].sCapHeight

    def advance(self, ch: str) -> int:
        return self.hmtx[self.cmap[ord(ch)]][0]

    def width(self, text: str, tracking: float = 0.0) -> float:
        return sum(self.advance(c) for c in text) + tracking * (len(text) - 1)

    def path(self, text: str, x: float, baseline: float, scale: float, tracking: float = 0.0) -> str:
        """Outline of `text` with its baseline at (x, baseline), font units times `scale`."""
        out = []
        for ch in text:
            if ch != " ":
                pen = SVGPathPen(self.glyphs)
                # y up in the font, down in SVG
                self.glyphs[self.cmap[ord(ch)]].draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
                out.append(pen.getCommands())
            x += (self.advance(ch) + tracking) * scale
        return " ".join(out)


BLACK_FACE = Face(FONTS / "big-shoulders-display" / "BigShouldersDisplay_900Black.ttf")
BARLOW = Face(FONTS / "barlow" / "400Regular" / "Barlow_400Regular.ttf")


def num(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


def rings(cx: float, cy: float, d: float, outer: str, middle: str, core: str) -> str:
    """The casing mark: outer and middle casing rings and the bore, for a mark of diameter d."""
    s1, s2 = 0.125 * d, 0.106 * d
    r1 = d / 2 - s1 / 2
    r2 = 0.25 * d
    return (
        f'<circle cx="{num(cx)}" cy="{num(cy)}" r="{num(r1)}" fill="none" stroke="{outer}" stroke-width="{num(s1)}"/>'
        f'<circle cx="{num(cx)}" cy="{num(cy)}" r="{num(r2)}" fill="none" stroke="{middle}" stroke-width="{num(s2)}"/>'
        f'<circle cx="{num(cx)}" cy="{num(cy)}" r="{num(0.1 * d)}" fill="{core}"/>'
    )


# ------------------------------------------------------------------ wordmark

TRACK = 40  # font units between letters (Big Shoulders is already tight)


def wordmark(x: float, top: float, cap_px: float, letters: str, ring_colors: tuple[str, str, str],
             ruler: str | None) -> tuple[str, float]:
    """MOHONAUT with the first O as the casing mark; returns (svg, width in px)."""
    f = BLACK_FACE
    scale = cap_px / f.cap
    base = top + cap_px
    side = 80 * scale  # the font's side bearing, kept around the mark
    m_w = (f.advance("M") + TRACK) * scale
    parts = [f'<path d="{f.path("M", x, base, scale)}" fill="{letters}"/>']
    ring_x = x + m_w + side
    parts.append(rings(ring_x + cap_px / 2, top + cap_px / 2, cap_px, *ring_colors))
    rest_x = ring_x + cap_px + side + TRACK * scale
    parts.append(f'<path d="{f.path("HONAUT", rest_x, base, scale, TRACK)}" fill="{letters}"/>')
    width = rest_x - x + f.width("HONAUT", TRACK) * scale - 80 * scale
    if ruler:
        # A thin depth ruler under the word: a line and ticks every eighth, longer every second.
        y = base + 0.16 * cap_px
        lw = 0.035 * cap_px
        parts.append(f'<rect x="{num(x)}" y="{num(y)}" width="{num(width)}" height="{num(lw)}" fill="{ruler}"/>')
        for i in range(17):
            tx = x + i * (width - lw) / 16
            h = (0.12 if i % 2 else 0.2) * cap_px
            parts.append(f'<rect x="{num(tx)}" y="{num(y)}" width="{num(lw)}" height="{num(h)}" fill="{ruler}"/>')
    return "".join(parts), width


def svg(w: float, h: float, body: str, bg: str | None = None) -> str:
    rect = f'<rect width="{num(w)}" height="{num(h)}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{num(w)}" height="{num(h)}" '
            f'viewBox="0 0 {num(w)} {num(h)}">{rect}{body}</svg>\n')


# ------------------------------------------------------------------ monogram


def monogram(size: float, ox: float, oy: float, ring_colors: tuple[str, str, str], line: str, ticks: str) -> str:
    """The icon: the casing mark with the bore dropping below it and four depth ticks (docs/05 §2.6)."""
    d = 0.66 * size
    cx, cy = ox + size / 2, oy + 0.06 * size + d / 2
    lw = 0.07 * size
    top = cy + d / 2 - 0.02 * size
    bottom = oy + 0.97 * size
    parts = [rings(cx, cy, d, *ring_colors),
             f'<rect x="{num(cx - lw / 2)}" y="{num(top)}" width="{num(lw)}" height="{num(bottom - top)}" fill="{line}"/>']
    th = 0.035 * size
    for i in range(4):
        ty = top + (i + 1) * (bottom - top) / 5 - th / 2
        tw = (0.16 if i % 2 == 0 else 0.1) * size
        parts.append(f'<rect x="{num(cx + lw / 2)}" y="{num(ty)}" width="{num(tw)}" height="{num(th)}" fill="{ticks}"/>')
    return "".join(parts)


def bore_log(x: float, y: float, w: float, h: float, marker: float) -> str:
    """Eight lithology bands with the Kola and Moho lines and the cyan "we are here" line."""
    band = h / len(STRATA)
    parts = [f'<rect x="{num(x)}" y="{num(y + i * band)}" width="{num(w)}" height="{num(band)}" fill="{c}"/>'
             for i, c in enumerate(STRATA)]
    parts.append(f'<rect x="{num(x)}" y="{num(y)}" width="{num(w)}" height="{num(h)}" fill="none" stroke="{STEEL}" stroke-width="2"/>')
    for frac in (0.3, 0.62):  # Kola Line, Moho Line
        parts.append(f'<rect x="{num(x)}" y="{num(y + frac * h)}" width="{num(w)}" height="3" fill="{BONE}"/>')
    parts.append(f'<rect x="{num(x - 14)}" y="{num(y + marker * h)}" width="{num(w + 28)}" height="5" fill="{CYAN}"/>')
    return "".join(parts)


def text(face: Face, s: str, x: float, baseline: float, cap_px: float, color: str) -> str:
    return f'<path d="{face.path(s, x, baseline, cap_px / face.cap)}" fill="{color}"/>'


def hazard_band(w: float, h: float, color: str) -> str:
    """A band of diagonal hazard stripes across the top, `h` tall, in `color` on charcoal."""
    parts = [f'<rect width="{num(w)}" height="{num(h)}" fill="{CHARCOAL}"/>']
    step = h * 2
    x = -h
    while x < w:
        parts.append(f'<polygon points="{num(x)},{num(h)} {num(x + h)},0 {num(x + 2 * h)},0 '
                     f'{num(x + h)},{num(h)}" fill="{color}"/>')
        x += step
    return "".join(parts)


# Incident cards for X (docs/05 2.9 and 7.3): 1200 x 675, the status in a word, one plain line,
# where to read more. The full text goes in the post itself (docs/05 7.3 templates).
INCIDENTS = (
    ("delay", "DELAYED", AMBER, ("The new time and the reason are posted on our status page.",),
     "mohonaut.com/status"),
    ("known-issue", "KNOWN ISSUE", AMBER,
     ("On-chain state is fine. Workaround and fix time are on our status page.",),
     "mohonaut.com/status"),
    ("paused", "PAUSED", ALARM,
     ("Guardian pause: it ends by itself within 72 hours.",
      "We never DM you. Ignore any fix or refund link."),
     "mohonaut.com/status"),
    ("mint-limit", "MINT LIMIT REACHED", AMBER,
     ("The contract's hourly safety limit, working as designed.",
      "Minting resumes as the hour rolls on; nothing waits for us."),
     "mohonaut.com/status"),
    ("resolved", "RESOLVED", CYAN, ("Back to normal. A post-mortem follows within 72 hours.",),
     "mohonaut.com/security"),
)


def incident(title: str, color: str, lines: tuple[str, ...], link: str) -> str:
    w, h = 1200, 675
    body, _ = wordmark(72, 64, 44, ORANGE, (ORANGE, BONE, ORANGE), CONCRETE)
    # The title as large as fits the width (at most 150 px cap height).
    cap = min(150, (w - 144) / (BLACK_FACE.width(title) / BLACK_FACE.cap))
    out = hazard_band(w, 24, color) + body + text(BLACK_FACE, title, 72, 380, cap, color)
    for i, line in enumerate(lines):
        out += text(BARLOW, line, 72, 470 + i * 48, 30, BONE)
    out += text(BARLOW, link, 72, 610, 30, CONCRETE)
    return svg(w, h, out, CHARCOAL)


# ------------------------------------------------------------------ files


def files() -> dict[str, str]:
    out: dict[str, str] = {}
    color = (ORANGE, BONE, ORANGE)

    # Wordmark: colour on dark, colour on light, one-colour black and white.
    for name, letters, rc, ruler, bg in (
        ("wordmark", ORANGE, color, ORANGE, None),
        ("wordmark-on-charcoal", ORANGE, color, CONCRETE, CHARCOAL),
        ("wordmark-black", BLACK, (BLACK, BLACK, BLACK), BLACK, None),
        ("wordmark-white", "#FFFFFF", ("#FFFFFF", "#FFFFFF", "#FFFFFF"), "#FFFFFF", None),
    ):
        body, w = wordmark(40, 40, 200, letters, rc, ruler)
        out[f"logo/mohonaut-{name}.svg"] = svg(w + 80, 330, body, bg)

    # Monogram: colour, on charcoal, one-colour.
    out["logo/mohonaut-monogram.svg"] = svg(512, 512, monogram(512, 0, 0, color, ORANGE, BONE))
    out["logo/mohonaut-monogram-on-charcoal.svg"] = svg(
        512, 512, monogram(400, 56, 56, color, ORANGE, BONE), CHARCOAL)
    out["logo/mohonaut-monogram-black.svg"] = svg(512, 512, monogram(512, 0, 0, (BLACK,) * 3, BLACK, BLACK))
    out["logo/mohonaut-monogram-white.svg"] = svg(512, 512, monogram(512, 0, 0, ("#FFFFFF",) * 3, "#FFFFFF", "#FFFFFF"))

    # Horizontal lockup.
    body, w = wordmark(330, 95, 200, ORANGE, color, CONCRETE)
    out["logo/mohonaut-lockup-on-charcoal.svg"] = svg(
        w + 370, 420, monogram(280, 30, 70, color, ORANGE, BONE) + body, CHARCOAL)

    # Small sizes use the casing mark alone: with the bore line and ticks it reads as a key at
    # 16-64 px. Maskable icons keep it inside the 80 % safe circle; X crops the avatar round.
    out["logo/mohonaut-mark.svg"] = svg(512, 512, rings(256, 256, 512, *color))
    out["social/icon.svg"] = svg(512, 512, rings(256, 256, 400, *color), CHARCOAL)
    out["social/icon-maskable.svg"] = svg(512, 512, rings(256, 256, 300, *color), CHARCOAL)
    out["social/x-avatar.svg"] = svg(400, 400, rings(200, 200, 250, *color), CHARCOAL)

    # X banner (1500 x 500): the avatar covers the lower left, so content sits right of 420 px.
    body, w = wordmark(470, 90, 120, ORANGE, color, CONCRETE)
    banner = (body
              + text(BLACK_FACE, "NOT THE MOON. THE MOHO.", 470, 365, 56, BONE)
              + text(BARLOW, "An on-chain idle drilling game. One shared bore.", 470, 420, 24, CONCRETE)
              + bore_log(1330, 40, 90, 420, 0.47))
    out["social/x-banner.svg"] = svg(1500, 500, banner, CHARCOAL)

    # Open Graph (1200 x 630).
    body, w = wordmark(72, 70, 120, ORANGE, color, CONCRETE)
    og = (body
          + text(BLACK_FACE, "NOT THE MOON.", 72, 400, 96, BONE)
          + text(BLACK_FACE, "THE MOHO.", 72, 520, 96, ORANGE)
          + text(BARLOW, "An on-chain idle drilling game. One shared bore.", 72, 585, 26, CONCRETE)
          + bore_log(1050, 40, 90, 550, 0.47))
    out["social/og.svg"] = svg(1200, 630, og, CHARCOAL)

    for name, title, color, lines, link in INCIDENTS:
        out[f"social/incident-{name}.svg"] = incident(title, color, lines, link)
    return out


def main() -> None:
    stale = []
    for rel, content in files().items():
        path = OUT / rel
        if "--check" in sys.argv:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                stale.append(rel)
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
        print("wrote", path.relative_to(ROOT))
    if stale:
        sys.exit("stale brand files (run tools/brand/gen_brand.py): " + ", ".join(stale))


if __name__ == "__main__":
    main()
