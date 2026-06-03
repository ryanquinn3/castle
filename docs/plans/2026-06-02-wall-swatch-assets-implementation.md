# Wall Swatch Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace runtime wall texture cropping with committed `128x128` wall swatch assets generated from clean interior regions of the existing wall level art.

**Architecture:** A repeatable Python/Pillow tool generates `public/images/wall-swatch-1.png` through `wall-swatch-4.png` from hand-tuned crop rectangles. Runtime wall rendering keeps the existing `CanvasPattern` path, but the cached canvas now copies from the prebuilt swatch resources instead of cropping shaped wall sprites.

**Tech Stack:** TypeScript, Vite, Excalibur `ImageSource`, Vitest, Python with Pillow via `uv` script shebang.

---

## File structure

- Create: `tools/generate-wall-swatches.py`
  - Owns offline swatch generation from `wall-level-1..4.png` into `wall-swatch-1..4.png`.
- Create: `public/images/wall-swatch-1.png`
- Create: `public/images/wall-swatch-2.png`
- Create: `public/images/wall-swatch-3.png`
- Create: `public/images/wall-swatch-4.png`
  - Committed runtime assets consumed by the game.
- Modify: `src/resources.ts`
  - Replace preloaded `WallLevel1..4` runtime resources with `WallSwatch1..4`.
- Modify: `src/model/terrain/wall.ts`
  - Active modular wall implementation. Use swatch resources and a `128x128` pattern phase.
- Modify: `src/model/terrain.ts`
  - Legacy monolithic terrain implementation still covered by `src/model/terrain.test.ts`. Keep it consistent until that file is removed in a separate refactor.
- Modify: `src/model/terrain/wall.test.ts`
  - Update wall sprite expectations to the new swatch resources.
- Modify: `src/model/terrain.test.ts`
  - Update legacy wall sprite expectations to the new swatch resources.

---

### Task 1: Generate committed swatch assets

**Files:**
- Create: `tools/generate-wall-swatches.py`
- Create: `public/images/wall-swatch-1.png`
- Create: `public/images/wall-swatch-2.png`
- Create: `public/images/wall-swatch-3.png`
- Create: `public/images/wall-swatch-4.png`

- [ ] **Step 1: Run the missing generator to verify the red state**

Run:

```bash
./tools/generate-wall-swatches.py
```

Expected: FAIL with `no such file or directory: ./tools/generate-wall-swatches.py` or equivalent shell error.

- [ ] **Step 2: Create the generator**

Create `tools/generate-wall-swatches.py` with this content:

```python
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
```

- [ ] **Step 3: Make the generator executable**

Run:

```bash
chmod +x tools/generate-wall-swatches.py
```

Expected: command exits with status 0.

- [ ] **Step 4: Run the generator**

Run:

```bash
./tools/generate-wall-swatches.py
```

Expected:

```text
Wrote /Users/ryanquinn/repos/castle/public/images/wall-swatch-1.png (128x128)
Wrote /Users/ryanquinn/repos/castle/public/images/wall-swatch-2.png (128x128)
Wrote /Users/ryanquinn/repos/castle/public/images/wall-swatch-3.png (128x128)
Wrote /Users/ryanquinn/repos/castle/public/images/wall-swatch-4.png (128x128)
```

- [ ] **Step 5: Verify the generated image dimensions**

Run:

```bash
file public/images/wall-swatch-1.png public/images/wall-swatch-2.png public/images/wall-swatch-3.png public/images/wall-swatch-4.png
```

Expected: each line contains `PNG image data, 128 x 128, 8-bit/color RGBA`.

- [ ] **Step 6: Commit the generator and generated swatches**

Run:

```bash
git add tools/generate-wall-swatches.py public/images/wall-swatch-1.png public/images/wall-swatch-2.png public/images/wall-swatch-3.png public/images/wall-swatch-4.png
git commit -m "feat: generate wall swatch assets"
```

Expected: commit succeeds and includes only the generator plus four swatch PNGs.

---

### Task 2: Add failing runtime expectations for swatch resources

**Files:**
- Modify: `src/model/terrain/wall.test.ts`
- Modify: `src/model/terrain.test.ts`

- [ ] **Step 1: Update the active wall tests to expect swatch resources**

In `src/model/terrain/wall.test.ts`, replace the two wall sprite tests with:

```ts
  test('sprite returns the tier-1 swatch texture for height 1-5', () => {
    expect(new Wall(3).sprite).toBe(Resources.WallSwatch1);
  });

  test('sprite returns the tier-4 swatch texture for height 16-20', () => {
    expect(new Wall(18).sprite).toBe(Resources.WallSwatch4);
  });
```

- [ ] **Step 2: Update the legacy wall tests to expect swatch resources**

In `src/model/terrain.test.ts`, replace the two wall sprite tests with:

```ts
  test('sprite returns the tier-1 swatch texture for height 1-5', () => {
    expect(new Wall(3).sprite).toBe(Resources.WallSwatch1);
  });

  test('sprite returns the tier-4 swatch texture for height 16-20', () => {
    expect(new Wall(18).sprite).toBe(Resources.WallSwatch4);
  });
```

- [ ] **Step 3: Run tests to verify the expected failure**

Run:

```bash
node --run test:unit -- src/model/terrain/wall.test.ts src/model/terrain.test.ts
```

Expected: FAIL because `Resources.WallSwatch1` and `Resources.WallSwatch4` do not exist yet.

---

### Task 3: Load swatches and replace runtime cropping

**Files:**
- Modify: `src/resources.ts`
- Modify: `src/model/terrain/wall.ts`
- Modify: `src/model/terrain.ts`

- [ ] **Step 1: Update runtime resources**

Replace `src/resources.ts` with:

```ts
import { ImageSource, Loader, Sound } from 'excalibur';
import { TiledResource } from '@excaliburjs/plugin-tiled';

export const Resources = {
  Castle: new ImageSource('./images/castle.png'),
  WallSwatch1: new ImageSource('./images/wall-swatch-1.png'),
  WallSwatch2: new ImageSource('./images/wall-swatch-2.png'),
  WallSwatch3: new ImageSource('./images/wall-swatch-3.png'),
  WallSwatch4: new ImageSource('./images/wall-swatch-4.png'),
  Shovel: new ImageSource('./images/shovel-sprite.png'),
  WallTool: new ImageSource('./images/wall-tool-sprite.png'),
  TowerSprite: new ImageSource('./images/tower-sprite.png'),
  DigSound: new Sound('./sound/dig_sound.mp3'),
  WallToolSound: new Sound('./sound/wall_tool_sound.mp3'),
  WaveSound: new Sound('./sound/wave_sound.mp3'),
} as const;

export const tiledMap = new TiledResource('./map/map.tmx', {
  useExcaliburWiring: false,
  useTilemapCameraStrategy: false,
});

export const loader = new Loader([
  Resources.Castle,
  Resources.WallSwatch1,
  Resources.WallSwatch2,
  Resources.WallSwatch3,
  Resources.WallSwatch4,
  Resources.Shovel,
  Resources.WallTool,
  Resources.TowerSprite,
  Resources.DigSound,
  Resources.WallToolSound,
  Resources.WaveSound,
  tiledMap,
]);
loader.suppressPlayButton = true;
```

- [ ] **Step 2: Update the active wall swatch helper**

In `src/model/terrain/wall.ts`, replace lines 11-60 with:

```ts
const WALL_TEXTURE_SWATCH = 128;
const wallSwatches: (HTMLCanvasElement | null)[] = [null, null, null, null];

// Locked wall-rendering visual params (see .tmp/wall-mass-proto.html).
const WALL_BEVEL_STRENGTH = 0.58;
const WALL_BEVEL_WIDTH_PX = 3;
const WALL_CORNER_RADIUS_PX = 10;
const WALL_OUTLINE_DARKNESS = 0.34;
const WALL_DROP_SHADOW = 0.24;

function wallTextureFor(tierIndex: number): ImageSource {
  const textures = [
    Resources.WallSwatch1,
    Resources.WallSwatch2,
    Resources.WallSwatch3,
    Resources.WallSwatch4,
  ];
  return textures[tierIndex] ?? Resources.WallSwatch1; // bounds-safe (tierIndex is 0..3)
}

// Builds and caches a canvas from the prebuilt swatch texture.
// Returns null until the image has loaded; callers fall back to a flat color.
// Each draw creates its own CanvasPattern so per-tile pattern transforms never share state.
function getWallSwatch(tierIndex: number): HTMLCanvasElement | null {
  const existing = wallSwatches[tierIndex];
  if (existing) {
    return existing;
  }
  const source = wallTextureFor(tierIndex);
  if (!source.isLoaded()) {
    return null;
  }
  const img = source.image;
  const swatch = document.createElement('canvas');
  swatch.width = WALL_TEXTURE_SWATCH;
  swatch.height = WALL_TEXTURE_SWATCH;
  const sctx = swatch.getContext('2d');
  if (!sctx) {
    return null;
  }
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, WALL_TEXTURE_SWATCH, WALL_TEXTURE_SWATCH);
  wallSwatches[tierIndex] = swatch;
  return swatch;
}
```

- [ ] **Step 3: Update the legacy wall swatch helper**

In `src/model/terrain.ts`, replace lines 5-54 with the same helper block:

```ts
const WALL_TEXTURE_SWATCH = 128;
const wallSwatches: (HTMLCanvasElement | null)[] = [null, null, null, null];

// Locked wall-rendering visual params (see .tmp/wall-mass-proto.html).
const WALL_BEVEL_STRENGTH = 0.58;
const WALL_BEVEL_WIDTH_PX = 3;
const WALL_CORNER_RADIUS_PX = 10;
const WALL_OUTLINE_DARKNESS = 0.34;
const WALL_DROP_SHADOW = 0.24;

function wallTextureFor(tierIndex: number): ImageSource {
  const textures = [
    Resources.WallSwatch1,
    Resources.WallSwatch2,
    Resources.WallSwatch3,
    Resources.WallSwatch4,
  ];
  return textures[tierIndex] ?? Resources.WallSwatch1; // bounds-safe (tierIndex is 0..3)
}

// Builds and caches a canvas from the prebuilt swatch texture.
// Returns null until the image has loaded; callers fall back to a flat color.
// Each draw creates its own CanvasPattern so per-tile pattern transforms never share state.
function getWallSwatch(tierIndex: number): HTMLCanvasElement | null {
  const existing = wallSwatches[tierIndex];
  if (existing) {
    return existing;
  }
  const source = wallTextureFor(tierIndex);
  if (!source.isLoaded()) {
    return null;
  }
  const img = source.image;
  const swatch = document.createElement('canvas');
  swatch.width = WALL_TEXTURE_SWATCH;
  swatch.height = WALL_TEXTURE_SWATCH;
  const sctx = swatch.getContext('2d');
  if (!sctx) {
    return null;
  }
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, WALL_TEXTURE_SWATCH, WALL_TEXTURE_SWATCH);
  wallSwatches[tierIndex] = swatch;
  return swatch;
}
```

- [ ] **Step 4: Run the focused wall tests**

Run:

```bash
node --run test:unit -- src/model/terrain/wall.test.ts src/model/terrain.test.ts
```

Expected: PASS for both test files.

- [ ] **Step 5: Commit the green runtime swap**

Run:

```bash
git add src/resources.ts src/model/terrain/wall.ts src/model/terrain.ts src/model/terrain/wall.test.ts src/model/terrain.test.ts
git commit -m "feat: render walls from swatch assets"
```

Expected: commit succeeds with the test expectations and runtime source changes.

---

### Task 4: Verify full checks 

**Files:**
- No source edits unless a check exposes a concrete issue.

- [ ] **Step 1: Run unit tests**

Run:

```bash
node --run test:unit
```

Expected: PASS.

- [ ] **Step 2: Run the build**

Run:

```bash
node --run build
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
node --run lint
```

Expected: PASS.

Expected: Either PASS or screenshot diffs only where wall textures appear. Any TypeScript, runtime, console, navigation, or missing-asset failure is a defect to fix before continuing.

---

## Self-review checklist

- Spec coverage: Task 1 generates committed clean swatches from `wall-level-1..4.png`; Task 3 loads swatches directly and changes pattern phase to `128`; Task 4 verifies tests/build and expected visual changes.
- Runtime scope: wall connectivity, bevels, outlines, rounded corners, cache keys, and per-tile custom drawing stay unchanged.
- Optional polish: `--seam-polish` exists in the tool and is disabled by default.
- Type consistency: resource names are `WallSwatch1`, `WallSwatch2`, `WallSwatch3`, `WallSwatch4` in tests, resources, and wall helper code.
