"""Foreman Mo character sheet (docs/05 2.3 and 2.9): seven poses of the 24x24 pixel mascot.

The base pose is the game's own (packages/sdk/src/art.ts, read here so the two never drift);
each pose replaces a few rows. Writes brand/png/foreman-mo-poses.png.

    python tools/brand/gen_mo_sheet.py
"""

import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ART = (ROOT / "packages" / "sdk" / "src" / "art.ts").read_text(encoding="utf-8")
FONT = ROOT / "node_modules" / "@expo-google-fonts" / "barlow" / "600SemiBold" / "Barlow_600SemiBold.ttf"

BASE = re.findall(r"^\s*'([^']{24})',$", ART.split("export const MO_ART")[1].split("];")[0], re.MULTILINE)
COLORS = dict(re.findall(r"^\s*(\w): '(#[0-9a-f]{6})',$", ART.split("export const MO_COLORS")[1], re.MULTILINE))
COLORS.update({
    "r": "#ff3d2e",  # alarm lamp
    "R": "#ff9a8a",
    "d": "#2ee6d6",  # a drop of sweat
    "x": "#b08a5e",  # core sample: the strata colours
    "z": "#d8c8a0",
    "q": "#7e8288",
    "n": "#8b939c",  # clipboard
})
assert len(BASE) == 24, "MO_ART not found"


def pose(rows: dict[int, str], swap: dict[str, str] | None = None) -> list[str]:
    art = [rows.get(i, row) for i, row in enumerate(BASE)]
    if swap:
        art = ["".join(swap.get(ch, ch) for ch in row) for row in art]
    for i, row in enumerate(art):
        assert len(row) == 24, f"row {i} is {len(row)} wide"
    return art


POSES = [
    ("On shift", pose({})),
    ("Blink", pose({8: BASE[8].replace("w", "e")})),
    ("Over there", pose({
        16: "...gggvvvvvvvvvvvvgggbbc",
        17: "..ggggssssssssssssggggb.",
        18: ".bbgggvvvvvvvvvvvvggg...",
        19: "cbbbggvvvvvvvvvvvvgg....",
        20: ".cbcggvvvvvvvvvvvvgg....",
    })),
    ("Evening, driller", pose({
        9: "c..BbbkkbllllllbkkbbB...",
        10: ".bhBbbbbbllllllbbbbbBh..",
        11: ".b.hbbbbllllllllbbbbh...",
        12: ".bhBbbbblllppplllbbbBh..",
        13: ".b..BbbbllpppppllbbB....",
        14: ".b...BBbbblllllbbBB.....",
        15: ".b..ggvvvvvvvvvvvvgg....",
        16: ".bbgggvvvvvvvvvvvvggg...",
        18: "...gggvvvvvvvvvvvvgggbb.",
        19: "....ggvvvvvvvvvvvvggbbbc",
        20: "....ggvvvvvvvvvvvvggcbc.",
    })),
    ("Alarm", pose({
        2: BASE[2].replace("y", "r"),
        3: BASE[3].replace("y", "r").replace("w", "R"),
        4: BASE[4].replace("y", "r"),
        7: "...BbbkkbbbbbbbbkkbbB.d.",
        8: "...BbkwekkkkkkkkwekbB.d.",
    })),
    ("Core sample", pose({
        19: "cbbbxxzzqqxxzzqqxxzzbbbc",
        20: ".cbcxxzzqqxxzzqqxxzzcbc.",
    })),
    ("Shift log", pose({
        16: "...gggvvvnnnnnnvvvggg...",
        17: "..ggggsssnssssnsssgggg..",
        18: ".bbgggvvvnkkksnvvvgggbb.",
        19: "cbbbggvvvnskkknvvvggbbbc",
        20: ".cbcggvvvnnnnnnvvvggcbc.",
    })),
]

SCALE = 12
CELL = 24 * SCALE
GAP = 32
LABEL = 56
BG = "#16191d"


def main() -> None:
    w = len(POSES) * CELL + (len(POSES) + 1) * GAP
    h = CELL + 2 * GAP + LABEL
    sheet = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(str(FONT), 26)
    for i, (name, art) in enumerate(POSES):
        ox = GAP + i * (CELL + GAP)
        for y, row in enumerate(art):
            for x, ch in enumerate(row):
                if ch != ".":
                    draw.rectangle(
                        [ox + x * SCALE, GAP + y * SCALE, ox + (x + 1) * SCALE - 1, GAP + (y + 1) * SCALE - 1],
                        fill=COLORS[ch],
                    )
        tw = draw.textlength(name, font=font)
        draw.text((ox + (CELL - tw) / 2, GAP + CELL + 14), name, font=font, fill="#ece7dc")
    out = ROOT / "brand" / "png" / "foreman-mo-poses.png"
    sheet.save(out, optimize=True)
    print("wrote", out.relative_to(ROOT))


if __name__ == "__main__":
    main()
