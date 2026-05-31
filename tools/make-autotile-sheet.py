#!/usr/bin/env -S uv run --with Pillow
"""Generate a 16-variant autotile spritesheet from a single wall sprite.

4-bit neighbor mask: top(8) | right(4) | bottom(2) | left(1)
Layout: 4x4 grid, index = mask value, row-major.

Each variant is 64x64. The source sprite is first resized, then for each
edge with a neighbor, the border/battlement is removed and the interior
texture is extended to that edge so adjacent tiles look seamless.
"""

import sys
from pathlib import Path
from PIL import Image

INPUT = Path(__file__).parent.parent / "public/images/wall-level-4.png"
OUTPUT = Path(__file__).parent.parent / "public/images/wall-level-4-autotile.png"

TILE = 64

TOP = 8
RIGHT = 4
BOTTOM = 2
LEFT = 1


def make_variant(src: Image.Image, mask: int) -> Image.Image:
    img = src.copy()
    w, h = img.size  # 64x64
    px = img.load()

    # Edge regions scaled to 64px
    battlement_bottom = 17  # ~26% of 64, where battlements end
    fill_row = 25           # clean body row to sample from
    bottom_clean = 58       # bottom erosion starts
    border_w = 2            # border thickness at 64px scale

    def sample_interior(col: int) -> tuple:
        """Average a few body rows for this column's fill color."""
        colors = []
        for r in [fill_row, fill_row + 5, fill_row + 10, fill_row + 15]:
            if r < h and px[col, r][3] > 128:
                colors.append(px[col, r])
        if not colors:
            return (200, 170, 120, 255)
        return (
            sum(c[0] for c in colors) // len(colors),
            sum(c[1] for c in colors) // len(colors),
            sum(c[2] for c in colors) // len(colors),
            255,
        )

    if mask & TOP:
        for row in range(0, battlement_bottom):
            for col in range(w):
                if px[col, row][3] < 200:
                    px[col, row] = sample_interior(col)
                elif row < 2:
                    px[col, row] = sample_interior(col)

    if mask & BOTTOM:
        for row in range(bottom_clean, h):
            for col in range(w):
                ref_row = bottom_clean - 1
                if px[col, ref_row][3] > 128:
                    px[col, row] = (px[col, ref_row][0], px[col, ref_row][1], px[col, ref_row][2], 255)
                else:
                    px[col, row] = sample_interior(col)

    if mask & LEFT:
        for row in range(h):
            for col in range(0, border_w):
                ref_col = border_w + 1
                if px[ref_col, row][3] > 128:
                    px[col, row] = (px[ref_col, row][0], px[ref_col, row][1], px[ref_col, row][2], max(px[col, row][3], px[ref_col, row][3]))
                elif row < battlement_bottom and (mask & TOP):
                    px[col, row] = sample_interior(ref_col)

    if mask & RIGHT:
        for row in range(h):
            for col in range(w - border_w, w):
                ref_col = w - border_w - 2
                if px[ref_col, row][3] > 128:
                    px[col, row] = (px[ref_col, row][0], px[ref_col, row][1], px[ref_col, row][2], max(px[col, row][3], px[ref_col, row][3]))
                elif row < battlement_bottom and (mask & TOP):
                    px[col, row] = sample_interior(ref_col)

    return img


def main():
    raw = Image.open(INPUT).convert("RGBA")
    # Trim transparent background
    bbox = raw.getbbox()
    trimmed = raw.crop(bbox)
    tw, th = trimmed.size
    # Crop to square (center horizontally if wider, vertically if taller)
    side = min(tw, th)
    left = (tw - side) // 2
    top = (th - side) // 2
    square = trimmed.crop((left, top, left + side, top + side))
    # Resize to tile size with nearest-neighbor for pixel art
    src = square.resize((TILE, TILE), Image.NEAREST)

    margin = 4
    stride = TILE + margin
    sheet = Image.new("RGBA", (stride * 4 - margin, stride * 4 - margin), (0, 0, 0, 0))

    for mask in range(16):
        variant = make_variant(src, mask)
        col = mask % 4
        row = mask // 4
        sheet.paste(variant, (col * stride, row * stride))

    sheet.save(OUTPUT)
    print(f"Wrote {OUTPUT} ({sheet.size[0]}x{sheet.size[1]})")


if __name__ == "__main__":
    main()
