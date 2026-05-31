#!/usr/bin/env -S uv run --with Pillow
"""Generate a wall spritesheet with one row per tier, one column (for now).

Takes the existing wall-level-{1-4}.png sprites, trims transparent padding,
resizes to 64px wide, then crops to the appropriate height proportion.
The wall content is bottom-aligned in each 64x64 cell.

Tier 1 (height 1-5):   ~25% fill
Tier 2 (height 6-10):  ~50% fill
Tier 3 (height 11-15): ~75% fill
Tier 4 (height 16-20): full height (no crop)

Layout: 4 rows x 1 column, 4px margin between cells.
Output: public/images/wall-spritesheet.png
"""

from pathlib import Path
from PIL import Image

IMG_DIR = Path(__file__).parent.parent / "public/images"
TILE = 64
MARGIN = 4

TIER_FILL = [0.25, 0.50, 0.75, 1.0]


def generate_tier(tier: int) -> Image.Image:
    src = Image.open(IMG_DIR / f"wall-level-{tier}.png").convert("RGBA")

    bbox = src.getbbox()
    trimmed = src.crop(bbox)
    tw, th = trimmed.size

    scale = TILE / tw
    new_h = int(th * scale)
    resized = trimmed.resize((TILE, new_h), Image.NEAREST)

    fill_pct = TIER_FILL[tier - 1]
    target_h = int(TILE * fill_pct)
    if resized.size[1] > target_h:
        crop_top = resized.size[1] - target_h
        resized = resized.crop((0, crop_top, TILE, resized.size[1]))

    out = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    out.paste(resized, (0, TILE - resized.size[1]))
    return out


def main():
    cols = 1
    rows = 4
    sheet_w = cols * TILE
    sheet_h = rows * TILE + (rows - 1) * MARGIN
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))

    for tier in range(1, 5):
        tile = generate_tier(tier)
        y = (tier - 1) * (TILE + MARGIN)
        sheet.paste(tile, (0, y))

    out = IMG_DIR / "wall-spritesheet.png"
    sheet.save(out)
    print(f"Wrote {out} ({sheet_w}x{sheet_h})")


if __name__ == "__main__":
    main()
