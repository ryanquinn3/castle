# Hole Basin Pooling & Siltation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
>
> **Execution (per `docs/plans/CLAUDE.md`):** sub-agent driven execution with **sonnet** as the subagent model; make a commit after each task.

**Goal:** Make water pool live in holes so it channels toward the deepest hole, and replace the dead hole-erosion path with a once-per-wave siltation step.

**Architecture:** Stop `applyTerrainFeedback` from siphoning hole water out of the live field every frame. Instead water pools as live depth (the existing flux kernel already routes it to the deepest connected hole). A rim-aware seep drains only above-ground water so the wave still recedes; trapped sub-ground pools are detected as "settled" and, on wave end, committed: each hole folds its pooled water into `puddleDepth` and silts one depth step.

**Tech Stack:** TypeScript, Vite, Excalibur.js, Vitest (two projects: `unit` for `*.test.ts`, `browser` for `*.browser.test.ts`).

**Design doc:** `docs/plans/2026-06-15-hole-basin-pooling-and-siltation-design.md` — read it before starting.

## Conventions for every task

- TDD: write the failing test, run it red, implement, run it green, commit.
- Run a targeted test with `node --run test:unit -- <path-or-pattern>` (fast loop) or
  `node --run test:browser -- <path-or-pattern>` (slow, real engine).
- Before each commit, run the full suite: `node --run static-check` (lint + typecheck + unit + browser). It must pass.
- Code style: curly braces on all `if`s, `for..of` over indexing, object args for 3+ params, return early.

---

### Task 1: Add `floor` to the water cell

Plumb the cell's ground floor onto `WaterComponent` so the seep step (Task 2) and settle check (Task 3) can tell sub-ground pool water from above-ground water. No behavior change yet.

> **No dedicated test.** Per `docs/testing.md`, do not test that a constructor assigns a field — TypeScript already guarantees that and such a test mirrors implementation. `floor`'s behavior is verified by the `seepDepth` test in Task 2 and the integration tests in Task 6. This task is a plumbing change validated by `static-check`.

**Files:**
- Modify: `src/wave/water-component.ts`
- Modify: `src/wave/water-cell.ts`
- Modify: `src/wave/wave-dynamic-system.ts` (`reconcile`)

**Step 1: Implement**

In `src/wave/water-component.ts` add `floor` to the init interface and the class:

```ts
export interface WaterComponentInit {
  depth: number;
  vel?: Vector;
  col?: number;
  row?: number;
  floor?: number;
}
```

```ts
export class WaterComponent extends Component {
  depth: number;
  vel: Vector;
  col: number;
  row: number;
  floor: number;

  constructor(init: WaterComponentInit) {
    super();
    this.depth = init.depth;
    this.vel = init.vel ?? new Vector(0, 0);
    this.col = init.col ?? 0;
    this.row = init.row ?? 0;
    this.floor = init.floor ?? 0;
  }
}
```

In `src/wave/water-cell.ts` add `floor` to `WaterCellInit` and pass it through:

```ts
export interface WaterCellInit {
  col: number;
  row: number;
  depth: number;
  vel: Vector;
  gridLeft: number;
  gridTop: number;
  tileSize: number;
  floor: number;
}
```

```ts
this.water = new WaterComponent({
  depth: init.depth,
  vel: init.vel,
  col: init.col,
  row: init.row,
  floor: init.floor,
});
```

In `src/wave/wave-dynamic-system.ts` `reconcile`, set the floor when updating and creating cells (use the existing `this.opts.groundAt`):

- On the `existing` branch, after setting depth/vel, add:
  `existing.water.floor = this.opts.groundAt(cell.col, cell.row);`
- On the `new WaterCell({...})` branch, add `floor: this.opts.groundAt(cell.col, cell.row),` to the init object.

**Step 2: Verify nothing regressed and commit**

Run: `node --run static-check`
Expected: PASS (typecheck confirms the `floor` plumbing; existing wave tests still green).

```bash
git add src/wave/water-component.ts src/wave/water-cell.ts src/wave/wave-dynamic-system.ts
git commit -m "feat(wave): plumb cell floor onto WaterComponent"
```

---

### Task 2: Rim-aware seep

Replace the universal seep decrement with one that only drains water standing **above the beach plane**, so trapped sub-ground hole water is retained. Absorption is still on at this point, so flat-ground recede is unchanged and there is no regression.

**Files:**
- Modify: `src/wave/wave-dynamic-system.ts` (add pure `seepDepth`, rewrite `postupdate`, add `groundLevelAt` to options)
- Modify: `src/wave/wave-field-runtime.ts` (supply `groundLevelAt`)
- Test: `src/wave/wave-dynamic-system.test.ts` (add a `describe` block)

**Step 1: Write the failing test**

Add to `src/wave/wave-dynamic-system.test.ts` (import `seepDepth` alongside `computeFluxStep`):

```ts
describe("seepDepth — rim-aware recede drain", () => {
  it("seeps flat-ground water fully (floor == ground level)", () => {
    expect(seepDepth({ floor: 0, depth: 2, groundLevel: 0, seep: 0.5 })).toBeCloseTo(1.5, 6);
  });

  it("does not seep water sitting below the beach plane in a hole", () => {
    // hole floor -3, holding 2 units => surface -1, entirely below ground level 0
    expect(seepDepth({ floor: -3, depth: 2, groundLevel: 0, seep: 0.5 })).toBeCloseTo(2, 6);
  });

  it("seeps only the band of water standing above the rim", () => {
    // hole floor -3, holding 4 => surface +1, only the 1 unit above ground level seeps
    expect(seepDepth({ floor: -3, depth: 4, groundLevel: 0, seep: 0.5 })).toBeCloseTo(3.5, 6);
    // a large seep cannot drain below the rim in one step
    expect(seepDepth({ floor: -3, depth: 4, groundLevel: 0, seep: 5 })).toBeCloseTo(3, 6);
  });
});
```

**Step 2: Run it red**

Run: `node --run test:unit -- src/wave/wave-dynamic-system.test.ts`
Expected: FAIL (`seepDepth` not exported).

**Step 3: Implement**

Add the pure helper to `src/wave/wave-dynamic-system.ts` (near `computeFluxStep`):

```ts
/**
 * Recede-phase seep for one cell: drains only the water standing above the local
 * beach plane (groundLevel). Water pooled below the rim in a hole is trapped and
 * never seeps; it is committed at wave end instead. Flat ground (floor ===
 * groundLevel) seeps its full depth, matching the legacy universal decrement.
 */
export function seepDepth(input: {
  floor: number;
  depth: number;
  groundLevel: number;
  seep: number;
}): number {
  const { floor, depth, groundLevel, seep } = input;
  const seepable = Math.max(0, floor + depth - groundLevel);
  return depth - Math.min(seep, seepable);
}
```

Add `groundLevelAt` to `WaveDynamicSystemOptions`:

```ts
  /** Beach plane elevation (no hole carve-out) at a cell: terrainSlope * row. */
  groundLevelAt: (col: number, row: number) => number;
```

Rewrite the body of `postupdate` to use it:

```ts
    const seep = PRESSURE_SEEP_RATE_PER_MS * elapsed;
    if (seep <= 0) {
      return;
    }
    for (const entity of this.query.entities) {
      const water = entity.get(WaterComponent)!;
      water.depth = seepDepth({
        floor: water.floor,
        depth: water.depth,
        groundLevel: this.opts.groundLevelAt(water.col, water.row),
        seep,
      });
    }
```

In `src/wave/wave-field-runtime.ts`, in the `new WaveDynamicSystem({...})` options, add:

```ts
        groundLevelAt: (_col, row) => this.terrainSlope * row,
```

**Step 4: Run it green**

Run: `node --run test:unit -- src/wave/wave-dynamic-system.test.ts`
Expected: PASS.

**Step 5: Verify recede still terminates and commit**

Run: `node --run static-check` (covers `wave-field-runtime-recede.browser.test.ts`).
Expected: PASS.

```bash
git add src/wave/wave-dynamic-system.ts src/wave/wave-field-runtime.ts src/wave/wave-dynamic-system.test.ts
git commit -m "feat(wave): rim-aware seep retains sub-ground hole water"
```

---

### Task 3: Settle detection + termination

Add a "field at rest" detector and wire it (plus a max-recede timeout) as additional wave-end conditions. Still inert in practice while absorption is on (the field drains to empty first), but unit-tested and ready for Task 6.

**Files:**
- Modify: `src/config.ts` (new constants)
- Modify: `src/wave/wave-dynamic-system.ts` (pure `isFieldSettled`, `settledSteps` counter, termination conditions, `onComplete` passes resting cells)
- Test: `src/wave/wave-dynamic-system.test.ts` (add a `describe` block)

**Step 1: Write the failing test**

Add to `src/wave/wave-dynamic-system.test.ts` (import `isFieldSettled`):

```ts
describe("isFieldSettled", () => {
  const groundLevel = (_c: number, r: number) => 0.5 * r;
  // a hole at (0,4): beach plane 2.0, floor 2.0 - 3 = -1.0
  const groundAt = (c: number, r: number) => (c === 0 && r === 4 ? 0.5 * r - 3 : 0.5 * r);

  it("is settled when trapped pool water is below the rim and at rest", () => {
    const cells: WetCell[] = [{ col: 0, row: 4, depth: 2, velX: 0, velY: 0 }]; // surface -1 + 2 = +... below rim
    expect(
      isFieldSettled({ cells, groundAt, groundLevelAt: groundLevel, velocityEpsilon: 0.02, seepEpsilon: 0.01 }),
    ).toBe(true);
  });

  it("is not settled while water still stands above the rim", () => {
    const cells: WetCell[] = [{ col: 0, row: 4, depth: 4, velX: 0, velY: 0 }]; // surface +1 above rim
    expect(
      isFieldSettled({ cells, groundAt, groundLevelAt: groundLevel, velocityEpsilon: 0.02, seepEpsilon: 0.01 }),
    ).toBe(false);
  });

  it("is not settled while any cell is still moving", () => {
    const cells: WetCell[] = [{ col: 0, row: 4, depth: 2, velX: 0, velY: 0.5 }];
    expect(
      isFieldSettled({ cells, groundAt, groundLevelAt: groundLevel, velocityEpsilon: 0.02, seepEpsilon: 0.01 }),
    ).toBe(false);
  });
});
```

> Note: pick `depth` values so the first case's surface (`groundAt + depth`) is at/below `groundLevelAt` and the second is above. Adjust the literals if the arithmetic above is off; the assertion intent (below-rim+still = settled) is what matters.

**Step 2: Run it red**

Run: `node --run test:unit -- src/wave/wave-dynamic-system.test.ts`
Expected: FAIL (`isFieldSettled` not exported).

**Step 3: Implement**

Add constants to `src/config.ts`:

```ts
/** Settle detector: max per-cell velocity magnitude treated as "at rest". Feel knob. */
export const PRESSURE_SETTLE_VELOCITY_EPSILON = 0.02;
/** Consecutive settled sim steps required before committing trapped pools. */
export const PRESSURE_SETTLE_STABLE_STEPS = 5;
/** Hard cap on recede duration (ms after the source closes) before force-committing. */
export const PRESSURE_MAX_RECEDE_MS = 8000;
```

Add the pure helper to `src/wave/wave-dynamic-system.ts`:

```ts
/**
 * True when every live cell is trapped below its rim (no seepable water) and at
 * rest (velocity below epsilon). At that point the only water left is standing
 * pool water in basins, ready to commit. Empty fields are handled separately by
 * the drain check, so this is only consulted when cells remain.
 */
export function isFieldSettled(input: {
  cells: WetCell[];
  groundAt: (col: number, row: number) => number;
  groundLevelAt: (col: number, row: number) => number;
  velocityEpsilon: number;
  seepEpsilon: number;
}): boolean {
  const { cells, groundAt, groundLevelAt, velocityEpsilon, seepEpsilon } = input;
  for (const c of cells) {
    const seepable = groundAt(c.col, c.row) + c.depth - groundLevelAt(c.col, c.row);
    if (seepable > seepEpsilon) {
      return false;
    }
    if (Math.hypot(c.velX, c.velY) > velocityEpsilon) {
      return false;
    }
  }
  return true;
}
```

Import the new constants. Add a `private settledSteps = 0;` field to `WaveDynamicSystem`. Replace the termination block at the end of `update` with:

```ts
    let done = false;
    if (this.opts.onResolveCells) {
      const resolved = this.opts.onResolveCells(cells);
      cells = resolved.cells;
      done = resolved.done;
    }

    this.reconcile(cells);

    const settledNow =
      !this.sourceOpen &&
      cells.length > 0 &&
      isFieldSettled({
        cells,
        groundAt: this.opts.groundAt,
        groundLevelAt: this.opts.groundLevelAt,
        velocityEpsilon: PRESSURE_SETTLE_VELOCITY_EPSILON,
        seepEpsilon: PRESSURE_DRAIN_THRESHOLD,
      });
    this.settledSteps = settledNow ? this.settledSteps + 1 : 0;

    const surgeMs = this.opts.surgeWindowMs ?? PRESSURE_SURGE_WINDOW_MS;
    const recedeMs = this.simTimeMs - surgeMs;
    const drained = !this.sourceOpen && cells.length === 0;
    const settled = this.settledSteps >= PRESSURE_SETTLE_STABLE_STEPS;
    const timedOut = !this.sourceOpen && recedeMs > PRESSURE_MAX_RECEDE_MS;

    if (!this.completed && (done || drained || settled || timedOut)) {
      this.completed = true;
      this.opts.onComplete?.(cells);
    }
```

Change the `onComplete` option type to receive the resting cells:

```ts
  onComplete?: (restingCells: WetCell[]) => void;
```

In `src/wave/wave-field-runtime.ts` the existing `onComplete: () => {...}` closure still compiles (it just ignores the new argument). Leave the commit wiring for Task 5.

**Step 4: Run it green**

Run: `node --run test:unit -- src/wave/wave-dynamic-system.test.ts`
Expected: PASS.

**Step 5: Verify and commit**

Run: `node --run static-check`
Expected: PASS.

```bash
git add src/config.ts src/wave/wave-dynamic-system.ts src/wave/wave-dynamic-system.test.ts
git commit -m "feat(wave): detect a settled field and add recede timeout"
```

---

### Task 4: Hole + GridModel commit-silt

Add the commit operation: fold pooled water into `puddleDepth` and silt one depth step, swapping to `FlatGround` at depth 0.

**Files:**
- Modify: `src/model/terrain/hole.ts` (`commitWave`)
- Modify: `src/model/grid-model.ts` (`commitHoleWave`)
- Test: `src/model/terrain/hole.test.ts` (create)
- Test: `src/model/grid-model.browser.test.ts` (add a `describe`)

**Step 1: Write the failing test (Hole, pure logic → unit)**

Create `src/model/terrain/hole.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Hole } from "./hole.ts";

describe("Hole.commitWave", () => {
  it("silts one step and dries the pool: -5 with 1 unit -> -4 dry", () => {
    const hole = new Hole(5); // depth 5, puddle 0
    const result = hole.commitWave(1);
    expect(result).toEqual({ newElevation: -4 });
    expect(hole.depth).toBe(4);
    expect(hole.puddleDepth).toBe(0);
  });

  it("keeps carried standing water minus one: -10 with 4 units -> -9 holding 3", () => {
    const hole = new Hole(10);
    hole.commitWave(4);
    expect(hole.depth).toBe(9);
    expect(hole.puddleDepth).toBe(3);
  });

  it("does not silt a hole that took on no water", () => {
    const hole = new Hole(5);
    expect(hole.commitWave(0)).toBeNull();
    expect(hole.depth).toBe(5);
  });

  it("silts toward flat over repeated waves (depth-1 elevation reports 0)", () => {
    const hole = new Hole(1);
    const result = hole.commitWave(1);
    expect(result).toEqual({ newElevation: 0 });
    expect(hole.depth).toBe(0);
  });
});
```

**Step 2: Run it red**

Run: `node --run test:unit -- src/model/terrain/hole.test.ts`
Expected: FAIL (`commitWave` not a function).

**Step 3: Implement `Hole.commitWave`**

In `src/model/terrain/hole.ts`:

```ts
/**
 * End-of-wave commit: fold the wave's pooled water into the standing puddle,
 * then silt one depth step if any water rests in the hole (partial restore:
 * depth and puddle each drop by 1). Returns the new elevation when it silted,
 * else null. GridModel swaps the hole to FlatGround when elevation hits 0.
 */
commitWave(pooledWater: number): ErosionResult | null {
  this.puddleDepth = Math.min(this.depth, this.puddleDepth + pooledWater);
  if (this.puddleDepth < 1) {
    return null;
  }
  this.depth -= 1;
  this.puddleDepth -= 1;
  return { newElevation: this.elevation };
}
```

**Step 4: Run it green**

Run: `node --run test:unit -- src/model/terrain/hole.test.ts`
Expected: PASS.

**Step 5: Write the failing test (GridModel → browser)**

`GridModel` tests live in `src/model/grid-model.browser.test.ts`. Add:

```ts
describe("commitHoleWave", () => {
  it("silts a hole one step and reports the eroded cell", ({ ctx }) => {
    const grid = /* build a GridModel as the other tests in this file do */;
    grid.setElevation(2, 2, -5); // depth-5 hole
    const result = grid.commitHoleWave(2, 2, 1);
    expect(result).toMatchObject({ col: 2, row: 2, newElevation: -4 });
    expect(grid.getElevation(2, 2)).toBe(-4);
  });

  it("converts a depth-1 hole to flat ground when it silts to 0", ({ ctx }) => {
    const grid = /* build a GridModel */;
    grid.setElevation(2, 2, -1);
    grid.commitHoleWave(2, 2, 1);
    expect(grid.getElevation(2, 2)).toBe(0); // now FlatGround
  });

  it("ignores non-hole and castle cells", ({ ctx }) => {
    const grid = /* build a GridModel */;
    expect(grid.commitHoleWave(2, 2, 1)).toBeNull(); // flat ground
  });
});
```

> Match the exact `GridModel` construction and fixture (`ctx`/`test`) used by the existing `describe` blocks in that file. Follow their imports and setup; do not invent a new harness.

**Step 6: Run it red**

Run: `node --run test:browser -- src/model/grid-model.browser.test.ts`
Expected: FAIL (`commitHoleWave` not a function).

**Step 7: Implement `GridModel.commitHoleWave`**

In `src/model/grid-model.ts`, mirror `applyErosionHits` (`grid-model.ts:313`) exactly, swapping `applyHits` for `commitWave`:

```ts
/**
 * End-of-wave hole commit: folds the pooled water into the hole's puddle and
 * silts one step (see Hole.commitWave). Mirrors applyErosionHits' mutation:
 * swap to FlatGround at elevation 0, else refresh graphics; always re-detect pools.
 */
commitHoleWave(col: number, row: number, pooledWater: number): ErosionResult | null {
  if (!this.inBounds(col, row) || this.isCastle(col, row)) {
    return null;
  }
  const cell = this.cells[row][col];
  if (!(cell instanceof Hole)) {
    return null;
  }
  const result = cell.commitWave(pooledWater);
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

> `ErosionResult` is `{ newElevation: number }` (`terrain.ts:36`); `applyErosionHits` returns the `{ col, row, newElevation }` shape — match its return type annotation exactly (copy it verbatim from that method).

**Step 8: Run it green**

Run: `node --run test:browser -- src/model/grid-model.browser.test.ts`
Expected: PASS.

**Step 9: Verify and commit**

Run: `node --run static-check`
Expected: PASS.

```bash
git add src/model/terrain/hole.ts src/model/grid-model.ts src/model/terrain/hole.test.ts src/model/grid-model.browser.test.ts
git commit -m "feat(model): add once-per-wave hole commit-silt"
```

---

### Task 5: Route commit through the applier and runtime

Add the `holeCommit` event and call it for each resting cell when the wave ends. Inert while absorption is on (resting cells are empty), so no behavior change yet.

**Files:**
- Modify: `src/wave/wave-segment-types.ts` (event type)
- Modify: `src/wave/wave-event-applier.ts` (`holeCommit` branch)
- Modify: `src/wave/wave-field-runtime.ts` (commit pass in `onComplete`)
- Test: `src/wave/wave-event-applier.test.ts` (add a case)

**Step 1: Write the failing test**

In `src/wave/wave-event-applier.test.ts`, add a case following the file's existing style (it constructs a `GridModel` + `WaveEventApplier`). Assert a `holeCommit` event silts a hole and returns the eroded tile:

```ts
it("commits pooled water to a hole and returns the eroded tile", () => {
  // build grid with a depth-5 hole at (col,row) as the other cases do
  const result = applier.apply({ type: "holeCommit", col, row, pooled: 1 });
  expect(result.erodedTile).not.toBeNull();
  expect(grid.getElevation(col, row)).toBe(-4);
});
```

> Mirror the existing applier-test setup exactly. If this file turns out to need the browser project for `GridModel`, place the case where the file already lives; do not change its project.

**Step 2: Run it red**

Run: `node --run test:unit -- src/wave/wave-event-applier.test.ts`
Expected: FAIL (`holeCommit` not handled / type error).

**Step 3: Implement**

Add to the `WaveSegmentEvent` union in `src/wave/wave-segment-types.ts`:

```ts
  | { type: 'holeCommit'; col: number; row: number; pooled: number }
```

Add a branch in `WaveEventApplier.apply` (before the `tileEntered` fall-through):

```ts
if (event.type === 'holeCommit') {
  const result = this.grid.commitHoleWave(event.col, event.row, event.pooled);
  result.erodedTile = ... // see below
}
```

Concretely, mirror the existing `eroded` branch (`wave-event-applier.ts:42-46`):

```ts
if (event.type === 'holeCommit') {
  const commitResult = this.grid.commitHoleWave(event.col, event.row, event.pooled);
  result.erodedTile = commitResult ? this.grid.getCell(event.col, event.row) : null;
  return result;
}
```

In `src/wave/wave-field-runtime.ts`, replace the `onComplete` closure so it commits resting hole water before resolving. The dynamic system now passes `restingCells`:

```ts
        onComplete: (restingCells) => {
          if (this.options.applier) {
            for (const c of restingCells) {
              const applied = this.options.applier.apply({
                type: "holeCommit",
                col: c.col,
                row: c.row,
                pooled: c.depth,
              });
              if (applied.erodedTile) {
                this.erodedTiles.add(applied.erodedTile);
              }
            }
          }
          resolve({
            castleFlooded: this.castleFlooded,
            erodedTiles: [...this.erodedTiles],
            sandRedistributed: false,
          });
          this.cleanup();
        },
```

> `commitHoleWave` already ignores non-hole cells, so passing every resting cell is safe — only cells over holes silt.

**Step 4: Run it green**

Run: `node --run test:unit -- src/wave/wave-event-applier.test.ts`
Expected: PASS.

**Step 5: Verify and commit**

Run: `node --run static-check`
Expected: PASS.

```bash
git add src/wave/wave-segment-types.ts src/wave/wave-event-applier.ts src/wave/wave-field-runtime.ts src/wave/wave-event-applier.test.ts
git commit -m "feat(wave): commit resting hole pools at wave end"
```

---

### Task 6: Flip the switch — stop absorbing hole water mid-wave

Remove absorption from `applyTerrainFeedback` (castle-flood detection only). This is the behavioral change: water now pools live and channels to the deepest hole, settles via rim-aware seep, and silts at commit.

**Files:**
- Modify: `src/wave/wave-terrain-feedback.ts` (drop absorption; keep castle flood)
- Modify: `src/wave/wave-field-runtime.ts` (drop the dead `absorbed` loop and `remainingHoleCapacity` probe)
- Test: `src/wave/wave-terrain-feedback.test.ts` (rewrite for new contract + channeling reproduce)
- Test: `src/wave/wave-field-runtime-terrain.browser.test.ts` (update pooling expectations)

**Step 1: Write the failing reproduce test (channeling)**

Replace the absorption cases in `src/wave/wave-terrain-feedback.test.ts`. Keep the castle-flood case. Add a pure composition test that mimics `resolveTerrain` (flux step then feedback) and proves water reaches the deepest hole:

```ts
import { computeFluxStep, type WetCell } from "./wave-dynamic-system.ts";

describe("applyTerrainFeedback", () => {
  it("does not remove hole-resting water (water passes through unchanged)", () => {
    const res = applyTerrainFeedback({
      cells: [cell(1, 3, 5)],
      probe: probe({ isCastle: () => false }),
      floodDepth: 0.5,
    });
    expect(res.cells).toEqual([cell(1, 3, 5)]);
    expect(res.castleFlooded).toBe(false);
  });

  it("still flags castle flooding at or above floodDepth", () => {
    expect(
      applyTerrainFeedback({
        cells: [cell(7, 11, 0.8)],
        probe: probe({ isCastle: (c, r) => c === 7 && r === 11 }),
        floodDepth: 0.5,
      }).castleFlooded,
    ).toBe(true);
  });
});

describe("channeling reproduce — water flows to the deepest hole", () => {
  // Three connected holes stacked N->S at depths -1, -5, -10 (one column).
  const groundAt = (_c: number, r: number) => {
    const depth = r === 4 ? 1 : r === 5 ? 5 : r === 6 ? 10 : 0;
    return 0.5 * r - depth;
  };

  it("water seeded at the shallow hole collects in the deepest hole", () => {
    let cells: WetCell[] = [{ col: 0, row: 4, depth: 1, velX: 0, velY: 0 }];
    for (let s = 0; s < 400; s++) {
      cells = computeFluxStep({
        cells,
        width: 1,
        height: 16,
        groundAt,
        source: { open: false, depths: [0] },
        oceanSink: true,
        coeff: 0.2,
        drainThreshold: 0.01,
      });
      cells = applyTerrainFeedback({ cells, probe: probe(), floodDepth: 0.5 }).cells;
    }
    const depthAt = (r: number) => cells.find((c) => c.row === r)?.depth ?? 0;
    expect(depthAt(6)).toBeGreaterThan(depthAt(4)); // deepest hole holds more than the shallow one
    expect(depthAt(6)).toBeGreaterThan(0.5);
  });
});
```

> The `probe` helper currently sets `remainingHoleCapacity`; drop that field (see Step 3). Tune the step count / coefficients if needed so water has time to migrate; the assertion intent (deepest hole wins) is the contract.

**Step 2: Run it red**

Run: `node --run test:unit -- src/wave/wave-terrain-feedback.test.ts`
Expected: FAIL — on the old code `applyTerrainFeedback` absorbs and removes water at the -1 hole, so the deepest hole never fills; also the new signature (no `drainThreshold`/`remainingHoleCapacity`) won't match yet.

**Step 3: Implement**

Rewrite `src/wave/wave-terrain-feedback.ts` to detect castle flood only:

```ts
import type { WetCell } from "./wave-dynamic-system.ts";

/** Grid lookups the terrain feedback needs, decoupled from GridModel for testability. */
export interface TerrainProbe {
  isCastle(col: number, row: number): boolean;
}

export interface TerrainFeedbackInput {
  cells: WetCell[];
  probe: TerrainProbe;
  /** Depth on a castle cell at or above which the castle is considered flooded. */
  floodDepth: number;
}

export interface TerrainFeedbackResult {
  cells: WetCell[];
  castleFlooded: boolean;
}

/**
 * Post-flux terrain feedback for the pressure field. Holes no longer absorb here:
 * water pools live in basins (the flux kernel routes it to the deepest hole) and
 * is committed to puddleDepth + silting at wave end. This pass only flags a flood
 * when a castle cell is wet at or above floodDepth. Pure: terrain enters only
 * through the probe.
 */
export function applyTerrainFeedback(input: TerrainFeedbackInput): TerrainFeedbackResult {
  const { cells, probe, floodDepth } = input;
  let castleFlooded = false;
  for (const cell of cells) {
    if (probe.isCastle(cell.col, cell.row) && cell.depth >= floodDepth) {
      castleFlooded = true;
    }
  }
  return { cells, castleFlooded };
}
```

In `src/wave/wave-field-runtime.ts` `resolveTerrain`: update the `applyTerrainFeedback` call to drop `remainingHoleCapacity` and `drainThreshold`, and delete the `for (const delta of feedback.absorbed)` loop (it is now dead). Keep the `computeErosionHits` (wall/tower) block and the castle-flood assignment. Remove the now-unused `PRESSURE_DRAIN_THRESHOLD` import if nothing else uses it.

Update the `probe` helper in `wave-terrain-feedback.test.ts` to only provide `isCastle`.

**Step 4: Run it green**

Run: `node --run test:unit -- src/wave/wave-terrain-feedback.test.ts`
Expected: PASS (water now reaches the deepest hole; castle-flood case still passes).

**Step 5: Update the runtime browser test**

`src/wave/wave-field-runtime-terrain.browser.test.ts` — the "water pooling in a hole accumulates puddleDepth and the wave drains to empty" test asserts `erodedTiles` is empty. With siltation, a hole that pools water now silts, so the hole appears in `erodedTiles` and its puddle/elevation change. Update assertions:

- `expect(result.erodedTiles).toEqual([])` → assert the hole silted: `expect(result.erodedTiles.length).toBeGreaterThan(0)` and `expect(grid.getElevation(1, 5)).toBeGreaterThan(-2)` (silted from -2 toward flat).
- Keep `castleFlooded === false`, `sandRedistributed === false`, and the "drains to empty" entity-count assertion (commit + cleanup still clears all water).
- The castle-flood test is unchanged.

Run: `node --run test:browser -- src/wave/wave-field-runtime-terrain.browser.test.ts`
Expected: PASS.

**Step 6: Verify the whole suite and commit**

Run: `node --run static-check`
Expected: PASS. (Pay attention to `wave-field-runtime-recede.browser.test.ts` and `wave-field-runtime-erosion.browser.test.ts` — wall erosion and recede are unchanged, but confirm they still pass with the new termination path.)

```bash
git add src/wave/wave-terrain-feedback.ts src/wave/wave-field-runtime.ts src/wave/wave-terrain-feedback.test.ts src/wave/wave-field-runtime-terrain.browser.test.ts
git commit -m "feat(wave): pool water live in holes and silt at commit"
```

---

### Task 7: Remove dead code and update the design doc

Clean up the now-unreachable legacy erosion path and bring gameplay docs in line.

**Files:**
- Modify: `src/model/grid-model.ts` (remove `applyWaveWaterHit`)
- Modify: `src/model/grid-model.browser.test.ts` (remove its tests)
- Modify: `src/wave/wave-event-applier.ts` (remove the `tileEntered` fall-through if now dead)
- Modify: `docs/gameplay.md` (rewrite hole erosion → siltation)
- Modify: `AGENTS.md` (update the wave-runtime / terrain-feedback descriptions if they mention absorption)

**Step 1: Confirm `applyWaveWaterHit` is dead**

Run a search for `applyWaveWaterHit` and `tileEntered` across `src/`. They should appear only in `grid-model.ts`, its test, `wave-event-applier.ts`, and `wave-segment-types.ts`. If a non-test source path still uses them, stop and re-evaluate.

**Step 2: Remove**

- Delete `GridModel.applyWaveWaterHit` (`grid-model.ts:282`) and its `describe`/`it` blocks in `grid-model.browser.test.ts`.
- In `wave-event-applier.ts`, the final fall-through handles `tileEntered`. If `tileEntered` is no longer emitted anywhere, remove that event from the `WaveSegmentEvent` union and replace the fall-through with an exhaustive guard, or leave it if other tests still rely on it. Prefer removing dead code (YAGNI); only keep what something live uses.

**Step 3: Run tests**

Run: `node --run static-check`
Expected: PASS.

**Step 4: Update docs**

- `docs/gameplay.md` (the hole-erosion line near `:127`): replace "loses 1 elevation step every 3 water hits" with the siltation model — water pools live and channels to the deepest hole; at wave end a hole folds pooled water into its puddle and silts one step (depth −1, puddle −1), reaching flat ground after enough soakings; deep holes are strong but consumable channels.
- `AGENTS.md`: update the `wave-terrain-feedback.ts` and `wave-field-runtime.ts` descriptions to say holes pool live and commit at wave end (no per-frame absorption).
- Mark `docs/bugs/2026-06-15-water-filled-holes-stopped-eroding.md` resolved, linking this plan and the design doc.

**Step 5: Commit**

```bash
git add src/model/grid-model.ts src/model/grid-model.browser.test.ts src/wave/wave-event-applier.ts src/wave/wave-segment-types.ts docs/gameplay.md AGENTS.md docs/bugs/2026-06-15-water-filled-holes-stopped-eroding.md
git commit -m "chore: remove dead hole-erosion path and update docs"
```

---

## Done criteria

- Water seeded into a shallow hole that is connected to deeper holes collects in the deepest hole (channeling).
- A hole that holds water at wave end silts one step and reaches flat ground after enough waves; a deep hole is a strong but decaying channel.
- Flat boards and walled basins still recede and terminate; castle flood still ends the wave mid-flow; wall/tower erosion is unchanged.
- `node --run static-check` passes after every task.
