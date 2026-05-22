# Gradient Wave Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace flat-colored per-cell wave overlays with Canvas-based bilinear-interpolated gradients so the wave reads as a smooth wash instead of a grid of colored squares.

**Architecture:** Each wave overlay Actor switches from a solid `Color` to a `Canvas` graphic. The canvas computes corner colors by averaging wave heights of the (up to 4) cells sharing each corner, then draws a 2x2 pixel ImageData scaled up with `imageSmoothingEnabled = true` to get free bilinear interpolation from the browser. The `spawnOverlay` signature changes to accept the full frame height grid instead of a single height value.

**Tech Stack:** Excalibur.js Canvas graphic, HTML5 Canvas 2D ImageData

---

### Task 1: Extract wave color function

**Files:**
- Modify: `src/view/wave-renderer.ts:320-337`

**Step 1: Extract the color computation from `spawnOverlay` into a standalone function**

The current inline math (lines 321-324) becomes a reusable function. This function takes a wave height and returns RGBA components as an object (not an Excalibur Color, since we need raw channel values for ImageData).

```ts
function waveColorRGBA(waveHeight: number): { r: number; g: number; b: number; a: number } {
  const t = Math.min((waveHeight - 1) / 8, 1.0);
  const r = Math.round(180 * (1 - t));
  const g = Math.round(220 * (1 - t) + 10);
  const a = 0.25 + t * 0.65;
  return { r, g, b: 255, a };
}
```

Place this as a module-level function above the class, after the existing constants (after line 9).

For height <= 0 (no water / dry neighbor), return transparent: `{ r: 0, g: 0, b: 0, a: 0 }`.

```ts
function waveColorRGBA(waveHeight: number): { r: number; g: number; b: number; a: number } {
  if (waveHeight <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const t = Math.min((waveHeight - 1) / 8, 1.0);
  const r = Math.round(180 * (1 - t));
  const g = Math.round(220 * (1 - t) + 10);
  const a = 0.25 + t * 0.65;
  return { r, g, b: 255, a };
}
```

**Step 2: Verify the build still works**

Run: `npm run build`
Expected: success (function is defined but not yet called differently)

---

### Task 2: Add corner-height averaging helper

**Files:**
- Modify: `src/view/wave-renderer.ts`

**Step 1: Add a function that computes the average wave height for a corner**

Each corner of cell (row, col) is shared by up to 4 cells. The corner height is the average of all cells sharing that corner that have water (height > threshold). If no sharing cells have water, the corner takes the cell's own height.

Add this as a module-level function after `waveColorRGBA`:

```ts
function cornerHeight(
  frame: number[][],
  row: number,
  col: number,
  dRow: number,
  dCol: number,
): number {
  const cells: number[] = [frame[row][col]];
  const nr = row + dRow;
  const nc = col + dCol;
  if (nr >= 0 && nr < frame.length && frame[nr][col] > WATER_RENDER_THRESHOLD) {
    cells.push(frame[nr][col]);
  }
  if (nc >= 0 && nc < frame[0].length && frame[row][nc] > WATER_RENDER_THRESHOLD) {
    cells.push(frame[row][nc]);
  }
  if (nr >= 0 && nr < frame.length && nc >= 0 && nc < frame[0].length && frame[nr][nc] > WATER_RENDER_THRESHOLD) {
    cells.push(frame[nr][nc]);
  }
  let sum = 0;
  for (const v of cells) {
    sum += v;
  }
  return sum / cells.length;
}
```

`dRow`/`dCol` are -1 or +1 indicating which corner: (-1,-1) = top-left, (-1,+1) = top-right, (+1,-1) = bottom-left, (+1,+1) = bottom-right.

**Step 2: Verify the build still works**

Run: `npm run build`
Expected: success

---

### Task 3: Replace `spawnOverlay` with Canvas-based gradient

**Files:**
- Modify: `src/view/wave-renderer.ts:1` (add Canvas import)
- Modify: `src/view/wave-renderer.ts:320-337` (rewrite spawnOverlay)

**Step 1: Add `Canvas` to the Excalibur import**

Change line 1 from:
```ts
import { Scene, Actor, Color, Rectangle, Vector, Text, Font } from 'excalibur';
```
to:
```ts
import { Scene, Actor, Canvas, Color, Rectangle, Vector, Text, Font } from 'excalibur';
```

**Step 2: Change `spawnOverlay` signature and implementation**

New signature: `private spawnOverlay(col: number, row: number, frame: number[][]): Actor`

New implementation:

```ts
private spawnOverlay(col: number, row: number, frame: number[][]): Actor {
  const tl = waveColorRGBA(cornerHeight(frame, row, col, -1, -1));
  const tr = waveColorRGBA(cornerHeight(frame, row, col, -1, 1));
  const bl = waveColorRGBA(cornerHeight(frame, row, col, 1, -1));
  const br = waveColorRGBA(cornerHeight(frame, row, col, 1, 1));

  const size = TILE_SIZE;
  const canvas = new Canvas({
    width: size,
    height: size,
    cache: true,
    draw(ctx: CanvasRenderingContext2D) {
      const img = ctx.createImageData(2, 2);
      const d = img.data;
      // top-left pixel
      d[0] = tl.r; d[1] = tl.g; d[2] = tl.b; d[3] = Math.round(tl.a * 255);
      // top-right pixel
      d[4] = tr.r; d[5] = tr.g; d[6] = tr.b; d[7] = Math.round(tr.a * 255);
      // bottom-left pixel
      d[8] = bl.r; d[9] = bl.g; d[10] = bl.b; d[11] = Math.round(bl.a * 255);
      // bottom-right pixel
      d[12] = br.r; d[13] = br.g; d[14] = br.b; d[15] = Math.round(br.a * 255);

      const tmp = new OffscreenCanvas(2, 2);
      const tmpCtx = tmp.getContext('2d')!;
      tmpCtx.putImageData(img, 0, 0);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tmp, 0, 0, size, size);
    },
  });

  const actor = new Actor({
    pos: new Vector(
      GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
      GRID_TOP + row * TILE_SIZE + TILE_SIZE / 2,
    ),
    width: size,
    height: size,
  });
  actor.graphics.use(canvas);
  this.scene.add(actor);
  return actor;
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: success

---

### Task 4: Update call sites to pass `frame` instead of `waveHeight`

**Files:**
- Modify: `src/view/wave-renderer.ts:38` (advance loop)

**Step 1: Change the `spawnOverlay` call in the advance loop**

Line 38, change:
```ts
const overlay = this.spawnOverlay(col, row, frame[row][col]);
```
to:
```ts
const overlay = this.spawnOverlay(col, row, frame);
```

**Step 2: Run build and unit tests**

Run: `npm run build && npm run test:unit`
Expected: both pass

---

### Task 5: Visual verification

**Step 1: Open the game in browser and play a wave**

The dev server is already running. Open the game, start a level, send a wave. Verify:
- Wave cells show smooth color transitions instead of flat blocks
- Edge borders still render correctly on top
- Wave advance/recede animation still works
- Block flash and overtop bar effects still appear

**Step 2: Commit**

```bash
git add src/view/wave-renderer.ts
git commit -m "feat: gradient wave overlays with bilinear interpolation"
```
