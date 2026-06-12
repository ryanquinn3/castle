# Pressure Water Render + Live Wiring (M2b) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Prerequisite:** M2a (`2026-06-12-pressure-water-m2a-simulation-core.md`) is landed — `WaterComponent` (with `depth`/`vel`/`col`/`row`), the pure `computeFluxStep` kernel, the `WaterCell` actor, and `WaveDynamicSystem` all exist and are green.

**Goal:** Make the pressure simulation visible and live. Decouple `WaveOverlay` from `WaveSegment`, render the water field through the existing shader, and wire it into Tide behind `PRESSURE_WATER_ENABLED`. The default (flag off) path stays unchanged.

**Architecture:** `WaveOverlay` becomes a dumb buffer + shader, driven externally: a coverage *provider* for the legacy column path (supplied by `WaveActorRuntime` from its own segment set) and `setCoverage(rgba)` for the field path. `WaveRenderSystem` reads `WaterComponent`s (the contract M2a defined), rebuilds a 2D depth grid, rasterizes it (`buildFieldCoverageData`), and calls `overlay.setCoverage`. `WaveFieldRuntime` orchestrates `WaveDynamicSystem` + `WaveRenderSystem` + an overlay behind the flag, mirroring `WaveActorRuntime`'s `playWave(spawns) -> WaveActorRuntimeResult` contract so Tide's `runWave` swaps it in with a one-line branch.

**Tech Stack:** TypeScript, Excalibur 0.32, Vitest (unit `*.test.ts` jsdom; browser `*.browser.test.ts` Playwright). See `docs/testing.md`.

**Repo conventions:** Work on the current branch (`feat/pressure-model`; no worktrees, per `AGENTS.md`). **Commit after each task** (committing is authorized; commit runs `static-check` as the pre-commit gate). Do not push unless the user asks. Fast loop: `node --run test:unit`. Full gate: `node --run static-check`. Single file: `node --run test:unit -- <file>` / `node --run test:browser -- <file>`. Curly braces on all `if`s; `for..of` over index loops; object arguments for 3+ params; check LSP diagnostics after each edit.

---

## Background the executor needs

- **`WaveOverlay`** (`src/wave/wave-overlay.ts`):
  - Constructor takes `{ gridLeft, gridTop, tileSize, width, height }`; computes `pixelW = width * tileSize`, `pixelH = (height + 1) * tileSize` (the `+1` is the ocean row above the grid; `overlayTop = gridTop - tileSize`). `onInitialize` installs the `WAVE_FRAGMENT_SOURCE` shader material reading `r=depth`, `g=foam/edge`, `b=coverage`; a `Canvas` graphic `putImageData`s `this.currentImageData`.
  - Today `onPreUpdate()` self-collects `WaveSegment` actors (`actor instanceof WaveSegment`, line 275) into `SegmentData[]` and calls the column-centric `buildCoverageData(...)`. **This is the only `WaveSegment` coupling in the overlay** (import at line 2). `buildCoverageData` + `SegmentData` live in `wave-overlay.ts`, do NOT depend on `WaveSegment`, and are unit-tested in `src/wave/wave-overlay.test.ts`. Task 1 inverts this; `buildCoverageData` stays put and its tests are untouched.
- **`WaveActorRuntime`** (`src/wave/wave-actor-runtime.ts`) owns the legacy path: in `playWave` it creates the overlay (lines 49–56), tracks segments in `this.actors: Set<WaveSegment>`, and has `this.grid` (the `WaveSegmentGrid`). After Task 1 it feeds the overlay's coverage provider from `this.actors`.
- **Tide session wave flow** (`src/tide-session.ts`, the pilot mode):
  - `runWave()` (~lines 272–395) builds `spawns` via `generateWaveSegmentSpawns({...})`, then (lines 321–328) constructs `this.waveRuntime = new WaveActorRuntime(this, this.makeWaveGridAdapter(), new WaveEventApplier(this.grid, this.sandLayer), TERRAIN_SLOPE)` and `const result = await this.waveRuntime.playWave(spawns)`. `result` is a `WaveActorRuntimeResult` (`{ castleFlooded, erodedTiles, sandRedistributed }`). Cleanup calls appear in the gameover branch (~line 357) and teardown (~lines 437–438).
  - `makeWaveGridAdapter()` (lines 223–233) returns a `WaveSegmentGrid`: `{ gridLeft, gridTop, tileSize, height, getElevation(col,row), effectiveHoleDepth(col,row), isCastle(col,row) }` — has `height` but NOT width; derive width from `spawns.length`.
  - `TERRAIN_SLOPE` is imported from `config.ts` (used at line 326). `spawns[].initialDepth` is the per-column source depth; M2b uses a **flat** source `D = Math.max(...spawns.map(s => s.initialDepth))` (the multi-peak profile is M5).
- **`WaveDynamicSystem`** (from M2a, `src/wave/wave-dynamic-system.ts`) takes an options object `{ scene, width, height, sourceDepth, groundAt, gridLeft, gridTop, tileSize, surgeWindowMs?, onComplete? }`, registers via `scene.world.add(system)`, runs at `static priority = -1`, and exposes `clear()` to kill all water actors.
- **`WaveRenderSystem` ordering:** flux runs at priority `-1`; the render system uses default priority `0`, so it runs after the sim each frame. Both are `SystemType.Update`.
- **`src/wave-visual-baseline.browser.test.ts`** boots Tide and screenshots a wave at peak reach (triggered via the `W` hotkey). Reuse its boot pattern for Task 5; do not re-roll engine setup.
- **Testing:** browser project for anything with a real `World`/overlay/scene; unit project for pure rasterizer math. Browser fixture: `import { test, expect } from "../test/excalibur-browser-test.ts"`.

---

## Task 1: Decouple WaveOverlay from WaveSegment

Invert the overlay's dependency so it is a dumb buffer + shader, driven externally. The legacy column path keeps working via a coverage provider supplied by `WaveActorRuntime`.

**Files:**
- Modify: `src/wave/wave-overlay.ts`
- Modify: `src/wave/wave-actor-runtime.ts`
- (Unchanged) `src/wave/wave-overlay.test.ts` — `buildCoverageData` stays exported from `wave-overlay.ts`.

**Step 1: Rewrite the overlay's driving surface**

In `src/wave/wave-overlay.ts`:

1. Remove the `WaveSegment` import (line 2). Keep the `WaveState` import (used by `SegmentData`). Keep `buildCoverageData` and `SegmentData` exactly as they are.
2. Make `pixelW`/`pixelH` public `readonly` so the driver can size buffers:

```ts
  readonly pixelW: number;
  readonly pixelH: number;
```

3. Add a coverage provider field, a setter, and a test accessor (near the other fields / methods):

```ts
  /** When set, called each frame to produce the overlay buffer (legacy column path). */
  coverageProvider: (() => Uint8ClampedArray) | null = null;

  /** Drive the overlay buffer directly (field render path). */
  setCoverage(rgba: Uint8ClampedArray): void {
    this.currentImageData = new ImageData(
      rgba as Uint8ClampedArray<ArrayBuffer>,
      this.pixelW,
      this.pixelH,
    );
  }

  /** Test helper: the last image data computed for the overlay. */
  debugImageData(): ImageData | null {
    return this.currentImageData;
  }
```

4. Replace the entire `onPreUpdate()` body (the `instanceof WaveSegment` scan + `buildCoverageData` call) with:

```ts
  override onPreUpdate(): void {
    if (this.coverageProvider) {
      this.setCoverage(this.coverageProvider());
    }
  }
```

The overlay no longer imports or references `WaveSegment`.

**Step 2: Drive the provider from `WaveActorRuntime`**

In `src/wave/wave-actor-runtime.ts`:

1. Import the helpers (still exported from the overlay):

```ts
import { WaveOverlay, buildCoverageData, type SegmentData } from './wave-overlay.ts';
```

2. Where the overlay is created in `playWave` (currently lines 49–56), capture pixel dims and wire the provider:

```ts
      const gridWidth = spawns.reduce((max, s) => Math.max(max, s.col + 1), 0);
      const pixelW = gridWidth * this.grid.tileSize;
      const pixelH = (this.grid.height + 1) * this.grid.tileSize;
      this.overlay = new WaveOverlay({
        gridLeft: this.grid.gridLeft,
        gridTop: this.grid.gridTop,
        tileSize: this.grid.tileSize,
        width: gridWidth,
        height: this.grid.height,
      });
      this.overlay.coverageProvider = () => this.buildSegmentCoverage(pixelW, pixelH);
      this.scene.add(this.overlay);
```

3. Add the provider method (iterates the runtime's own segment set — no scene-wide scan):

```ts
  private buildSegmentCoverage(pixelW: number, pixelH: number): Uint8ClampedArray {
    const segments: SegmentData[] = [];
    for (const seg of this.actors) {
      segments.push({
        col: seg.col,
        pixelY: seg.pos.y - this.grid.gridTop + this.grid.tileSize,
        currentDepth: seg.currentDepth,
        state: seg.derivedState,
        tileSize: this.grid.tileSize,
      });
    }
    return buildCoverageData(segments, pixelW, pixelH);
  }
```

**Step 3: Verify the legacy render path is unchanged**

Run: `node --run test:unit -- src/wave/wave-overlay.test.ts`
Expected: PASS, unchanged.

Run: `node --run test:browser -- src/wave-visual-baseline.browser.test.ts`
Expected: PASS — the wave still renders identically (same `buildCoverageData` inputs, now sourced from `this.actors`).

**Step 4: Lint + typecheck + full suite**

Run: `node --run static-check`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/wave/wave-overlay.ts src/wave/wave-actor-runtime.ts
git commit -m "refactor(wave): drive WaveOverlay externally, decoupling it from WaveSegment"
```

---

## Task 2: 2D field rasterizer (buildFieldCoverageData)

Pure function turning a 2D depth grid into the overlay's RGBA buffer (shader reads `r=depth`, `g=foam`, `b=coverage`, `a`).

**Files:**
- Create: `src/wave/water-field-coverage.ts`
- Create (test): `src/wave/water-field-coverage.test.ts` (unit)

**Step 1: Write the failing test**

`src/wave/water-field-coverage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFieldCoverageData } from "./water-field-coverage.ts";

const TILE = 4;
const emptyGrid = (w: number, h: number) =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => 0));

describe("buildFieldCoverageData", () => {
  it("produces an RGBA buffer sized (height+1) rows tall", () => {
    const depths = emptyGrid(3, 4);
    const rgba = buildFieldCoverageData({ depths, gridWidth: 3, gridHeight: 4, tileSize: TILE });
    expect(rgba.length).toBe(3 * TILE * ((4 + 1) * TILE) * 4);
  });

  it("is fully transparent when dry", () => {
    const rgba = buildFieldCoverageData({ depths: emptyGrid(3, 4), gridWidth: 3, gridHeight: 4, tileSize: TILE });
    let maxAlpha = 0;
    for (let i = 3; i < rgba.length; i += 4) {
      maxAlpha = Math.max(maxAlpha, rgba[i]);
    }
    expect(maxAlpha).toBe(0);
  });

  it("writes depth (R) + alpha over a wet cell, transparent far away", () => {
    const depths = emptyGrid(3, 6);
    depths[2][1] = 6;
    const rgba = buildFieldCoverageData({ depths, gridWidth: 3, gridHeight: 6, tileSize: TILE });
    const pixelW = 3 * TILE;
    const at = (px: number, py: number) => (py * pixelW + px) * 4;
    const cx = 1 * TILE + TILE / 2;
    const cy = (2 + 1) * TILE + TILE / 2; // +1 ocean band offset
    expect(rgba[at(cx, cy)]).toBeGreaterThan(0);
    expect(rgba[at(cx, cy) + 3]).toBeGreaterThan(0);
    expect(rgba[at(0, (5 + 1) * TILE + TILE / 2) + 3]).toBe(0);
  });
});
```

**Step 2: Run to verify it fails**

Run: `node --run test:unit -- src/wave/water-field-coverage.test.ts`
Expected: FAIL, cannot resolve `./water-field-coverage.ts`.

**Step 3: Write the implementation**

`src/wave/water-field-coverage.ts`:

```ts
const DEPTH_NORMALIZE = 9;
const FOAM_DEPTH_SCALE = 2;

export interface FieldCoverageInput {
  /** Water depth per cell, indexed [row][col]; 0 where dry. */
  depths: number[][];
  gridWidth: number;
  gridHeight: number;
  tileSize: number;
}

/**
 * Rasterize a 2D depth field into the wave overlay's RGBA buffer, bilinearly
 * sampling cell-center depths for a smooth surface. Channels match the overlay
 * shader: R = normalized depth, G = front foam, B = coverage, A = alpha. The
 * buffer is (gridHeight + 1) rows tall; grid row r occupies pixel band r+1 (the
 * top band is the ocean row above the grid).
 */
export function buildFieldCoverageData(input: FieldCoverageInput): Uint8ClampedArray {
  const { depths, gridWidth, gridHeight, tileSize } = input;
  const pixelW = gridWidth * tileSize;
  const pixelH = (gridHeight + 1) * tileSize;
  const data = new Uint8ClampedArray(pixelW * pixelH * 4);

  const depthAt = (col: number, row: number): number => {
    if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight) {
      return 0;
    }
    return depths[row][col];
  };

  for (let py = 0; py < pixelH; py++) {
    const gy = py / tileSize - 1 - 0.5; // fractional grid row at cell centers
    const r0 = Math.floor(gy);
    const ty = gy - r0;
    for (let px = 0; px < pixelW; px++) {
      const gx = px / tileSize - 0.5;
      const c0 = Math.floor(gx);
      const tx = gx - c0;

      const top = depthAt(c0, r0) * (1 - tx) + depthAt(c0 + 1, r0) * tx;
      const bot = depthAt(c0, r0 + 1) * (1 - tx) + depthAt(c0 + 1, r0 + 1) * tx;
      const depth = top * (1 - ty) + bot * ty;
      if (depth <= 0) {
        continue;
      }

      const foam = Math.max(0, Math.min(1, (depth - bot) / FOAM_DEPTH_SCALE));
      const idx = (py * pixelW + px) * 4;
      data[idx] = Math.round(Math.min(depth / DEPTH_NORMALIZE, 1) * 255);
      data[idx + 1] = Math.round(foam * 255);
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  return data;
}
```

**Step 4: Run to verify it passes**

Run: `node --run test:unit -- src/wave/water-field-coverage.test.ts`
Expected: PASS (3 tests).

**Step 5: Lint + typecheck**

Run: `node --run static-check`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/wave/water-field-coverage.ts src/wave/water-field-coverage.test.ts
git commit -m "feat(wave): 2D field rasterizer for the water overlay"
```

---

## Task 3: WaveRenderSystem

Reads `WaterComponent`s, builds a 2D depth grid, rasterizes, and drives the decoupled overlay via `setCoverage`.

**Files:**
- Create: `src/wave/wave-render-system.ts`
- Create (test): `src/wave/wave-render-system.browser.test.ts`

**Step 1: Write the failing test**

`src/wave/wave-render-system.browser.test.ts`:

```ts
import { expect, test } from "../test/excalibur-browser-test.ts";
import { Entity, Vector } from "excalibur";
import { WaterComponent } from "./water-component.ts";
import { WaveOverlay } from "./wave-overlay.ts";
import { WaveRenderSystem } from "./wave-render-system.ts";

test("rasterizes WaterComponents into the overlay each tick", async ({ ctx }) => {
  const overlay = new WaveOverlay({ gridLeft: 0, gridTop: 32, tileSize: 16, width: 3, height: 6 });
  ctx.scene.add(overlay);

  ctx.scene.world.add(
    new WaveRenderSystem({ scene: ctx.scene, overlay, gridWidth: 3, gridHeight: 6, tileSize: 16 }),
  );
  ctx.scene.world.add(
    new Entity({ components: [new WaterComponent({ depth: 5, vel: new Vector(0, 1), col: 1, row: 2 })] }),
  );

  ctx.step(16);

  const data = overlay.debugImageData();
  expect(data).not.toBeNull();
  let maxAlpha = 0;
  for (let i = 3; i < data!.data.length; i += 4) {
    maxAlpha = Math.max(maxAlpha, data!.data[i]);
  }
  expect(maxAlpha).toBeGreaterThan(0);
});
```

**Step 2: Run to verify it fails**

Run: `node --run test:browser -- src/wave/wave-render-system.browser.test.ts`
Expected: FAIL, cannot resolve `./wave-render-system.ts`.

**Step 3: Write the implementation**

`src/wave/wave-render-system.ts`:

```ts
import { System, SystemType, type Scene } from "excalibur";
import { WaterComponent } from "./water-component.ts";
import { buildFieldCoverageData } from "./water-field-coverage.ts";
import type { WaveOverlay } from "./wave-overlay.ts";

export interface WaveRenderSystemOptions {
  scene: Scene;
  overlay: WaveOverlay;
  gridWidth: number;
  gridHeight: number;
  tileSize: number;
}

/**
 * Reads WaterComponents (the sim/render contract), rebuilds a 2D depth grid,
 * rasterizes it, and pushes the buffer to the overlay. Runs after
 * WaveDynamicSystem (default priority 0 > flux's -1).
 */
export class WaveRenderSystem extends System {
  readonly systemType = SystemType.Update;

  private readonly query;
  private readonly overlay: WaveOverlay;
  private readonly gridWidth: number;
  private readonly gridHeight: number;
  private readonly tileSize: number;

  constructor(opts: WaveRenderSystemOptions) {
    super();
    this.overlay = opts.overlay;
    this.gridWidth = opts.gridWidth;
    this.gridHeight = opts.gridHeight;
    this.tileSize = opts.tileSize;
    this.query = opts.scene.world.query([WaterComponent]);
  }

  update(): void {
    const depths = Array.from({ length: this.gridHeight }, () =>
      new Array<number>(this.gridWidth).fill(0),
    );
    for (const entity of this.query.entities) {
      const w = entity.get(WaterComponent)!;
      if (w.row >= 0 && w.row < this.gridHeight && w.col >= 0 && w.col < this.gridWidth) {
        depths[w.row][w.col] = w.depth;
      }
    }
    this.overlay.setCoverage(
      buildFieldCoverageData({
        depths,
        gridWidth: this.gridWidth,
        gridHeight: this.gridHeight,
        tileSize: this.tileSize,
      }),
    );
  }
}
```

**Step 4: Run to verify it passes**

Run: `node --run test:browser -- src/wave/wave-render-system.browser.test.ts`
Expected: PASS.

**Step 5: Lint + typecheck + full suite**

Run: `node --run static-check`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/wave/wave-render-system.ts src/wave/wave-render-system.browser.test.ts
git commit -m "feat(wave): WaveRenderSystem drives the overlay from WaterComponents"
```

---

## Task 4: WaveFieldRuntime + flag + Tide wiring

Orchestrate both systems behind `PRESSURE_WATER_ENABLED`, with the same `playWave(spawns) -> WaveActorRuntimeResult` contract as `WaveActorRuntime`, and branch Tide's `runWave` onto it.

**Files:**
- Create: `src/wave/wave-field-runtime.ts`
- Create (test): `src/wave/wave-field-runtime.browser.test.ts`
- Modify: `src/config.ts` (the flag)
- Modify: `src/tide-session.ts`

**Step 1: Add the flag to `src/config.ts`**

```ts
/** Pressure-driven water: master flag gating the field simulation path (off by default). */
export const PRESSURE_WATER_ENABLED = false;
```

**Step 2: Write the failing test — `src/wave/wave-field-runtime.browser.test.ts`**

```ts
import { expect, test } from "../test/excalibur-browser-test.ts";
import { page } from "vitest/browser";
import { TERRAIN_SLOPE } from "../config.ts";
import { WaterComponent } from "./water-component.ts";
import { WaveFieldRuntime } from "./wave-field-runtime.ts";
import type { WaveSegmentGrid } from "./wave-segment-types.ts";

const flatGrid = (): WaveSegmentGrid => ({
  gridLeft: 0,
  gridTop: 32,
  tileSize: 16,
  height: 16,
  getElevation: () => 0,
  effectiveHoleDepth: () => 0,
  isCastle: () => false,
});

const spawnsFor = (numCols: number, depth: number) =>
  Array.from({ length: numCols }, (_, col) => ({
    col,
    x: col * 16,
    y: 0,
    initialDepth: depth,
    speed: 0,
    maxTravelDistance: 0,
  }));

test("runs a full surge+drain wave and resolves when empty", async ({ ctx }) => {
  const runtime = new WaveFieldRuntime(ctx.scene, flatGrid(), TERRAIN_SLOPE, { surgeWindowMs: 200 });
  const done = runtime.playWave(spawnsFor(16, 4));

  let sawWater = false;
  for (let i = 0; i < 800 && !sawWater; i++) {
    ctx.step(16);
    sawWater = ctx.scene.world.query([WaterComponent]).entities.length > 0;
  }
  expect(sawWater).toBe(true);
  await page.screenshot();

  for (let i = 0; i < 1200; i++) {
    ctx.step(16);
  }

  const result = await done;
  expect(result).toMatchObject({ castleFlooded: false, sandRedistributed: false });
  expect(result.erodedTiles).toEqual([]);
  expect(ctx.scene.world.query([WaterComponent]).entities.length).toBe(0);
});
```

**Step 3: Run to verify it fails**

Run: `node --run test:browser -- src/wave/wave-field-runtime.browser.test.ts`
Expected: FAIL, cannot resolve `./wave-field-runtime.ts`.

**Step 4: Write the implementation — `src/wave/wave-field-runtime.ts`**

```ts
import type { Scene } from "excalibur";
import { WaterComponent } from "./water-component.ts";
import { WaveDynamicSystem } from "./wave-dynamic-system.ts";
import { WaveRenderSystem } from "./wave-render-system.ts";
import { WaveOverlay } from "./wave-overlay.ts";
import type {
  WaveActorRuntimeResult,
  WaveSegmentGrid,
  WaveSegmentSpawn,
} from "./wave-segment-types.ts";

/**
 * Orchestrates the pressure-driven water path: builds the overlay, registers the
 * dynamic (sim) + render systems, opens the source for a surge window, and
 * resolves when no water remains. Mirrors WaveActorRuntime's playWave contract so
 * sessions swap it in behind a flag. M2 scope is flat ground: no erosion,
 * pooling, or castle flooding yet (M3/M4), so the result reports no terrain change.
 */
export class WaveFieldRuntime {
  private dynamicSystem: WaveDynamicSystem | null = null;
  private renderSystem: WaveRenderSystem | null = null;
  private overlay: WaveOverlay | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly grid: WaveSegmentGrid,
    private readonly terrainSlope: number,
    private readonly options: { surgeWindowMs?: number } = {},
  ) {}

  playWave(spawns: WaveSegmentSpawn[]): Promise<WaveActorRuntimeResult> {
    if (spawns.length === 0) {
      return Promise.resolve({ castleFlooded: false, erodedTiles: [], sandRedistributed: false });
    }

    const width = spawns.length;
    const sourceDepth = Math.max(...spawns.map((s) => s.initialDepth));

    this.overlay = new WaveOverlay({
      gridLeft: this.grid.gridLeft,
      gridTop: this.grid.gridTop,
      tileSize: this.grid.tileSize,
      width,
      height: this.grid.height,
    });
    this.scene.add(this.overlay);

    this.renderSystem = new WaveRenderSystem({
      scene: this.scene,
      overlay: this.overlay,
      gridWidth: width,
      gridHeight: this.grid.height,
      tileSize: this.grid.tileSize,
    });

    return new Promise((resolve) => {
      this.dynamicSystem = new WaveDynamicSystem({
        scene: this.scene,
        width,
        height: this.grid.height,
        sourceDepth,
        groundAt: (col, row) => this.terrainSlope * row + this.grid.getElevation(col, row),
        gridLeft: this.grid.gridLeft,
        gridTop: this.grid.gridTop,
        tileSize: this.grid.tileSize,
        surgeWindowMs: this.options.surgeWindowMs,
        onComplete: () => {
          resolve({ castleFlooded: false, erodedTiles: [], sandRedistributed: false });
          this.cleanup();
        },
      });

      // Dynamic (priority -1) registered before render so it runs first.
      this.scene.world.add(this.dynamicSystem);
      this.scene.world.add(this.renderSystem!);
    });
  }

  cleanup(): void {
    this.dynamicSystem?.clear();
    if (this.dynamicSystem) {
      this.scene.world.remove(this.dynamicSystem);
      this.dynamicSystem = null;
    }
    if (this.renderSystem) {
      this.scene.world.remove(this.renderSystem);
      this.renderSystem = null;
    }
    if (this.overlay) {
      this.scene.remove(this.overlay);
      this.overlay = null;
    }
    for (const entity of this.scene.world.query([WaterComponent]).entities) {
      entity.kill();
    }
  }
}
```

**Step 5: Wire the flag into Tide's `runWave` (`src/tide-session.ts`)**

Add imports near the existing wave imports:

```ts
import { WaveFieldRuntime } from './wave/wave-field-runtime.ts';
import { PRESSURE_WATER_ENABLED } from './config.ts';
```

Add a field alongside `private waveRuntime` (line 49):

```ts
  private waterRuntime: WaveFieldRuntime | null = null;
```

Replace the runtime construction + play (lines 321–328) with a branch:

```ts
    this.waveRuntime?.cleanup();
    this.waterRuntime?.cleanup();
    let result;
    if (PRESSURE_WATER_ENABLED) {
      this.waterRuntime = new WaveFieldRuntime(this, this.makeWaveGridAdapter(), TERRAIN_SLOPE);
      result = await this.waterRuntime.playWave(spawns);
    } else {
      this.waveRuntime = new WaveActorRuntime(
        this,
        this.makeWaveGridAdapter(),
        new WaveEventApplier(this.grid, this.sandLayer),
        TERRAIN_SLOPE,
      );
      result = await this.waveRuntime.playWave(spawns);
    }
```

Next to each existing `this.waveRuntime?.cleanup(); this.waveRuntime = null;` (gameover branch ~line 357, teardown ~lines 437–438), add `this.waterRuntime?.cleanup(); this.waterRuntime = null;` so the field path tears down on the same lifecycle events.

**Step 6: Run the runtime test + full suite**

Run: `node --run test:browser -- src/wave/wave-field-runtime.browser.test.ts`
Expected: PASS; a screenshot showing inland water lands in `test-results/screenshots/`.

Run: `node --run static-check`
Expected: PASS. Confirm Tide still plays normally with the flag off.

**Step 7: Commit**

```bash
git add src/wave/wave-field-runtime.ts src/wave/wave-field-runtime.browser.test.ts src/config.ts src/tide-session.ts
git commit -m "feat(wave): WaveFieldRuntime behind PRESSURE_WATER_ENABLED in Tide"
```

---

## Task 5: Flag-on visual baseline (full Tide boot)

A browser test that boots Tide and screenshots a field wave advancing inland, mirroring `src/wave-visual-baseline.browser.test.ts`.

**Files:**
- Read first: `src/wave-visual-baseline.browser.test.ts` (copy its boot pattern; do not invent engine setup)
- Create (test): `src/wave-field-visual-baseline.browser.test.ts`

**Step 1: Read the existing baseline** to learn how it boots Tide, triggers a wave (the `W` hotkey), waits for peak reach, and screenshots.

**Step 2: Write the new baseline.** Because `PRESSURE_WATER_ENABLED` is a compile-time const (stays `false`), force the field path for this test by driving a `WaveFieldRuntime` on the live Tide scene with synthetic flat spawns, then screenshot at peak reach. Model assertions on the existing baseline (water visible; `WaterComponent` actors exist at peak). Keep it to "renders inland water without throwing," not pixel equality. Reuse the shared harness / baseline helpers — do not duplicate engine bootstrapping.

**Step 3: Run + screenshot**

Run: `node --run test:browser -- src/wave-field-visual-baseline.browser.test.ts`
Expected: PASS; screenshot shows water reaching ~8 rows inland on flat ground.

**Step 4: Lint + typecheck + full suite**

Run: `node --run static-check`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/wave-field-visual-baseline.browser.test.ts
git commit -m "test(wave): flag-on visual baseline for field water on flat ground"
```

---

## Final verification

Run the full gate and confirm green before declaring M2b done:

Run: `node --run static-check`
Expected: PASS (tsc, lint, unit, knip, browser).

Manually confirm the default path: with `PRESSURE_WATER_ENABLED = false`, Tide plays exactly as before (legacy `WaveActorRuntime`; overlay now driven by the runtime's coverage provider, same pixels). Flip the const to `true` locally only to eyeball the field path in the running dev server, then revert it (M2b ships with the flag **off**).

## Definition of done

- `WaveOverlay` no longer imports or references `WaveSegment`; it is driven by a coverage provider (legacy) or `setCoverage` (field). Legacy rendering is pixel-identical.
- `buildFieldCoverageData` rasterizes a 2D depth field; unit-tested.
- `WaveRenderSystem` reads `WaterComponent`s and drives the overlay through the existing shader.
- Behind `PRESSURE_WATER_ENABLED`, `WaveFieldRuntime` runs a full surge→drain wave inland on flat ground in Tide, resolving the same `WaveActorRuntimeResult` contract; the wave ends when no `WaterComponent` actors remain.
- Default (flag-off) behavior unchanged; `node --run static-check` green; knip reports no dead code.

## Notes for the executor

- **The sim/render contract is `WaterComponent` and nothing else.** `WaveDynamicSystem` writes it (via `WaterCell` actors); `WaveRenderSystem` reads it. Neither references the other.
- **Keep the legacy path intact and pixel-identical.** Task 1 only relocates the segment scan into `WaveActorRuntime`'s provider; `buildCoverageData` is unchanged. The visual baseline is the regression guard.
- **Scope discipline (YAGNI):** flat ground only. No wall blocking/overtopping, no hole pooling, no castle flooding, no erosion — M3/M4. `WaveEventApplier` is intentionally NOT wired into `WaveFieldRuntime` yet; it returns a no-terrain-change result.
- **Do not touch the engine's global timestep.** The fixed step lives in `WaveDynamicSystem` (M2a).
- **`WaveSegment`, `WaveActorRuntime`, and the column `buildCoverageData`** all stay until M5 cuts over and deletes the scripted `WaveSegment` (at which point `WaterCell` is the only water actor and names can converge).
- Single-file runners are verified; use them for the red/green loop, with `static-check` as the full gate.
```
