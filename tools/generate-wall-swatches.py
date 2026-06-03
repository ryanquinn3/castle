#!/usr/bin/env -S uv run --with Pillow
"""Generate clean wall texture swatches from existing wall level art."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


IMG_DIR = Path(__file__).resolve().parent.parent / "public/images"
OUTPUT_SIZE = 128
SEAM_BLEND_WIDTH = 6

# Rectangles are (left, top, width, height). Each one samples interior material
# only, avoiding transparent borders, silhouette edges, bevels, and shadows.
CROP_RECTS = {
    1: (38, 64, 72, 44),
    2: (44, 62, 82, 46),
    3: (45, 61, 84, 46),
    4: (38, 60, 76, 44),
}


def blend_channel(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def blend_pixel(a: tuple[int, int, int, int], b: tuple[int, int, int, int], t: float) -> tuple[int, int, int, int]:
    return tuple(blend_channel(a[i], b[i], t) for i in range(4))


def polish_wrap_seams(image: Image.Image) -> Image.Image:
    """Lightly bring opposite edges closer together for optional tiling cleanup."""

    out = image.copy()
    source = image.load()
    target = out.load()
    last = OUTPUT_SIZE - 1

    for i in range(SEAM_BLEND_WIDTH):
        edge_t = (i + 1) / (SEAM_BLEND_WIDTH + 1)
        left_x = i
        right_x = last - i
        for y in range(OUTPUT_SIZE):
            left = source[left_x, y]
            right = source[right_x, y]
            target[left_x, y] = blend_pixel(left, right, 1 - edge_t)
            target[right_x, y] = blend_pixel(right, left, 1 - edge_t)

    for i in range(SEAM_BLEND_WIDTH):
        edge_t = (i + 1) / (SEAM_BLEND_WIDTH + 1)
        top_y = i
        bottom_y = last - i
        for x in range(OUTPUT_SIZE):
            top = source[x, top_y]
            bottom = source[x, bottom_y]
            target[x, top_y] = blend_pixel(top, bottom, 1 - edge_t)
            target[x, bottom_y] = blend_pixel(bottom, top, 1 - edge_t)

    return out


def generate_tier(tier: int, *, seam_polish: bool) -> Image.Image:
    source_path = IMG_DIR / f"wall-level-{tier}.png"
    source = Image.open(source_path).convert("RGBA")
    left, top, width, height = CROP_RECTS[tier]
    crop = source.crop((left, top, left + width, top + height))
    swatch = crop.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.NEAREST)
    if seam_polish:
        swatch = polish_wrap_seams(swatch)
    return swatch


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate wall swatch textures.")
    parser.add_argument(
        "--seam-polish",
        action="store_true",
        help="Apply light opposite-edge blending after resize.",
    )
    args = parser.parse_args()

    for tier in range(1, 5):
        swatch = generate_tier(tier, seam_polish=args.seam_polish)
        out_path = IMG_DIR / f"wall-swatch-{tier}.png"
        swatch.save(out_path)
        print(f"Wrote {out_path} ({OUTPUT_SIZE}x{OUTPUT_SIZE})")


if __name__ == "__main__":
    main()
