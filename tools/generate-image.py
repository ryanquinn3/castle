# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "openai>=1.68",
#     "pillow>=11",
# ]
# ///

"""Generate an image using OpenAI's Responses API with gpt-5.5 and reference images."""

import argparse
import base64
import logging
import sys
import time
from io import BytesIO
from pathlib import Path

from openai import OpenAI

log = logging.getLogger(__name__)


def encode_image(path: str) -> str:
    data = Path(path).read_bytes()
    b64 = base64.b64encode(data).decode("utf-8")
    suffix = Path(path).suffix.lstrip(".").replace("jpg", "jpeg")
    return f"data:image/{suffix};base64,{b64}"


def main():
    parser = argparse.ArgumentParser(description="Generate an image with reference images and a prompt")
    parser.add_argument("prompt", help="Text prompt describing the desired output")
    parser.add_argument("-r", "--reference", required=True, action="append", help="Reference image path (can specify multiple)")
    parser.add_argument("-o", "--output", default="output.png", help="Output file path (default: output.png)")
    parser.add_argument("-s", "--size", default="1024x1024", choices=["1024x1024", "1536x1024", "1024x1536", "auto"], help="Output size")
    parser.add_argument("-q", "--quality", default="high", choices=["low", "medium", "high", "auto"], help="Quality (default: high)")
    parser.add_argument("--resize", help="Resize output to WxH (e.g. 64x64). Uses nearest-neighbor for pixel art.")
    parser.add_argument("--remove-bg", action="store_true", help="Remove background (replace most common color with transparency)")
    parser.add_argument("--crop-to-content", nargs="?", const="both", choices=["both", "vertical", "horizontal"], help="Crop transparent padding (both, vertical, or horizontal) then stretch to target size")
    args = parser.parse_args()

    for ref in args.reference:
        if not Path(ref).exists():
            print(f"Error: reference image not found: {ref}", file=sys.stderr)
            sys.exit(1)

    client = OpenAI()

    content = [{"type": "input_text", "text": args.prompt}]
    for ref in args.reference:
        content.append({"type": "input_image", "image_url": encode_image(ref)})

    log.info("Calling OpenAI Responses API (model=gpt-5.5, size=%s, quality=%s, references=%d)", args.size, args.quality, len(args.reference))
    start = time.monotonic()

    response = client.responses.create(
        model="gpt-5.5",
        input=[{"role": "user", "content": content}],
        tools=[{
            "type": "image_generation",
            "quality": args.quality,
            "size": args.size,
        }],
    )

    elapsed = time.monotonic() - start
    log.info("Response received in %.1fs (id=%s)", elapsed, response.id)

    image_b64 = None
    for item in response.output:
        if item.type == "image_generation_call":
            image_b64 = item.result
            break

    if not image_b64:
        log.error("No image_generation_call in response output: %s", [item.type for item in response.output])
        print("Error: no image was generated", file=sys.stderr)
        sys.exit(1)

    image_bytes = base64.b64decode(image_b64)
    output = Path(args.output)

    raw_dir = Path("/tmp/generate-image-raw")
    raw_dir.mkdir(exist_ok=True)
    raw_path = raw_dir / output.name
    raw_path.write_bytes(image_bytes)
    print(f"Raw model output saved to {raw_path}")

    from PIL import Image
    img = Image.open(BytesIO(image_bytes))

    if args.remove_bg:
        img = img.convert("RGBA")
        pixels = list(img.getdata())
        from collections import Counter
        rgb_pixels = [(r, g, b) for r, g, b, _a in pixels]
        bg_color = Counter(rgb_pixels).most_common(1)[0][0]
        tolerance = 30
        new_pixels = []
        for r, g, b, a in pixels:
            dist = abs(r - bg_color[0]) + abs(g - bg_color[1]) + abs(b - bg_color[2])
            if dist < tolerance:
                new_pixels.append((r, g, b, 0))
            else:
                new_pixels.append((r, g, b, a))
        img.putdata(new_pixels)
        print(f"Removed background color rgb{bg_color}")

    if args.crop_to_content:
        bbox = img.getbbox()
        if bbox:
            x0, y0, x1, y1 = bbox
            if args.crop_to_content == "vertical":
                img = img.crop((0, y0, img.width, y1))
            elif args.crop_to_content == "horizontal":
                img = img.crop((x0, 0, x1, img.height))
            else:
                img = img.crop(bbox)
            print(f"Cropped to content: {bbox} -> {img.size}")

    if args.resize:
        w, h = (int(x) for x in args.resize.lower().split("x"))
        img = img.resize((w, h), Image.NEAREST)
        print(f"Saved to {output} (resized to {w}x{h})")
    else:
        print(f"Saved to {output}")

    img.save(output)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    main()
