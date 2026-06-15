# Pressure Water Erosion via Flux Projection (M4) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Prerequisite:** M3 (`2026-06-12-pressure-water-m3-terrain.md`) is landed — `computeFluxStep`, `WaterCell` + `WaveDynamicSystem` (with the `onResolveCells` hook), `WaveRenderSystem`, `applyTerrainFeedback`, and `WaveFieldRuntime` (wired into Tide behind `PRESSURE_WATER_ENABLED` with a `WaveEventApplier`) all exist and are green with the flag off.

**Goal:** Erode walls and towers in the pressure-driven field, driven by the water's flux vector projected onto each face. A direct (frontal) hit erodes faster than a glancing (shear) hit, with a continuous gradient between. Wall HP (`WALL_LEVEL_HP`) and tower hit counts (`TOWER_HITS_PER_EROSION`) are respected via each terrain's existing `applyHits(count)`. The default (flag-off) path stays unchanged.

**Architecture:** The flux kernel (`computeFluxStep`) **stays pure and untouched** — it already produces a per-cell velocity vector. A new pure module `wave-erosion.ts` exposes `computeErosionHits`: it scans the wet cells, projects each cell's velocity onto any adjacent erodible (wall/tower) face as a frontal term (flow *into* the face) plus a small shear term (flow *parallel past* it), accumulates a per-face "charge" across frames (threaded in and out, no hidden state), and emits the whole-number part as discrete `hits`. `WaveFieldRuntime` runs this each frame inside its existing `onResolveCells` hook, emits a new `{ type: 'eroded', col, row, hits }` event per face, and a new `GridModel.applyErosionHits(col, row, hits)` (mirroring `applyWaveWaterHit` minus the depth gate) applies them through `WaveEventApplier`.

**Design decisions (confirmed with the user):**
- **New `eroded` event + `applyErosionHits`, not reused `tileEntered`.** The velocity charge is the sole gate, so erosion routes through a dedicated `{ type: 'eroded'; col; row; hits }` event and `GridModel.applyErosionHits(col, row, count)` (which calls `cell.applyHits(count)` with no depth gate). The legacy `tileEntered → applyWaveWaterHit` path is left intact for `WaveActorRuntime`.
- **Realized velocity is the erosion signal — by design.** The kernel produces ~0 outflow *into* a fully-blocking wall (its `out` term is `max(0, head − neighborHead)` and a tall wall's `neighborHead` is huge), so tall blocking walls naturally resist erosion, while an **overtopped** wall (water flowing over it) takes frontal erosion proportional to that flow. This reproduces the legacy `surfaceLevel − elev ≥ 2` gate organically: low/shallow water against a tall wall does not erode it.
- **Charge → discrete hits.** Per face, `charge += frontalCoeff·frontalFlux + shearCoeff·shearFlux` each frame; when `charge ≥ 1`, `floor(charge)` hits are emitted and the fraction carries over. Frontal cells accumulate faster, so they erode faster — a continuous gradient, mapped onto the discrete `applyHits` model.
- **Sand redistribution (`blocked`/`overtopped`) is intentionally NOT ported.** See "Deferred / out of scope" below. `WaveFieldRuntime` reports `sandRedistributed: false`.

**Tech Stack:** TypeScript, Excalibur 0.32, Vitest (unit `*.test.ts` jsdom; browser `*.browser.test.ts` Playwright). See `docs/testing.md`.

**Repo conventions:** Work on the current branch (`feat/pressure-model`; no worktrees, per `AGENTS.md`). **Commit after each task** (committing is authorized; commit runs `static-check` as the pre-commit gate). Do not push unless the user asks. Fast loop: `node --run test:unit`. Full gate: `node --run static-check`. Single file: `node --run test:unit -- <file>` / `node --run test:browser -- <file>`. Curly braces on all `if`s; `for..of` over index loops; object arguments for 3+ params; check LSP diagnostics after each edit.

---

## Background the executor needs

### How velocity reaches the runtime (verified)

- `computeFluxStep` (`src/wave/wave-dynamic-system.ts`) populates `velX`/`velY` on every returned `WetCell` from the per-edge outflow (`bump(velX, k, dc*out)` / `bump(velY, k, dr*out)`). The sign convention: positive `velY` = southward (`dr = +1`), positive `velX` = eastward (`dc = +1`).
- `WaveDynamicSystem.update` runs the kernel, then (M3) calls `onResolveCells(cells)` **with the post-flux `WetCell[]`** (full `velX`/`velY` intact) *before* reconciling onto actors. M4 does erosion inside that same hook, so the velocity field is available with no new plumbing.
- `WaveFieldRuntime.resolveTerrain(cells, applier)` is the M3 hook body. M4 extends it: compute erosion first (from the full velocity field), then run the existing hole-absorb + castle-flood feedback.

### The erosion model the field must preserve (verified in `src/model/`)

- `GridModel.applyWaveWaterHit(col, row, depth)` (`grid-model.ts:285`) is the legacy erosion entry: gates on `depth − cell.elevation < 2`, then `cell.applyHits(1)`; if the cell's `elevation` reaches 0 it swaps in `FlatGround`, else `refreshGraphics`; always `detectPools()`. Returns `ErosionResult | null` (`{ col, row, newElevation }`). M4's `applyErosionHits` mirrors this **without the depth gate** and passing a variable `count`.
- `Wall.applyHits(count)` (`wall.ts:105`): `hp -= count`; if `hp > 0` returns `null`; else `level = 0` and returns `{ newElevation: 0 }`. `WALL_LEVEL_HP = [15, 45, 90, 150]`.
- `Tower.applyHits(count)` (`tower.ts:54`): `hitCount += count`; while `hitCount >= TOWER_HITS_PER_EROSION (10)` and `towerHeight > 0`, drop one height. Returns `{ newElevation: towerHeight }` if it dropped, else `null`. **Accumulates across calls**, so feeding it small per-frame counts is correct.
- `GridModel.getElevation(col, row)` returns the cell's elevation: `FlatGround` = 0, `Wall`/`Tower` > 0, `Hole` < 0. So **`getElevation(col,row) > 0 ⟺ erodible (wall/tower)`** is the discriminator for `isErodible`. The castle stays `FlatGround` (elevation 0), so it is never erodible; `applyErosionHits` also re-checks `isCastle` defensively (mirroring `applyWaveWaterHit`).
- `grid.placeWall(col, row, level)` swaps in a `Wall(level)`; `grid.getElevation` reflects it immediately.

### `WaveEventApplier` and the result type (verified)

- `WaveEventApplier.apply(event)` (`wave-event-applier.ts`) is a type-switch ending in a fall-through that handles `tileEntered` via `applyWaveWaterHit`. M4 adds an explicit `eroded` branch **before** that fall-through; the fall-through then only ever sees `tileEntered`, unchanged.
- `WaveSegmentEvent` and `WaveActorRuntimeResult` live in `wave-segment-types.ts`. `WaveActorRuntimeResult` is `{ castleFlooded, erodedTiles: Terrain[], sandRedistributed: boolean }`. M3 fills `castleFlooded`; M4 fills `erodedTiles` (deduped) and leaves `sandRedistributed: false`.

### Testing split

- Pure logic (`computeErosionHits`) → unit `*.test.ts` (jsdom; operates on plain `WetCell[]` + injected lookups, no Excalibur).
- Anything needing a real `World`/`Scene`/`GridModel` actors (`applyErosionHits`, the runtime) → browser `*.browser.test.ts` via `import { test, expect } from "../test/excalibur-browser-test.ts"` (`ctx` gives `scene`, `step(ms)`).

---

## Task 1: `computeErosionHits` — pure flux-projection erosion

A pure function over `WetCell[]` and an `isErodible` predicate (no Excalibur, no `GridModel`), unit-tested first. It projects each wet cell's velocity onto adjacent erodible faces, accumulates per-face charge (threaded in via `acc`, out via the result), and emits whole-number `hits`.

**Files:**
- Create: `src/wave/wave-erosion.ts`
- Create (test): `src/wave/wave-erosion.test.ts` (unit)

**Step 1: Write the failing test — `src/wave/wave-erosion.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { WetCell } from "./wave-dynamic-system.ts";
import { computeErosionHits } from "./wave-erosion.ts";

const cell = (col: number, row: number, velX: number, velY: number): WetCell => ({
  col,
  row,
  depth: 1,
  velX,
  velY,
});

// A single erodible face at (1, 3).
const erodibleAt13 = (col: number, row: number): boolean => col === 1 && row === 3;

describe("computeErosionHits", () => {
  it("charges a face more from frontal flow than from glancing (shear) flow", () => {
    // North neighbor flowing straight south into the face: pure frontal.
    const frontal = computeErosionHits({
      cells: [cell(1, 2, 0, 0.4)],
      isErodible: erodibleAt13,
      acc: new Map(),
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
    });
    // West neighbor flowing south past the face: pure shear (parallel).
    const shear = computeErosionHits({
      cells: [cell(0, 3, 0, 0.4)],
      isErodible: erodibleAt13,
      acc: new Map(),
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
    });

    expect(frontal.acc.get("1:3")!).toBeGreaterThan(shear.acc.get("1:3")! * 5);
  });

  it("emits the whole-number part as hits and carries the fraction over", () => {
    const res = computeErosionHits({
      cells: [cell(1, 2, 0, 1.0)], // frontal flux 1.0 * frontalCoeff 0.8 = 0.8
      isErodible: erodibleAt13,
      acc: new Map([["1:3", 0.7]]), // 0.7 carried in -> 1.5 total
      frontalCoeff: 0.8,
      shearCoeff: 0.05,
    });
    expect(res.hits).toEqual([{ col: 1, row: 3, hits: 1 }]);
    expect(res.acc.get("1:3")).toBeCloseTo(0.5);
  });

  it("emits nothing while charge stays below 1 and accumulates it", () => {
    const res = computeErosionHits({
      cells: [cell(1, 2, 0, 0.4)],
      isErodible: erodibleAt13,
      acc: new Map(),
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
    });
    expect(res.hits).toEqual([]);
    expect(res.acc.get("1:3")).toBeCloseTo(0.2);
  });

  it("ignores flow toward non-erodible neighbors", () => {
    const res = computeErosionHits({
      cells: [cell(1, 2, 0, 0.4)],
      isErodible: () => false,
      acc: new Map(),
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
    });
    expect(res.hits).toEqual([]);
    expect(res.acc.size).toBe(0);
  });

  it("does not mutate the input accumulator", () => {
    const acc = new Map([["1:3", 0.9]]);
    computeErosionHits({
      cells: [cell(1, 2, 0, 0.4)],
      isErodible: erodibleAt13,
      acc,
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
    });
    expect(acc.get("1:3")).toBe(0.9);
  });
});
```

**Step 2: Run to verify it fails**

Run: `node --run test:unit -- src/wave/wave-erosion.test.ts`
Expected: FAIL, cannot resolve `./wave-erosion.ts`.

**Step 3: Write the implementation — `src/wave/wave-erosion.ts`**

```ts
import type { WetCell } from "./wave-dynamic-system.ts";

export interface ErosionHit {
  col: number;
  row: number;
  hits: number;
}

export interface ErosionInput {
  cells: WetCell[];
  /** A wall or tower face that can be eroded (elevation > 0, not castle). */
  isErodible: (col: number, row: number) => boolean;
  /** Carry-over fractional erosion charge per "col:row" face, threaded across frames. */
  acc: Map<string, number>;
  /** Charge per unit of flux driven straight into a face. Tuning knob. */
  frontalCoeff: number;
  /** Charge per unit of flux running parallel past a face (<< frontal). Tuning knob. */
  shearCoeff: number;
}

export interface ErosionOutput {
  hits: ErosionHit[];
  /** Updated carry-over accumulator (a new Map; the input is not mutated). */
  acc: Map<string, number>;
}

// Directions from a wet cell to a candidate face neighbour.
const DIRS = [
  { dc: 0, dr: -1 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: 1, dr: 0 },
];

/**
 * Projected-flux erosion. Each wet cell contributes to an adjacent erodible
 * (wall/tower) face: the velocity component pointing INTO the face is frontal
 * erosion, the orthogonal component sliding PAST it is shear (weighted far
 * lower). Charge accumulates per face across frames; once it crosses an integer
 * the whole part is emitted as discrete `hits` (consumed as wall HP / tower
 * hit-count) and the fraction carries over.
 *
 * Pure: terrain enters only through `isErodible`, and the accumulator is threaded
 * in and out rather than held as hidden state. The kernel produces ~0 inflow
 * velocity into a fully-blocking wall, so tall walls resist erosion while
 * overtopped walls take flow-proportional frontal erosion — matching the legacy
 * `surfaceLevel - elev >= 2` gate without re-checking depth here.
 */
export function computeErosionHits(input: ErosionInput): ErosionOutput {
  const { cells, isErodible, acc, frontalCoeff, shearCoeff } = input;
  const charge = new Map<string, number>(acc);

  for (const cell of cells) {
    for (const { dc, dr } of DIRS) {
      const fc = cell.col + dc;
      const fr = cell.row + dr;
      if (!isErodible(fc, fr)) {
        continue;
      }
      // Component of this cell's velocity directed at the face (frontal) and the
      // orthogonal component sliding past it (shear).
      const frontal = Math.max(0, cell.velX * dc + cell.velY * dr);
      const shear = dc !== 0 ? Math.abs(cell.velY) : Math.abs(cell.velX);
      const add = frontalCoeff * frontal + shearCoeff * shear;
      if (add <= 0) {
        continue;
      }
      const k = `${fc}:${fr}`;
      charge.set(k, (charge.get(k) ?? 0) + add);
    }
  }

  const hits: ErosionHit[] = [];
  for (const [k, value] of charge) {
    const whole = Math.floor(value);
    if (whole < 1) {
      continue;
    }
    const [col, row] = k.split(":").map(Number);
    hits.push({ col, row, hits: whole });
    charge.set(k, value - whole);
  }

  return { hits, acc: charge };
}
```

**Step 4: Run to verify it passes**

Run: `node --run test:unit -- src/wave/wave-erosion.test.ts`
Expected: PASS (5 tests).

**Step 5: Lint + typecheck**

Run: `node --run static-check`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/wave/wave-erosion.ts src/wave/wave-erosion.test.ts
git commit -m "feat(wave): pure flux-projection erosion (computeErosionHits)"
```

---

## Task 2: `eroded` event + `GridModel.applyErosionHits` + applier branch

Add the new event to the vocabulary, the gateless grid mutation that applies a hit count, and the applier branch that routes them. Mirrors `applyWaveWaterHit` without the depth gate.

**Files:**
- Modify: `src/wave/wave-segment-types.ts`
- Modify: `src/model/grid-model.ts`
- Modify: `src/wave/wave-event-applier.ts`
- Create (test): `src/model/grid-model-erosion.browser.test.ts`

**Step 1: Add the `eroded` event to `src/wave/wave-segment-types.ts`**

Add to the `WaveSegmentEvent` union (after the `dissipated` line):

```ts
  | { type: 'eroded'; col: number; row: number; hits: number }
```

**Step 2: Write the failing test — `src/model/grid-model-erosion.browser.test.ts`**

```ts
import { expect, test } from "../test/excalibur-browser-test.ts";
import { WALL_LEVEL_HP } from "../config.ts";
import { GridModel } from "./grid-model.ts";

const buildGrid = (scene: import("excalibur").Scene): GridModel =>
  new GridModel(
    { width: 3, height: 6, castleCol: 0, castleRow: 0, castleWidth: 1, castleHeight: 1 },
    scene,
  );

test("applyErosionHits drops a wall to flat ground once HP is exhausted", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);
  grid.placeWall(1, 3, 1); // L1 wall: elevation 5, HP 15
  expect(grid.getElevation(1, 3)).toBe(5);

  expect(grid.applyErosionHits(1, 3, WALL_LEVEL_HP[0] - 1)).toBeNull(); // survives at 1 HP
  expect(grid.getElevation(1, 3)).toBe(5);

  const result = grid.applyErosionHits(1, 3, 1); // the killing hit
  expect(result).toMatchObject({ col: 1, row: 3, newElevation: 0 });
  expect(grid.getElevation(1, 3)).toBe(0);
});

test("applyErosionHits is a no-op for non-positive counts and out-of-bounds", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);
  grid.placeWall(1, 3, 1);
  expect(grid.applyErosionHits(1, 3, 0)).toBeNull();
  expect(grid.applyErosionHits(99, 99, 5)).toBeNull();
  expect(grid.getElevation(1, 3)).toBe(5);
});
```

**Step 3: Run to verify it fails**

Run: `node --run test:browser -- src/model/grid-model-erosion.browser.test.ts`
Expected: FAIL — `applyErosionHits` does not exist.

**Step 4: Add `applyErosionHits` to `src/model/grid-model.ts`**

Add directly below `applyWaveWaterHit` (around line 308):

```ts
  /**
   * Applies a discrete erosion hit count to a wall/tower, bypassing the depth
   * gate (the pressure field's velocity charge is the gate). Mirrors
   * applyWaveWaterHit's terrain mutation: swap to FlatGround at elevation 0, else
   * refresh graphics; always re-detect pools.
   */
  applyErosionHits(col: number, row: number, hits: number): ErosionResult | null {
    if (hits <= 0 || !this.inBounds(col, row) || this.isCastle(col, row)) {
      return null;
    }

    const cell = this.cells[row][col];
    const result = cell.applyHits(hits);
    if (!result) {
      return null;
    }

    if (cell.elevation === 0) {
      this.setCell(col, row, new FlatGround());
    } else {
      this.refreshGraphics(col, row);
    }
    this.detectPools();
    return { col, row, newElevation: result.newElevation };
  }
```

**Step 5: Add the `eroded` branch to `src/wave/wave-event-applier.ts`**

Insert **before** the final fall-through (the `const erosionResult = this.grid.applyWaveWaterHit(...)` block):

```ts
    if (event.type === 'eroded') {
      const erosionResult = this.grid.applyErosionHits(event.col, event.row, event.hits);
      result.erodedTile = erosionResult ? this.grid.getCell(event.col, event.row) : null;
      return result;
    }
```

(The fall-through now only ever receives `tileEntered`, so its `event.depth` access stays valid.)

**Step 6: Run to verify it passes**

Run: `node --run test:browser -- src/model/grid-model-erosion.browser.test.ts`
Expected: PASS (2 tests).

**Step 7: Lint + typecheck + full suite**

Run: `node --run static-check`
Expected: PASS.

**Step 8: Commit**

```bash
git add src/wave/wave-segment-types.ts src/model/grid-model.ts src/wave/wave-event-applier.ts src/model/grid-model-erosion.browser.test.ts
git commit -m "feat(wave): eroded event + GridModel.applyErosionHits (gateless hit count)"
```

---

## Task 3: Wire erosion into `WaveFieldRuntime`

Add the erosion coefficients, run `computeErosionHits` each frame in the existing hook, emit `eroded` events through the applier, and resolve real `erodedTiles`.

**Files:**
- Modify: `src/config.ts`
- Modify: `src/wave/wave-field-runtime.ts`
- Create (test): `src/wave/wave-field-runtime-erosion.browser.test.ts`

**Step 1: Add erosion coefficients to `src/config.ts`**

Add next to the other `PRESSURE_*` constants:

```ts
/** Pressure erosion: charge per unit of flux driven straight into a wall/tower face. Feel knob. */
export const PRESSURE_EROSION_FRONTAL_COEFF = 0.5;
/** Pressure erosion: charge per unit of flux running parallel past a face (glancing/shear, << frontal). Feel knob. */
export const PRESSURE_EROSION_SHEAR_COEFF = 0.05;
```

**Step 2: Write the failing test — `src/wave/wave-field-runtime-erosion.browser.test.ts`**

```ts
import { expect, test } from "../test/excalibur-browser-test.ts";
import { TERRAIN_SLOPE } from "../config.ts";
import { GridModel } from "../model/grid-model.ts";
import { WaterComponent } from "./water-component.ts";
import { WaveEventApplier } from "./wave-event-applier.ts";
import { WaveFieldRuntime } from "./wave-field-runtime.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave-segment-types.ts";

const HEIGHT = 16;
const WIDTH = 3;

const buildGrid = (scene: import("excalibur").Scene): GridModel =>
  new GridModel(
    { width: WIDTH, height: HEIGHT, castleCol: 1, castleRow: 11, castleWidth: 1, castleHeight: 1 },
    scene,
  );

const adapterFor = (grid: GridModel): WaveSegmentGrid => ({
  gridLeft: 0,
  gridTop: 32,
  tileSize: 16,
  height: HEIGHT,
  getElevation: (c, r) => grid.getElevation(c, r),
  effectiveHoleDepth: (c, r) => grid.effectiveHoleDepth(c, r),
  isCastle: (c, r) => grid.isCastle(c, r),
});

const spawnsFor = (depth: number): WaveSegmentSpawn[] =>
  Array.from({ length: WIDTH }, (_, col) => ({ col, x: 0, y: 0, initialDepth: depth, speed: 0, maxTravelDistance: 0 }));

test("a wave erodes a low wall in its path and reports the eroded tile", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);
  grid.placeWall(1, 3, 1); // L1 wall (elevation 5, HP 15) just south of the source

  const runtime = new WaveFieldRuntime(ctx.scene, adapterFor(grid), TERRAIN_SLOPE, {
    surgeWindowMs: 3000,
    applier: new WaveEventApplier(grid),
  });
  const done = runtime.playWave(spawnsFor(9)); // strong, sustained head overtops + erodes the wall

  for (let i = 0; i < 2000; i++) {
    ctx.step(16);
  }
  const result = await done;

  expect(grid.getElevation(1, 3)).toBe(0); // wall fully eroded -> FlatGround
  expect(result.erodedTiles.length).toBeGreaterThan(0);
  expect(result.sandRedistributed).toBe(false);
  expect(ctx.scene.world.query([WaterComponent]).entities.length).toBe(0);
});

test("flat-ground waves still erode nothing", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);

  const runtime = new WaveFieldRuntime(ctx.scene, adapterFor(grid), TERRAIN_SLOPE, {
    surgeWindowMs: 300,
    applier: new WaveEventApplier(grid),
  });
  const done = runtime.playWave(spawnsFor(4)); // reaches ~row 8, no terrain

  for (let i = 0; i < 1000; i++) {
    ctx.step(16);
  }
  const result = await done;

  expect(result.erodedTiles).toEqual([]);
  expect(result.castleFlooded).toBe(false);
});
```

> If the first test's wall does not fully erode within the step budget, raise `surgeWindowMs`/source depth in the test or bump `PRESSURE_EROSION_FRONTAL_COEFF` — these are the feel knobs. Do **not** lower the kernel `COEFF`.

**Step 3: Run to verify it fails**

Run: `node --run test:browser -- src/wave/wave-field-runtime-erosion.browser.test.ts`
Expected: FAIL — the runtime never erodes, so `erodedTiles` is empty and the wall keeps elevation 5.

**Step 4: Wire the runtime — `src/wave/wave-field-runtime.ts`**

Add to the imports:

```ts
import {
  PRESSURE_CASTLE_FLOOD_DEPTH,
  PRESSURE_DRAIN_THRESHOLD,
  PRESSURE_EROSION_FRONTAL_COEFF,
  PRESSURE_EROSION_SHEAR_COEFF,
} from "../config.ts";
import { computeErosionHits } from "./wave-erosion.ts";
import type { Terrain } from "../model/terrain/terrain.ts";
```

(Keep the existing `applyTerrainFeedback`, `WaveDynamicSystem`/`WetCell`, etc. imports.)

Update the class doc comment to reflect M4 (replace the M3 "Erosion and sand redistribution remain M4..." sentence):

```ts
/**
 * Orchestrates the pressure-driven water path: builds the overlay, registers the
 * dynamic (sim) + render systems, opens the source for a surge window, and
 * resolves when no water remains. Mirrors WaveActorRuntime's playWave contract so
 * sessions swap it in behind a flag. When an applier is supplied, terrain feedback
 * runs each frame: holes absorb water into puddleDepth (M3), a flooded castle ends
 * the wave (M3), and walls/towers erode from the projected flux vector (M4). Sand
 * redistribution (blocked/overtopped sloughing) is not ported, so the result still
 * reports sandRedistributed: false.
 */
```

Add the erosion state fields next to `castleFlooded`:

```ts
  private castleFlooded = false;
  private erosionAcc = new Map<string, number>();
  private readonly erodedTiles = new Set<Terrain>();
```

In `playWave`, reset the new state next to the existing `this.castleFlooded = false;`:

```ts
    this.castleFlooded = false;
    this.erosionAcc = new Map();
    this.erodedTiles.clear();
```

In the `onComplete` callback, resolve the real eroded tiles:

```ts
        onComplete: () => {
          resolve({
            castleFlooded: this.castleFlooded,
            erodedTiles: [...this.erodedTiles],
            sandRedistributed: false,
          });
          this.cleanup();
        },
```

Extend `resolveTerrain` to run erosion before the M3 feedback:

```ts
  private resolveTerrain(
    cells: WetCell[],
    applier: WaveEventApplier,
  ): { cells: WetCell[]; done: boolean } {
    const erosion = computeErosionHits({
      cells,
      isErodible: (col, row) => this.grid.getElevation(col, row) > 0 && !this.grid.isCastle(col, row),
      acc: this.erosionAcc,
      frontalCoeff: PRESSURE_EROSION_FRONTAL_COEFF,
      shearCoeff: PRESSURE_EROSION_SHEAR_COEFF,
    });
    this.erosionAcc = erosion.acc;
    for (const hit of erosion.hits) {
      const applied = applier.apply({ type: "eroded", col: hit.col, row: hit.row, hits: hit.hits });
      if (applied.erodedTile) {
        this.erodedTiles.add(applied.erodedTile);
      }
    }

    const feedback = applyTerrainFeedback({
      cells,
      probe: {
        isCastle: (col, row) => this.grid.isCastle(col, row),
        remainingHoleCapacity: (col, row) => this.grid.effectiveHoleDepth(col, row),
      },
      floodDepth: PRESSURE_CASTLE_FLOOD_DEPTH,
      drainThreshold: PRESSURE_DRAIN_THRESHOLD,
    });
    for (const delta of feedback.absorbed) {
      applier.apply({ type: "absorbed", col: delta.col, row: delta.row, absorbedDepth: delta.amount });
    }
    if (feedback.castleFlooded) {
      this.castleFlooded = true;
    }
    return { cells: feedback.cells, done: feedback.castleFlooded };
  }
```

**Step 5: Run to verify it passes**

Run: `node --run test:browser -- src/wave/wave-field-runtime-erosion.browser.test.ts`
Expected: PASS (2 tests).

Run: `node --run test:browser -- src/wave/wave-field-runtime-terrain.browser.test.ts`
Expected: PASS, unchanged (M3 pooling/castle still green; erosion adds nothing on those boards).

**Step 6: Lint + typecheck + full suite**

Run: `node --run static-check`
Expected: PASS.

**Step 7: Commit**

```bash
git add src/config.ts src/wave/wave-field-runtime.ts src/wave/wave-field-runtime-erosion.browser.test.ts
git commit -m "feat(wave): WaveFieldRuntime flux-projection erosion via eroded events"
```

---

## Task 4: Docs + final gate

`WaveFieldRuntime`'s Tide wiring already supplies a `WaveEventApplier` (landed in M3), so erosion activates on the flag-on path with no `tide-session.ts` change. This task is docs + verification only.

**Files:**
- Modify: `AGENTS.md`

**Step 1: Update `AGENTS.md`**

Under "### Wave runtime (`src/wave/`)", add:

```md
- **`wave-erosion.ts`** - Pure flux-projection erosion for the pressure field: projects each wet cell's velocity onto adjacent wall/tower faces (frontal vs shear), accumulates per-face charge across frames, and emits discrete `eroded` hit counts. Consumed by `WaveFieldRuntime` inside `WaveDynamicSystem`'s `onResolveCells` hook.
```

Amend the `wave-field-runtime.ts` line to note it now also drives wall/tower erosion (M4) via `eroded` events through `WaveEventApplier`. Amend the `wave-event-applier.ts` line to mention the `eroded` event → `GridModel.applyErosionHits`.

> `docs/gameplay.md` is intentionally **not** updated: the field path ships flag-off, so player-facing gameplay is unchanged until the M5 cutover.

**Step 2: Manually confirm the flag-on path (optional eyeball)**

Temporarily set `PRESSURE_WATER_ENABLED = true` in `src/config.ts`, run the dev server: build a low wall and watch a strong wave wear it down; build a tall wall and confirm it resists; place a wall off-axis and confirm glancing flow erodes it slowly. **Revert the flag to `false` before committing.**

**Step 3: Final full gate**

Run: `node --run static-check`
Expected: PASS (tsc, lint, unit, knip, browser). Confirm the flag is `false`.

**Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(wave): document M4 flux-projection erosion"
```

---

## Deferred / out of scope: `blocked`/`overtopped` sand redistribution

The M3 plan parked "`blocked`/`overtopped` sand redistribution" for M4. M4 **intentionally does not port it**, for grounded reasons:

- `WaveEventApplier`'s `blocked`/`overtopped` branch calls `GridModel.applySandRedistributionAt(col, row)`, which **returns `false` (no-op) when the target cell is a `Wall`** (`grid-model.ts:315`). The legacy `WaveSegment` emits these events *at the wall/tower cell*, so for walls the legacy behavior is already a no-op — there is no wall behavior to preserve.
- For towers it would lower `towerHeight` by 1 and raise a hole above — a secondary mechanic that **double-counts** with the velocity erosion this milestone adds (which already erodes towers via `Tower.applyHits`). Porting it faithfully would also require a once-per-wave latch (the field condition holds every frame, unlike the legacy once-per-tile-entry cadence), adding real complexity for near-zero net behavior.

So `WaveFieldRuntime` reports `sandRedistributed: false`, and erosion is the single terrain-mutation mechanic in the field. If tower feel regresses during M5 tuning, revisit: add a pure `classifyObstructions({ cells, isErodible, ... })` to `wave-erosion.ts` and a per-wave latch in the runtime that emits the existing `blocked`/`overtopped` events. Flagged here for the user's call rather than silently dropped.

---

## Final verification

Run the full gate and confirm green before declaring M4 done:

Run: `node --run static-check`
Expected: PASS.

With `PRESSURE_WATER_ENABLED = false`, Tide and Classic play exactly as before (legacy `WaveActorRuntime`). The flag-on field path now erodes walls and towers proportionally to the flux hitting each face, with frontal hits eroding faster than glancing ones.

## Definition of done

- `computeErosionHits` is a pure, unit-tested function: frontal flux charges a face faster than shear, charge accumulates and emits whole-number hits with fractional carry-over, non-erodible neighbors are ignored, and the input accumulator is never mutated.
- `GridModel.applyErosionHits(col, row, hits)` applies a hit count through each terrain's `applyHits`, swaps to `FlatGround` at elevation 0, refreshes graphics, and re-detects pools — with no depth gate; out-of-bounds/castle/non-positive counts are no-ops.
- The `eroded` event is in `WaveSegmentEvent`; `WaveEventApplier` routes it to `applyErosionHits`; the legacy `tileEntered` fall-through is unchanged.
- `WaveFieldRuntime` runs erosion each frame in `onResolveCells`, emits `eroded` events, and resolves deduped `erodedTiles`; `sandRedistributed` stays `false`; M3 pooling/castle behavior and flat-ground M2b behavior are unchanged.
- `docs` updated; `node --run static-check` green; knip clean; flag confirmed `false`.

## Notes for the executor

- **The flux kernel stays pure and untouched.** M4 reads the velocity it already produces; no change to `computeFluxStep`.
- **Why velocity, not head, is the erosion signal.** The kernel's outflow into a tall blocking wall is ~0 (`max(0, head − neighborHead)` with a huge wall `neighborHead`), so tall walls resist erosion and overtopped walls take flow-proportional frontal erosion. This reproduces the legacy `surfaceLevel − elev ≥ 2` gate organically; do not re-add a depth gate.
- **Tower `applyHits` accumulates.** Feeding small per-frame counts is correct — `hitCount` carries across calls until it crosses `TOWER_HITS_PER_EROSION`.
- **Coefficients are feel knobs.** `PRESSURE_EROSION_FRONTAL_COEFF` / `_SHEAR_COEFF` will need tuning in M5; keep shear ≪ frontal so glancing hits stay weak.
- **Dedupe eroded tiles.** Multiple per-frame hits on the same tower return the same `Terrain`; the `Set<Terrain>` keeps `erodedTiles` clean.
- **Scope discipline (YAGNI):** erosion only; no `blocked`/`overtopped` sand redistribution (see "Deferred / out of scope"). Do not touch the legacy `WaveSegment`/`WaveActorRuntime` path or the engine timestep.
- Single-file runners are verified; use them for the red/green loop, with `static-check` as the full gate.
```