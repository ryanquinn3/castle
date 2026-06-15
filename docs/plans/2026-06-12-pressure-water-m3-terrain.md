# Pressure Water Terrain Interaction (M3) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Prerequisite:** M2b (`2026-06-12-pressure-water-m2b-render-and-wiring.md`) is landed — the pure `computeFluxStep` kernel, `WaterCell` + `WaveDynamicSystem`, `WaveRenderSystem`, and `WaveFieldRuntime` (wired into Tide behind `PRESSURE_WATER_ENABLED`) all exist and are green with the flag off.

**Goal:** Teach the pressure-driven field about terrain. Walls/towers block and overtop by elevation and water flows around them (this already emerges from `groundAt`; M3 locks it with tests). Holes pool with finite capacity and accumulate `puddleDepth`. The castle triggers a flood that ends the wave. The default (flag-off) path stays unchanged.

**Architecture:** The flux kernel (`computeFluxStep`) **stays pure** — terrain enters only through the injected `groundAt`. Two new behaviors that need grid feedback live outside the kernel: a new pure helper `applyTerrainFeedback` (hole absorption + castle-flood detection over a plain `WetCell[]` and a `TerrainProbe`), invoked by a new optional `onResolveCells` hook on `WaveDynamicSystem`. `WaveFieldRuntime` supplies the hook: it builds `groundAt` from effective hole depth, runs `applyTerrainFeedback`, persists absorbed water to `puddleDepth` through `WaveEventApplier`, and resolves `castleFlooded`.

**Design decisions (confirmed with the user):**
- **Holes use absorb-on-contact.** Each frame, water resting in a hole below its rim is committed into the hole's `puddleDepth` (capped at remaining capacity) and removed from the live field, via the existing `absorbed` event → `WaveEventApplier.applyPuddleDelta`. `groundAt` uses *effective* hole depth, so a full hole reads as flat. This both matches the legacy `absorbed` semantics and fixes wave termination (water trapped below a hole rim can never drain north, so without this the `cells.length === 0` completion signal would never fire).
- **M3 applier scope = castle + puddle only.** `castleFlooded` and `absorbed` are wired here. ALL wall/tower erosion AND `blocked`/`overtopped` sand redistribution stay in M4 (which owns the velocity-projection erosion model and the full event vocabulary). M3's `WaveActorRuntimeResult` therefore always reports `erodedTiles: []` and `sandRedistributed: false`.

**Tech Stack:** TypeScript, Excalibur 0.32, Vitest (unit `*.test.ts` jsdom; browser `*.browser.test.ts` Playwright). See `docs/testing.md`.

**Repo conventions:** Work on the current branch (`feat/pressure-model`; no worktrees, per `AGENTS.md`). **Commit after each task** (committing is authorized; commit runs `static-check` as the pre-commit gate). Do not push unless the user asks. Fast loop: `node --run test:unit`. Full gate: `node --run static-check`. Single file: `node --run test:unit -- <file>` / `node --run test:browser -- <file>`. Curly braces on all `if`s; `for..of` over index loops; object arguments for 3+ params; check LSP diagnostics after each edit.

---

## Background the executor needs

### How terrain already reaches the kernel (verified)

- `computeFluxStep` (`src/wave/wave-dynamic-system.ts`) is pure and consumes ground only through `groundAt(col,row)`. Water crosses a cell only when the upstream head exceeds the cell's ground, so **wall blocking, overtopping, and lateral flow around obstacles already emerge for free** when `groundAt` includes real elevations. Task 1 is therefore *test-only* — it characterizes and locks this behavior; no kernel change.
- `WaveFieldRuntime` (`src/wave/wave-field-runtime.ts`) currently builds `groundAt: (col,row) => terrainSlope * row + grid.getElevation(col,row)`.
- Tide's adapter (`src/tide-session.ts:228` `makeWaveGridAdapter()`) already returns live `getElevation`, `effectiveHoleDepth`, and `isCastle` backed by `GridModel`. So in real Tide the field path already sees walls/holes as ground; M3 closes the hole-capacity, castle, and feedback-persistence gaps.

### Terrain facts (verified in `src/model/`)

- `GridModel.getElevation(col,row)` returns `cell.elevation`: `FlatGround` = 0, `Wall`/`Tower` = positive blocking elevation (`WALL_LEVEL_ELEVATION` = `[5,10,15,20]`, tower = `TOWER_HEIGHT` = 15), `Hole` = `-depth` (negative). **Negative elevation ⟺ Hole** is a reliable discriminator.
- `GridModel.effectiveHoleDepth(col,row)` returns the hole's `effectiveDepth = max(0, depth - puddleDepth)` (remaining capacity), and `0` for every non-hole — including a *full* hole (`puddleDepth === depth`). A full hole therefore has `getElevation < 0` but `effectiveHoleDepth === 0`.
- `Hole.addPuddle(amount)` clamps: `puddleDepth = min(depth, puddleDepth + amount)` — finite capacity is enforced by the terrain itself.
- `WaveEventApplier.apply({ type: 'absorbed', col, row, absorbedDepth })` → `grid.applyPuddleDelta(col,row,absorbedDepth)` (which runs `addPuddle` + `detectPools` + `refreshPoolGraphics`). Its result carries no erosion/sand fields, so M3 ignores the return value.
- `GridModel.getPuddleDepth(col,row)` reads back a hole's accumulated `puddleDepth` (for assertions).
- `grid.setElevation(col,row,-2)` on `FlatGround` swaps in a `Hole(2)` (`FlatGround.applyDelta(-2) → new Hole(2)`); `grid.placeWall(col,row,1)` swaps in `Wall(1)` (elevation 5). `GridModel` adds/removes terrain actors to the `Scene` passed to its constructor.
- The castle (default `CASTLE_COL=7, CASTLE_ROW=11`, 2×2) stays `FlatGround` (elevation 0); `isCastle` flags it. With `TERRAIN_SLOPE=0.5`, castle ground ≈ `0.5 * 11 = 5.5`, so only a source depth `D ≳ 6` reaches it — correct existing gameplay.

### `WaveActorRuntimeResult` (`src/wave/wave-segment-types.ts`)

```ts
export interface WaveActorRuntimeResult {
  castleFlooded: boolean;
  erodedTiles: Terrain[];
  sandRedistributed: boolean;
}
```
M3 fills `castleFlooded`; `erodedTiles`/`sandRedistributed` stay empty/false (M4).

### Testing split

- Pure logic (kernel terrain behavior, `applyTerrainFeedback`) → unit `*.test.ts` (jsdom; importing Excalibur transitively is fine).
- Anything needing a real `World`/`Scene`/`GridModel` actors → browser `*.browser.test.ts` via `import { test, expect } from "../test/excalibur-browser-test.ts"` (`ctx` gives `scene`, `step(ms)`).

---

## Task 1: Lock wall block / overtop / lateral-spread in the kernel (test-only)

Characterization tests proving terrain-as-ground works through the pure kernel. **No production change** — these assert behavior `computeFluxStep` already provides via `groundAt`, so they pass on first run and act as regression guards.

**Files:**
- Modify (test): `src/wave/wave-dynamic-system.test.ts` (append a describe block; reuse the existing `run` and `depthAt` helpers)

**Step 1: Append the terrain describe block**

Append to `src/wave/wave-dynamic-system.test.ts`:

```ts
describe("computeFluxStep — terrain as ground (walls block / overtop / flow around)", () => {
  // groundAt with a single raised cell acting as a wall of the given elevation.
  const wall = (col: number, row: number, elev: number) => (c: number, r: number) =>
    0.5 * r + (c === col && r === row ? elev : 0);

  it("a tall wall blocks its own cell but water flows around it laterally", () => {
    const out = run([], 3000, {
      width: 3,
      height: 12,
      groundAt: wall(1, 3, 5),
      source: { open: true, depth: 4 },
      oceanSink: true,
    });
    // Head tops out near D=4; the wall cell's ground is 0.5*3+5 = 6.5, so it stays dry.
    expect(depthAt(out, 1, 3)).toBeLessThan(0.1);
    // South of the wall in the same column can only wet via lateral inflow from the sides.
    expect(depthAt(out, 1, 4)).toBeGreaterThan(0.5);
    // The sides themselves carry water past the wall row.
    expect(depthAt(out, 0, 4)).toBeGreaterThan(0.5);
  });

  it("a low wall is overtopped and water continues past it", () => {
    const out = run([], 3000, {
      width: 3,
      height: 12,
      groundAt: wall(1, 3, 1),
      source: { open: true, depth: 4 },
      oceanSink: true,
    });
    // Wall ground 0.5*3+1 = 2.5 < head 4, so water sits on the wall cell (overtopped)...
    expect(depthAt(out, 1, 3)).toBeGreaterThan(0.5);
    // ...and reaches beyond it.
    expect(depthAt(out, 1, 5)).toBeGreaterThan(0.3);
  });
});
```

**Step 2: Run the new tests**

Run: `node --run test:unit -- src/wave/wave-dynamic-system.test.ts`
Expected: PASS (existing M2a tests + 2 new). If a tall-wall assertion is flaky at the boundary, raise the step count; do not lower `COEFF`.

**Step 3: Lint + typecheck**

Run: `node --run static-check`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/wave/wave-dynamic-system.test.ts
git commit -m "test(wave): lock wall block/overtop/lateral-spread in the flux kernel"
```

---

## Task 2: `applyTerrainFeedback` — pure hole-absorb + castle-flood

A pure function over `WetCell[]` and a `TerrainProbe` (no Excalibur, no `GridModel`), unit-tested first. It absorbs hole-resting water into a list of puddle deltas (and drops cells that drain below threshold) and reports castle flooding.

**Files:**
- Create: `src/wave/wave-terrain-feedback.ts`
- Create (test): `src/wave/wave-terrain-feedback.test.ts` (unit)

**Step 1: Write the failing test — `src/wave/wave-terrain-feedback.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { WetCell } from "./wave-dynamic-system.ts";
import { applyTerrainFeedback, type TerrainProbe } from "./wave-terrain-feedback.ts";

const cell = (col: number, row: number, depth: number): WetCell => ({ col, row, depth, velX: 0, velY: 0 });

const probe = (over: Partial<TerrainProbe> = {}): TerrainProbe => ({
  isCastle: () => false,
  remainingHoleCapacity: () => 0,
  ...over,
});

describe("applyTerrainFeedback", () => {
  it("absorbs hole-resting water up to remaining capacity and keeps the overflow", () => {
    const res = applyTerrainFeedback({
      cells: [cell(1, 3, 5)],
      probe: probe({ remainingHoleCapacity: (c, r) => (c === 1 && r === 3 ? 2 : 0) }),
      floodDepth: 0.5,
      drainThreshold: 0.01,
    });
    expect(res.absorbed).toEqual([{ col: 1, row: 3, amount: 2 }]);
    expect(res.cells).toEqual([cell(1, 3, 3)]);
    expect(res.castleFlooded).toBe(false);
  });

  it("fully absorbs and drops a shallow cell over a hole with spare capacity", () => {
    const res = applyTerrainFeedback({
      cells: [cell(1, 3, 1)],
      probe: probe({ remainingHoleCapacity: () => 2 }),
      floodDepth: 0.5,
      drainThreshold: 0.05,
    });
    expect(res.absorbed).toEqual([{ col: 1, row: 3, amount: 1 }]);
    expect(res.cells).toEqual([]);
  });

  it("does not absorb over a full hole (capacity 0)", () => {
    const res = applyTerrainFeedback({
      cells: [cell(1, 3, 4)],
      probe: probe({ remainingHoleCapacity: () => 0 }),
      floodDepth: 0.5,
      drainThreshold: 0.01,
    });
    expect(res.absorbed).toEqual([]);
    expect(res.cells).toEqual([cell(1, 3, 4)]);
  });

  it("flags castle flooding only when a castle cell is wet at or above floodDepth", () => {
    const flooded = applyTerrainFeedback({
      cells: [cell(7, 11, 0.8)],
      probe: probe({ isCastle: (c, r) => c === 7 && r === 11 }),
      floodDepth: 0.5,
      drainThreshold: 0.01,
    });
    expect(flooded.castleFlooded).toBe(true);

    const shallow = applyTerrainFeedback({
      cells: [cell(7, 11, 0.2)],
      probe: probe({ isCastle: (c, r) => c === 7 && r === 11 }),
      floodDepth: 0.5,
      drainThreshold: 0.01,
    });
    expect(shallow.castleFlooded).toBe(false);
  });
});
```

**Step 2: Run to verify it fails**

Run: `node --run test:unit -- src/wave/wave-terrain-feedback.test.ts`
Expected: FAIL, cannot resolve `./wave-terrain-feedback.ts`.

**Step 3: Write the implementation — `src/wave/wave-terrain-feedback.ts`**

```ts
import type { WetCell } from "./wave-dynamic-system.ts";

/** Grid lookups the terrain feedback needs, decoupled from GridModel for testability. */
export interface TerrainProbe {
  isCastle(col: number, row: number): boolean;
  /** Remaining hole capacity at this cell (effective hole depth); 0 for non-holes and full holes. */
  remainingHoleCapacity(col: number, row: number): number;
}

export interface AbsorbedDelta {
  col: number;
  row: number;
  amount: number;
}

export interface TerrainFeedbackInput {
  cells: WetCell[];
  probe: TerrainProbe;
  /** Depth on a castle cell at or above which the castle is considered flooded. */
  floodDepth: number;
  /** Cells whose depth falls to/below this after absorption are dropped. */
  drainThreshold: number;
}

export interface TerrainFeedbackResult {
  cells: WetCell[];
  absorbed: AbsorbedDelta[];
  castleFlooded: boolean;
}

/**
 * Post-flux terrain feedback for the pressure field. Holes absorb the water
 * resting in them up to their remaining capacity (committed to puddleDepth by the
 * caller via WaveEventApplier) and that water leaves the live field, which both
 * accumulates the puddle and lets the wave terminate (water below a hole rim can
 * never drain north). A castle cell wet at or above floodDepth flags a flood.
 * Pure: no Excalibur, no GridModel — terrain enters only through the probe.
 */
export function applyTerrainFeedback(input: TerrainFeedbackInput): TerrainFeedbackResult {
  const { cells, probe, floodDepth, drainThreshold } = input;
  const absorbed: AbsorbedDelta[] = [];
  const next: WetCell[] = [];
  let castleFlooded = false;

  for (const cell of cells) {
    if (probe.isCastle(cell.col, cell.row) && cell.depth >= floodDepth) {
      castleFlooded = true;
    }

    const capacity = probe.remainingHoleCapacity(cell.col, cell.row);
    if (capacity <= 0) {
      next.push(cell);
      continue;
    }

    const amount = Math.min(cell.depth, capacity);
    absorbed.push({ col: cell.col, row: cell.row, amount });
    const remaining = cell.depth - amount;
    if (remaining > drainThreshold) {
      next.push({ ...cell, depth: remaining });
    }
  }

  return { cells: next, absorbed, castleFlooded };
}
```

**Step 4: Run to verify it passes**

Run: `node --run test:unit -- src/wave/wave-terrain-feedback.test.ts`
Expected: PASS (4 tests).

**Step 5: Lint + typecheck**

Run: `node --run static-check`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/wave/wave-terrain-feedback.ts src/wave/wave-terrain-feedback.test.ts
git commit -m "feat(wave): pure terrain feedback (hole absorb + castle flood)"
```

---

## Task 3: `WaveDynamicSystem.onResolveCells` hook

Add an optional per-frame hook that lets the runtime rewrite the resolved cell set (hole absorption) and force completion (castle flood), keeping the kernel and System terrain-agnostic.

**Files:**
- Modify: `src/wave/wave-dynamic-system.ts`
- Modify (test): `src/wave/wave-dynamic-system.browser.test.ts`

**Step 1: Write the failing test**

Append to `src/wave/wave-dynamic-system.browser.test.ts`:

```ts
test("onResolveCells.done forces completion even while water remains", async ({ ctx }) => {
  let completed = false;
  ctx.scene.world.add(
    new WaveDynamicSystem({
      scene: ctx.scene,
      width: 3,
      height: 12,
      sourceDepth: 4,
      groundAt: (_col, row) => 0.5 * row,
      gridLeft: 0,
      gridTop: 32,
      tileSize: 16,
      surgeWindowMs: 100_000, // source stays open, so water never drains on its own
      onResolveCells: (cells) => ({ cells, done: true }),
      onComplete: () => {
        completed = true;
      },
    }),
  );

  drive(ctx, 5);

  expect(completed).toBe(true);
});
```

**Step 2: Run to verify it fails**

Run: `node --run test:browser -- src/wave/wave-dynamic-system.browser.test.ts`
Expected: FAIL — `onResolveCells` is not an accepted option / completion never fires (source held open).

**Step 3: Add the option and the hook**

In `src/wave/wave-dynamic-system.ts`, add to `WaveDynamicSystemOptions` (after `surgeWindowMs?`):

```ts
  /**
   * Optional per-frame terrain feedback. Receives the resolved cell set, may
   * return a rewritten set (e.g. hole absorption removed water) and `done: true`
   * to end the wave immediately (e.g. castle flood).
   */
  onResolveCells?: (cells: WetCell[]) => { cells: WetCell[]; done: boolean };
```

In `update(...)`, replace the tail of the method (from `this.reconcile(cells);` onward):

```ts
    let done = false;
    if (this.opts.onResolveCells) {
      const resolved = this.opts.onResolveCells(cells);
      cells = resolved.cells;
      done = resolved.done;
    }

    this.reconcile(cells);

    if (!this.completed && (done || (!this.sourceOpen && cells.length === 0))) {
      this.completed = true;
      this.opts.onComplete?.();
    }
```

(The `cells` local is already `let`; no other change. Existing callers that omit `onResolveCells` behave exactly as before.)

**Step 4: Run to verify it passes**

Run: `node --run test:browser -- src/wave/wave-dynamic-system.browser.test.ts`
Expected: PASS (existing M2a tests + the new one).

**Step 5: Lint + typecheck + full suite**

Run: `node --run static-check`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/wave/wave-dynamic-system.ts src/wave/wave-dynamic-system.browser.test.ts
git commit -m "feat(wave): WaveDynamicSystem onResolveCells hook for terrain feedback"
```

---

## Task 4: Wire terrain into `WaveFieldRuntime`

Build `groundAt` from effective hole depth, add an optional `applier`, run `applyTerrainFeedback` each frame, persist absorbed water to `puddleDepth`, and resolve real `castleFlooded`.

**Files:**
- Modify: `src/config.ts` (flood-depth constant)
- Modify: `src/wave/wave-field-runtime.ts`
- Create (test): `src/wave/wave-field-runtime-terrain.browser.test.ts`

**Step 1: Add the flood-depth constant to `src/config.ts`**

Add next to the other `PRESSURE_*` constants:

```ts
/** Depth on a castle cell at or above which the castle counts as flooded (wave ends as a loss). Tuning knob. */
export const PRESSURE_CASTLE_FLOOD_DEPTH = 0.5;
```

**Step 2: Write the failing test — `src/wave/wave-field-runtime-terrain.browser.test.ts`**

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

function buildGrid(scene: import("excalibur").Scene): GridModel {
  // Castle in-bounds for this narrow test board.
  return new GridModel(
    { width: WIDTH, height: HEIGHT, castleCol: 1, castleRow: 11, castleWidth: 1, castleHeight: 1 },
    scene,
  );
}

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

test("water pooling in a hole accumulates puddleDepth and the wave drains to empty", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);
  grid.setElevation(1, 5, -2); // dig a depth-2 hole well short of the castle

  const runtime = new WaveFieldRuntime(ctx.scene, adapterFor(grid), TERRAIN_SLOPE, {
    surgeWindowMs: 300,
    applier: new WaveEventApplier(grid),
  });
  const done = runtime.playWave(spawnsFor(4)); // D=4 reaches ~row 8, never the castle at row 11

  for (let i = 0; i < 1000; i++) {
    ctx.step(16);
  }
  const result = await done;

  expect(grid.getPuddleDepth(1, 5)).toBeGreaterThan(0);
  expect(result.castleFlooded).toBe(false);
  expect(result.erodedTiles).toEqual([]);
  expect(result.sandRedistributed).toBe(false);
  expect(ctx.scene.world.query([WaterComponent]).entities.length).toBe(0);
});

test("a strong source floods the castle and resolves castleFlooded", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);

  const runtime = new WaveFieldRuntime(ctx.scene, adapterFor(grid), TERRAIN_SLOPE, {
    surgeWindowMs: 2000,
    applier: new WaveEventApplier(grid),
  });
  const done = runtime.playWave(spawnsFor(9)); // D=9 reaches the castle at row 11 (ground 5.5)

  for (let i = 0; i < 1200; i++) {
    ctx.step(16);
  }
  const result = await done;

  expect(result.castleFlooded).toBe(true);
});
```

**Step 3: Run to verify it fails**

Run: `node --run test:browser -- src/wave/wave-field-runtime-terrain.browser.test.ts`
Expected: FAIL — the runtime ignores `applier`, never accumulates `puddleDepth`, and never sets `castleFlooded`.

**Step 4: Wire the runtime — `src/wave/wave-field-runtime.ts`**

Update the imports:

```ts
import type { Scene } from "excalibur";
import { PRESSURE_CASTLE_FLOOD_DEPTH, PRESSURE_DRAIN_THRESHOLD } from "../config.ts";
import { WaterComponent } from "./water-component.ts";
import { WaveDynamicSystem, type WetCell } from "./wave-dynamic-system.ts";
import { WaveRenderSystem } from "./wave-render-system.ts";
import { WaveOverlay } from "./wave-overlay.ts";
import { applyTerrainFeedback } from "./wave-terrain-feedback.ts";
import type { WaveEventApplier } from "./wave-event-applier.ts";
import type {
  WaveActorRuntimeResult,
  WaveSegmentGrid,
  WaveSegmentSpawn,
} from "./wave-segment-types.ts";
```

Update the class doc comment to reflect M3 (replace the "no erosion, pooling, or castle flooding yet (M3/M4)" sentence):

```ts
/**
 * Orchestrates the pressure-driven water path: builds the overlay, registers the
 * dynamic (sim) + render systems, opens the source for a surge window, and
 * resolves when no water remains. Mirrors WaveActorRuntime's playWave contract so
 * sessions swap it in behind a flag. When an applier is supplied (M3), terrain
 * feedback runs each frame: holes absorb water into puddleDepth and a flooded
 * castle ends the wave. Erosion and sand redistribution remain M4, so the result
 * still reports no eroded tiles and no sand redistribution.
 */
```

Update the constructor's `options` type and add a `castleFlooded` field:

```ts
  private dynamicSystem: WaveDynamicSystem | null = null;
  private renderSystem: WaveRenderSystem | null = null;
  private overlay: WaveOverlay | null = null;
  private castleFlooded = false;

  constructor(
    private readonly scene: Scene,
    private readonly grid: WaveSegmentGrid,
    private readonly terrainSlope: number,
    private readonly options: { surgeWindowMs?: number; applier?: WaveEventApplier } = {},
  ) {}
```

In `playWave`, reset the flag at the top of the method body (right after the `spawns.length === 0` guard):

```ts
    this.castleFlooded = false;
```

Replace the `groundAt` line in the `WaveDynamicSystem` construction with an effective-hole-aware version, add the `onResolveCells` wiring, and resolve the real `castleFlooded`:

```ts
      this.dynamicSystem = new WaveDynamicSystem({
        scene: this.scene,
        width,
        height: this.grid.height,
        sourceDepth,
        groundAt: (col, row) => {
          const elev = this.grid.getElevation(col, row);
          // Holes (negative elevation) read as a pit only as deep as their
          // remaining capacity, so a full hole reads as flat ground.
          const offset = elev < 0 ? -this.grid.effectiveHoleDepth(col, row) : elev;
          return this.terrainSlope * row + offset;
        },
        gridLeft: this.grid.gridLeft,
        gridTop: this.grid.gridTop,
        tileSize: this.grid.tileSize,
        surgeWindowMs: this.options.surgeWindowMs,
        onResolveCells: this.options.applier
          ? (cells) => this.resolveTerrain(cells, this.options.applier!)
          : undefined,
        onComplete: () => {
          resolve({ castleFlooded: this.castleFlooded, erodedTiles: [], sandRedistributed: false });
          this.cleanup();
        },
      });
```

Add the private terrain-feedback method (e.g. above `cleanup()`):

```ts
  private resolveTerrain(
    cells: WetCell[],
    applier: WaveEventApplier,
  ): { cells: WetCell[]; done: boolean } {
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

Run: `node --run test:browser -- src/wave/wave-field-runtime-terrain.browser.test.ts`
Expected: PASS (2 tests).

Run: `node --run test:browser -- src/wave/wave-field-runtime.browser.test.ts`
Expected: PASS, unchanged (flat ground, no `applier` → `onResolveCells` omitted → identical to M2b).

**Step 6: Lint + typecheck + full suite**

Run: `node --run static-check`
Expected: PASS.

**Step 7: Commit**

```bash
git add src/config.ts src/wave/wave-field-runtime.ts src/wave/wave-field-runtime-terrain.browser.test.ts
git commit -m "feat(wave): WaveFieldRuntime hole pooling + castle flood via WaveEventApplier"
```

---

## Task 5: Wire the applier into Tide + docs

Give the live Tide field path its applier so pooling and castle flooding take effect behind the flag, and update the architecture docs.

**Files:**
- Modify: `src/tide-session.ts`
- Modify: `AGENTS.md`

**Step 1: Pass an applier to the field runtime in `src/tide-session.ts`**

In `runWave`, replace the flag-on construction:

```ts
    if (PRESSURE_WATER_ENABLED) {
      this.waterRuntime = new WaveFieldRuntime(this, this.makeWaveGridAdapter(), TERRAIN_SLOPE, {
        applier: new WaveEventApplier(this.grid, this.sandLayer),
      });
      result = await this.waterRuntime.playWave(spawns);
    } else {
```

(`WaveEventApplier` is already imported and `this.sandLayer` already exists — both are used by the `else` branch.)

**Step 2: Update `AGENTS.md`**

Under "### Wave runtime (`src/wave/`)", add an entry:

```md
- **`wave-terrain-feedback.ts`** - Pure post-flux terrain feedback for the pressure field: holes absorb resting water into `puddleDepth` (finite capacity) and a wet castle cell flags a flood. Consumed by `WaveFieldRuntime` via `WaveDynamicSystem`'s `onResolveCells` hook.
```

And amend the `wave-field-runtime.ts` line (if present) / add one to note it now wires `WaveEventApplier` for pooling + castle flooding behind `PRESSURE_WATER_ENABLED`.

> `docs/gameplay.md` is intentionally **not** updated here: the field path ships flag-off, so player-facing gameplay is unchanged until the M5 cutover.

**Step 3: Manually confirm the flag-on path (optional eyeball)**

Temporarily set `PRESSURE_WATER_ENABLED = true` in `src/config.ts`, run the dev server, dig a hole and watch it hold a puddle after a wave; build a wall and watch water bend around it; let a big wave reach the castle and confirm the loss fires. **Revert the flag to `false` before committing** (M3 ships with it off).

**Step 4: Final full gate**

Run: `node --run static-check`
Expected: PASS (tsc, lint, unit, knip, browser). Confirm the flag is `false`.

**Step 5: Commit**

```bash
git add src/tide-session.ts AGENTS.md
git commit -m "feat(wave): wire WaveEventApplier into Tide field path; document M3 terrain feedback"
```

---

## Final verification

Run the full gate and confirm green before declaring M3 done:

Run: `node --run static-check`
Expected: PASS.

With `PRESSURE_WATER_ENABLED = false`, Tide and Classic play exactly as before (legacy `WaveActorRuntime`). The flag-on field path now blocks/overtops walls, flows around them, pools in holes, and loses on castle flood.

## Definition of done

- Kernel terrain behavior (wall block, overtop, lateral flow) is locked by headless unit tests.
- `applyTerrainFeedback` is a pure, unit-tested function: hole absorption up to remaining capacity (dropping fully-absorbed cells) and castle-flood detection.
- `WaveDynamicSystem` exposes an `onResolveCells` hook; existing callers are unaffected.
- `WaveFieldRuntime` builds `groundAt` from effective hole depth, persists absorbed water to `puddleDepth` through `WaveEventApplier`, and resolves real `castleFlooded`; `erodedTiles`/`sandRedistributed` stay empty (M4). Flat-ground M2b behavior is unchanged.
- Tide's flag-on path passes an applier; `docs` updated; `node --run static-check` green; knip clean.

## Notes for the executor

- **The flux kernel stays pure.** Terrain enters the kernel only through `groundAt`; hole absorption and castle detection live in `applyTerrainFeedback` + the runtime, never inside `computeFluxStep`.
- **Why absorb-on-contact (not physical pooling).** Water resting below a hole rim cannot drain north up the slope, so a purely physical pool would linger forever and the `cells.length === 0` completion signal would never fire. Absorbing it into `puddleDepth` and removing it from the live field both accumulates the puddle (finite, clamped by `Hole.addPuddle`) and lets the wave end. This matches the legacy `absorbed` event semantics.
- **`elev < 0 ⟺ hole`** is the discriminator used in `groundAt`; it holds for all terrain types (flat = 0, wall/tower > 0, hole < 0), including a full hole (still `< 0`, but `effectiveHoleDepth === 0` makes its offset 0 = flat).
- **Scope discipline (YAGNI):** no wall/tower erosion and no `blocked`/`overtopped` sand redistribution in M3 — those are M4. `WaveFieldRuntime` only applies `absorbed`; the result always reports `erodedTiles: []`, `sandRedistributed: false`.
- **`PRESSURE_CASTLE_FLOOD_DEPTH` is a feel knob.** 0.5 means the castle must be genuinely covered, not just lapped by the receding front. Adjust during M5 tuning if needed.
- **Per-frame absorb cost:** `WaveEventApplier.apply('absorbed')` runs `detectPools` + graphics refresh per call; with a handful of hole cells this is negligible. If a board ever has many holes and this shows up, batch via `GridModel.applyPuddleDeltas` — not needed now.
- **Do not touch the legacy path or the engine timestep.** `WaveSegment`/`WaveActorRuntime` and the fixed sim step are untouched.
- Single-file runners are verified; use them for the red/green loop, with `static-check` as the full gate.
```
