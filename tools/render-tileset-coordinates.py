#!/usr/bin/env -S uv run --with Pillow
"""Render row,col labels over a tileset image."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DEFAULT_TILE_SIZE = 16
DEFAULT_SCALE = 4
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_DIR = REPO_ROOT / ".tmp"


def default_output_path(input_path: Path) -> Path:
    return DEFAULT_OUTPUT_DIR / f"{input_path.stem}-coordinates{input_path.suffix}"


def label_anchor(tile_size: int, text_width: int, text_height: int, col: int, row: int) -> tuple[int, int]:
    x = col * tile_size + (tile_size - text_width) // 2
    y = row * tile_size + (tile_size - text_height) // 2
    return x, y


def draw_text_with_outline(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font: ImageFont.ImageFont) -> None:
    x, y = xy
    outline = (0, 0, 0, 230)
    fill = (255, 255, 255, 255)
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


def load_font(tile_size: int) -> ImageFont.ImageFont:
    font_size = max(10, tile_size // 4)
    try:
        return ImageFont.truetype("DejaVuSansMono.ttf", font_size)
    except OSError:
        return ImageFont.load_default()


def draw_grid(draw: ImageDraw.ImageDraw, width: int, height: int, tile_size: int) -> None:
    line = (0, 0, 0, 120)
    for x in range(0, width + 1, tile_size):
        draw.line((x, 0, x, height), fill=line)
    for y in range(0, height + 1, tile_size):
        draw.line((0, y, width, y), fill=line)


def render_coordinates(input_path: Path, output_path: Path, tile_size: int, scale: int, show_grid: bool) -> None:
    if tile_size <= 0:
        raise ValueError("tile size must be greater than 0")
    if scale <= 0:
        raise ValueError("scale must be greater than 0")

    image = Image.open(input_path).convert("RGBA")
    if scale != 1:
        image = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)

    rendered_tile_size = tile_size * scale
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = load_font(rendered_tile_size)

    if show_grid:
        draw_grid(draw, image.width, image.height, rendered_tile_size)

    cols = image.width // rendered_tile_size
    rows = image.height // rendered_tile_size

    for row in range(rows):
        for col in range(cols):
            text = f"{row},{col}"
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            xy = label_anchor(rendered_tile_size, text_width, text_height, col, row)
            draw_text_with_outline(draw, xy, text, font)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.alpha_composite(image, overlay).save(output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render row,col coordinate labels over a tileset.")
    parser.add_argument("input", type=Path, help="Tileset image path")
    parser.add_argument("-o", "--output", type=Path, help="Output image path (default: .tmp/<input>-coordinates.<ext>)")
    parser.add_argument("--tile-size", type=int, default=DEFAULT_TILE_SIZE, help="Tile size in pixels (default: 16)")
    parser.add_argument("--scale", type=int, default=DEFAULT_SCALE, help="Nearest-neighbor output scale (default: 4)")
    parser.add_argument("--no-grid", action="store_true", help="Hide tile grid lines")
    args = parser.parse_args()

    input_path = args.input
    output_path = args.output or default_output_path(input_path)
    render_coordinates(input_path, output_path, args.tile_size, args.scale, not args.no_grid)
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
