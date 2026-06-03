# Wall Swatch Source Art Replacement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the four committed wall texture swatches with new hand-made art and bump the renderer swatch size so walls look better.

**Architecture:** The wall renderer (`src/model/terrain/wall.ts`) downscales a source `ImageSource` into a square canvas, then tiles it across a wall mass with a grid-anchored `CanvasPattern`. We swap the source PNG bytes on disk and raise the swatch size constant from 128 to 512 so the larger, detailed art keeps detail and repeats rarely (~16 tiles per wrap). The wide source art is center-cropped to a square (full source height) before the 512 resize so textures keep their drawn proportions (a pure resize squished them ~2.2x vertically). No tool is committed; baking is a one-time manual crop+resize.

**Tech Stack:** TypeScript, Vite, Excalibur.js, `sips` (macOS image resize).

---

### Task 1: Bake the new swatch images

The new source art lives in `.tmp/swatch-1.png` through `.tmp/swatch-4.png` (large, ~1300x589, non-seamless). Resize each to 512x512 square and overwrite the committed swatches.

**Files:**
- Modify (overwrite bytes): `public/images/wall-swatch-1.png` ... `public/images/wall-swatch-4.png`
- Source (uncommitted, do not move): `.tmp/swatch-1.png` ... `.tmp/swatch-4.png`

**Step 1: Confirm source files exist**

Run: `ls -la .tmp/swatch-1.png .tmp/swatch-2.png .tmp/swatch-3.png .tmp/swatch-4.png`
Expected: four files present.

**Step 2: Center-crop each source to a square, then resize to 512x512**

Run:
```bash
for n in 1 2 3 4; do
  cp ".tmp/swatch-$n.png" "public/images/wall-swatch-$n.png"
  h=$(sips -g pixelHeight ".tmp/swatch-$n.png" | awk '/pixelHeight/{print $2}')
  sips -c "$h" "$h" "public/images/wall-swatch-$n.png" >/dev/null
  sips -z 512 512 "public/images/wall-swatch-$n.png" >/dev/null
done
```
Note: `sips -c H W` crops a centered square (full source height); the following `-z` resize keeps proportions undistorted.

**Step 3: Verify output dimensions**

Run: `for n in 1 2 3 4; do sips -g pixelWidth -g pixelHeight "public/images/wall-swatch-$n.png" | grep pixel; done`
Expected: each reports `pixelWidth: 512` and `pixelHeight: 512`.

**Step 4: Commit**

```bash
git add public/images/wall-swatch-1.png public/images/wall-swatch-2.png public/images/wall-swatch-3.png public/images/wall-swatch-4.png
git commit -m "feat: replace wall swatch source art with hand-made textures"
```

---

### Task 2: Bump the renderer swatch size to 512

**Files:**
- Modify: `src/model/terrain/wall.ts:11`

**Step 1: Change the constant**

In `src/model/terrain/wall.ts`, change line 11 from:
```ts
const WALL_TEXTURE_SWATCH = 128;
```
to:
```ts
const WALL_TEXTURE_SWATCH = 512;
```
No other edits. This constant already drives the canvas size, the downscale `drawImage` target, and the pattern phase wrap, so the single change propagates everywhere.

**Step 2: Build**

Run: `node --run build`
Expected: PASS, no type or asset errors.

**Step 3: Run unit tests**

Run: `node --run test:unit`
Expected: PASS. Any rendering snapshot/baseline that fails should be inspected; wall texture changing is expected and intentional.

**Step 4: Commit**

```bash
git add src/model/terrain/wall.ts
git commit -m "feat: enlarge wall texture swatch to 512 for new art"
```

---

### Task 3: Visual check (manual, no subagent)

The dev server is always running. Open the game, build walls of each tier (heights crossing 5/10/15 boundaries to hit tiers 0..3), and confirm the four textures render and tile without an objectionable repeat. If 512 looks wrong, the swatch size constant is the single knob to retune.

---

## Notes

- `src/resources.ts` needs no change: `WallSwatch1..4` already point at `public/images/wall-swatch-*.png`. We only swap the bytes.
- The old `wall-level-*.png` and prior crop approach are untouched; this plan only changes swatch bytes and one constant.
