# Pressure Water Simulation Core (M2a) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up the pressure-driven water *simulation* — correct, mass-conserving, and proven by tests — as sparse `WaterCell` scene actors driven by a `WaveDynamicSystem`, with **nothing rendered and no mode wired** yet. Rendering and the live Tide path are M2b (`2026-06-12-pressure-water-m2b-render-and-wiring.md`).

**Architecture:** Water cells are real scene **actors** (`WaterCell` = `Actor` + `WaterComponent`), spawned and killed sparsely as cells wet and drain. A single ECS System, `WaveDynamicSystem`, owns the simulation: each fixed sim step it queries the live `WaterComponent`s, runs a **pure flux kernel** (`computeFluxStep`, a plain function with no Excalibur dependency — this is where mass conservation, non-negativity, no-checkerboard, and reach `D/s` are unit-tested), and reconciles the result back onto the actors (update / spawn / kill). `WaterComponent` is the sim/render contract; this milestone defines and exercises it from the sim side. The game is unchanged: no live mode constructs `WaveDynamicSystem` yet, so the flag-off legacy wave path is the only thing that runs.

**Tech Stack:** TypeScript, Excalibur 0.32 (`Actor`, `System`, `Component`, `World.query`), Vitest (unit `*.test.ts` under jsdom; browser `*.browser.test.ts` under Playwright). See `docs/testing.md`.

**Repo conventions:** Work on the current branch (`feat/pressure-model`; this repo does not use worktrees, per `AGENTS.md`). **Commit after each task** (committing is authorized; committing runs `static-check` as a pre-commit gate). Do not push unless the user asks. Fast loop: `node --run test:unit` (or `node --run test:unit -- <file>` for one file). Full gate: `node --run static-check` (tsc, lint, unit, knip, browser). Browser single file: `node --run test:browser -- <file>`. Curly braces on all `if`s; `for..of` over index loops; object arguments for 3+ params; check LSP diagnostics after each edit.

---

## Background the executor needs

### What exists today (verified)

- **`WaterComponent`** (`src/wave/water-component.ts`, M1) is a pure data holder: `depth: number`, `velocity: Vector`, positional constructor `new WaterComponent(depth?, velocity?)`. Its only caller is `WaveSegment` (line 69, `new WaterComponent(spawn.initialDepth)`). No external code reads `.velocity` (verified). It has no behavior, so it carries **no unit tests**. This milestone renames `velocity → vel` (matches Excalibur's `MotionComponent.vel`), adds `col`/`row`, and switches to an object-arg constructor.
- **Excalibur ECS API (verified against `node_modules/excalibur` 0.32):**
  - `abstract class System` requires `readonly systemType: SystemType` and `update(elapsed: number): void`. Optional `initialize(world, scene)`, `preupdate`, `postupdate`. `SystemType.Update` runs before `SystemType.Draw`; lower `static priority` runs earlier.
  - Canonical System pattern (Excalibur's own `MotionSystem`): constructor stores `world`, sets `this.systemType`, builds `this.query = world.query([...])`; `update(elapsed)` iterates `this.query.entities`.
  - `world.query([Ctor, ...])` → `Query` with `.entities` (array). `World`: `world.add(entity|system)`, `world.remove(entity, deferred?)`, `world.remove(system)`, `world.query(...)`; reach it as `scene.world`. **Entity add/remove via `scene.add`/`actor.kill()` is processed by the scene, so a freshly added actor may not appear in `world.query` until the next frame** — the sim reads the query once per frame and reconciles once per frame to sidestep this.
  - `Actor` is an `Entity`; `actor.addComponent(c)`, `actor.get(Ctor)`, `actor.kill()`.
  - `Component` is abstract with no abstract members; extend and add data fields.
- **Engine** (`src/engine.ts`) does NOT set `fixedUpdateFps`/`fixedUpdateTimestep`; `update(elapsed)` gets variable real-frame deltas. This milestone decouples the sim with its own fixed-step accumulator inside `WaveDynamicSystem` (do not change the engine's global timestep).
- **`WaveSegment`** (`src/wave/wave-segment.ts`) is the heavyweight legacy column actor (Active collider, `planWaveCells`, scripted surge in `onPostUpdate`, `mergeWith`). It still powers the flag-off path and must not be touched here; the lean `WaterCell` is a separate actor. (M5 deletes `WaveSegment`.)
- **Testing split:** pure logic (arrays/math) → unit `*.test.ts` (jsdom; importing Excalibur classes is fine under jsdom — `grid-model.test.ts` already does so transitively). Anything needing a real `World`/`Engine`/actors → browser `*.browser.test.ts` via `import { test, expect } from "../test/excalibur-browser-test.ts"` (`ctx` gives `game`, `scene`, `clock`, `step(ms)`).

### The simulation model (read before Task 2)

Ground elevation at a cell is the beach slope plus the cell's raw terrain offset: `ground(col,row) = terrainSlope * row + elevationAt(col,row)`. On flat ground `elevationAt = 0`, so `ground(row) = TERRAIN_SLOPE * row` (rises going inland/south). Total head `H = ground + depth`. Water flows down the head gradient.

- **Source (the tap):** while open, row 0 is pinned to at least `D` each step (Dirichlet boundary). North of row 0 is the **ocean sink**: a virtual cell at fixed head `0` (sea level); water flowing north out of row 0 is *discarded*. This sustains a pressure head while open and drains naturally once released (south ground is uphill, so the gradient points north → water recedes to the ocean).
- **Steady state while open:** interior settles to uniform head `= D`, so `depth(row) = D - TERRAIN_SLOPE * row`, wet while positive → reach `≈ D / TERRAIN_SLOPE` rows. With `D = 4`, `s = 0.5` → row 7 holds depth `0.5`, row 8 is dry; eight wetted rows (0–7), matching today's reach.
- **Termination:** any wet cell on the slope has a strictly-lower (north) neighbor, so it always has somewhere to drain; cells below `PRESSURE_DRAIN_THRESHOLD` are dropped (their actor is killed). The wave is over when no `WaterComponent` actors remain.

**Two-pass flux step (mass-conserving, non-negative, stable) — the kernel:**

1. **Pass 1 — capped outflow.** For each wet cell `c`, for each of 4 cardinal neighbors `n`: `headDiff = H(c) - H(n)`; desired outflow `= max(0, headDiff) * coeff`. Sum desired outflows `S_c`; if `S_c > depth(c)`, scale every outflow by `depth(c)/S_c` (can't send more than the cell holds → never negative). Accumulate each scaled outflow as `-` on `c` and `+` on the in-bounds neighbor (a dry neighbor thus becomes wet). North of row 0 is the ocean sink (head 0, outflow discarded) when enabled. Accumulate signed flux into `velX/velY` (east−west, south−north).
2. **Pass 2 — apply.** `depth(c) = max(0, depth(c) + delta(c))`; keep cells with depth above the drain threshold.

Every outflow is exactly one neighbor's inflow, so mass is conserved (modulo the intentional source pin / ocean sink). `coeff ≤ 0.25` is the 4-neighbor explicit-diffusion stability bound; use `0.2`. **`coeff` is the single stability knob** — if anything oscillates or overshoots, lower it; do not add ad-hoc damping.

The kernel takes a boolean `oceanSink`: `true` for the live model (and the reach/drain tests), `false` to make row 0's north border closed so the **pure flux operator conserves mass exactly** for the closed-box conservation / no-checkerboard tests.

---

## Task 1: WaterComponent — grid coords, `vel`, object arg

**Files:**
- Modify: `src/wave/water-component.ts`
- Modify: `src/wave/wave-segment.ts` (its one `new WaterComponent(...)` call, line 69)

No unit tests: `WaterComponent` is a behavior-free data holder.

**Step 1: Rewrite `src/wave/water-component.ts`**

```ts
import { Component, Vector } from "excalibur";

export interface WaterComponentInit {
  depth: number;
  vel?: Vector;
  col?: number;
  row?: number;
}

/**
 * Per-cell water state for the pressure-driven simulation: the single source of
 * truth for one water cell's grid coordinate, depth, and velocity. The only
 * contract between WaveDynamicSystem (writes) and WaveRenderSystem (reads, M2b).
 */
export class WaterComponent extends Component {
  depth: number;
  vel: Vector;
  col: number;
  row: number;

  constructor(init: WaterComponentInit) {
    super();
    this.depth = init.depth;
    this.vel = init.vel ?? new Vector(0, 0);
    this.col = init.col ?? 0;
    this.row = init.row ?? 0;
  }
}
```

**Step 2: Update the caller in `src/wave/wave-segment.ts` (line 69)**

```ts
    this.water = new WaterComponent({ depth: spawn.initialDepth });
```

**Step 3: Verify nothing else referenced the old API**

Run: `node --run test:unit && node --run test:browser -- src/wave/wave-segment.browser.test.ts`
Expected: PASS. (M1's delegation test reads `segment.currentDepth`, which still routes through `this.water.depth`; the rename touched only the unused `velocity` field.)

If `tsc` flags a stray `.velocity` reference, fix it to `.vel`.

**Step 4: Lint + typecheck**

Run: `node --run static-check`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/wave/water-component.ts src/wave/wave-segment.ts
git commit -m "refactor(wave): WaterComponent gains col/row, vel rename, object arg"
```

---

## Task 2: Pure flux kernel `computeFluxStep` (the risky core)

The flux math lives as a pure exported function in the system's module, so it unit-tests on plain data without booting a `World`. Tests come first and assert the numeric invariants.

**Files:**
- Create: `src/wave/wave-dynamic-system.ts` (kernel only for now; the System class lands in Task 3)
- Create (test): `src/wave/wave-dynamic-system.test.ts` (unit)

**Step 1: Write the failing tests**

`src/wave/wave-dynamic-system.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeFluxStep, type WetCell } from "./wave-dynamic-system.ts";

const COEFF = 0.2;
const THRESHOLD = 0.05;

const flat = (_col: number, _row: number) => 0;
const slope = (s: number) => (_col: number, row: number) => s * row;

const totalDepth = (cells: WetCell[]) => cells.reduce((sum, c) => sum + c.depth, 0);
const depthAt = (cells: WetCell[], col: number, row: number) =>
  cells.find((c) => c.col === col && c.row === row)?.depth ?? 0;

const run = (
  cells: WetCell[],
  steps: number,
  opts: { width: number; height: number; groundAt: (c: number, r: number) => number; source: { open: boolean; depth: number }; oceanSink: boolean },
) => {
  let current = cells;
  for (let s = 0; s < steps; s++) {
    current = computeFluxStep({ cells: current, coeff: COEFF, drainThreshold: THRESHOLD, ...opts });
  }
  return current;
};

describe("computeFluxStep — closed box (oceanSink off)", () => {
  it("conserves mass and stays non-negative as water spreads", () => {
    const seed: WetCell[] = [{ col: 3, row: 3, depth: 10, velX: 0, velY: 0 }];
    const start = totalDepth(seed);
    const out = run(seed, 200, {
      width: 7, height: 7, groundAt: flat, source: { open: false, depth: 0 }, oceanSink: false,
    });
    expect(totalDepth(out)).toBeCloseTo(start, 3);
    for (const c of out) {
      expect(c.depth).toBeGreaterThanOrEqual(0);
    }
  });

  it("spreads monotonically from the seed and stays symmetric (no checkerboard)", () => {
    const seed: WetCell[] = [{ col: 4, row: 4, depth: 12, velX: 0, velY: 0 }];
    const out = run(seed, 150, {
      width: 9, height: 9, groundAt: flat, source: { open: false, depth: 0 }, oceanSink: false,
    });
    for (let col = 4; col < 8; col++) {
      expect(depthAt(out, col, 4)).toBeGreaterThanOrEqual(depthAt(out, col + 1, 4) - 1e-6);
    }
    expect(depthAt(out, 3, 4)).toBeCloseTo(depthAt(out, 5, 4), 4);
    expect(depthAt(out, 4, 3)).toBeCloseTo(depthAt(out, 4, 5), 4);
  });
});

describe("computeFluxStep — slope with source + ocean sink", () => {
  it("converges to ~D/s rows of reach with a held source", () => {
    const out = run([], 4000, {
      width: 3, height: 16, groundAt: slope(0.5), source: { open: true, depth: 4 }, oceanSink: true,
    });
    const deepestWetRow = Math.max(...out.map((c) => c.row));
    expect(deepestWetRow).toBeGreaterThanOrEqual(6);
    expect(deepestWetRow).toBeLessThanOrEqual(8);
    expect(depthAt(out, 1, 2)).toBeCloseTo(4 - 0.5 * 2, 1);
    expect(depthAt(out, 1, 5)).toBeCloseTo(4 - 0.5 * 5, 1);
  });

  it("drains to empty after the source closes", () => {
    const filled = run([], 2000, {
      width: 3, height: 16, groundAt: slope(0.5), source: { open: true, depth: 4 }, oceanSink: true,
    });
    expect(filled.length).toBeGreaterThan(0);
    const drained = run(filled, 6000, {
      width: 3, height: 16, groundAt: slope(0.5), source: { open: false, depth: 0 }, oceanSink: true,
    });
    expect(drained.length).toBe(0);
  });
});
```

**Step 2: Run to verify it fails**

Run: `node --run test:unit -- src/wave/wave-dynamic-system.test.ts`
Expected: FAIL, cannot resolve `./wave-dynamic-system.ts`.

**Step 3: Write the kernel**

`src/wave/wave-dynamic-system.ts`:

```ts
export interface WetCell {
  col: number;
  row: number;
  depth: number;
  velX: number;
  velY: number;
}

export interface FluxStepInput {
  cells: WetCell[];
  width: number;
  height: number;
  /** Ground elevation = beach slope + raw terrain offset. */
  groundAt: (col: number, row: number) => number;
  /** Row-0 tap: while open, row 0 is pinned to at least `depth`. */
  source: { open: boolean; depth: number };
  /** When true, the border north of row 0 is the ocean sink (head 0, outflow discarded). */
  oceanSink: boolean;
  /** Per-step fraction of head difference moved across an edge (<= 0.25). */
  coeff: number;
  /** Cells at or below this depth are dropped. */
  drainThreshold: number;
}

const DIRS = [
  { dc: -1, dr: 0 },
  { dc: 1, dr: 0 },
  { dc: 0, dr: -1 },
  { dc: 0, dr: 1 },
];

/**
 * One fixed simulation tick: a two-pass, mass-conserving, non-negative flux over
 * a sparse set of wet cells. Pure — no Excalibur, no shared state — so the
 * stability and reach invariants are unit-testable on plain data. Returns the
 * next set of wet cells (cells that drain below the threshold are omitted; dry
 * neighbors that gain enough depth appear).
 */
export function computeFluxStep(input: FluxStepInput): WetCell[] {
  const { cells, width, height, groundAt, source, oceanSink, coeff, drainThreshold } = input;
  const key = (col: number, row: number): number => row * width + col;
  const inBounds = (col: number, row: number): boolean =>
    col >= 0 && col < width && row >= 0 && row < height;

  const depth = new Map<number, number>();
  for (const cell of cells) {
    depth.set(key(cell.col, cell.row), cell.depth);
  }
  if (source.open) {
    for (let col = 0; col < width; col++) {
      const k = key(col, 0);
      depth.set(k, Math.max(depth.get(k) ?? 0, source.depth));
    }
  }

  const head = (col: number, row: number): number =>
    groundAt(col, row) + (depth.get(key(col, row)) ?? 0);

  const delta = new Map<number, number>();
  const velX = new Map<number, number>();
  const velY = new Map<number, number>();
  const bump = (map: Map<number, number>, k: number, v: number): void => {
    map.set(k, (map.get(k) ?? 0) + v);
  };

  for (const [k, d] of depth) {
    if (d <= 0) {
      continue;
    }
    const col = k % width;
    const row = Math.floor(k / width);
    const h = groundAt(col, row) + d;

    const desired: number[] = [];
    let sum = 0;
    for (const { dc, dr } of DIRS) {
      const nc = col + dc;
      const nr = row + dr;
      let neighborHead: number;
      if (inBounds(nc, nr)) {
        neighborHead = head(nc, nr);
      } else if (nr < 0 && oceanSink) {
        neighborHead = 0;
      } else {
        neighborHead = Number.POSITIVE_INFINITY;
      }
      const out = Math.max(0, h - neighborHead) * coeff;
      desired.push(out);
      sum += out;
    }

    const scale = sum > d ? d / sum : 1;
    for (let i = 0; i < DIRS.length; i++) {
      const out = desired[i] * scale;
      if (out <= 0) {
        continue;
      }
      const { dc, dr } = DIRS[i];
      const nc = col + dc;
      const nr = row + dr;
      bump(delta, k, -out);
      if (inBounds(nc, nr)) {
        bump(delta, key(nc, nr), out);
      }
      bump(velX, k, dc * out);
      bump(velY, k, dr * out);
    }
  }

  const result: WetCell[] = [];
  const keys = new Set<number>([...depth.keys(), ...delta.keys()]);
  for (const k of keys) {
    const nd = Math.max(0, (depth.get(k) ?? 0) + (delta.get(k) ?? 0));
    if (nd <= drainThreshold) {
      continue;
    }
    result.push({
      col: k % width,
      row: Math.floor(k / width),
      depth: nd,
      velX: velX.get(k) ?? 0,
      velY: velY.get(k) ?? 0,
    });
  }
  return result;
}
```

**Step 4: Run to verify it passes**

Run: `node --run test:unit -- src/wave/wave-dynamic-system.test.ts`
Expected: PASS (4 tests). If the monotonic/symmetry test oscillates, lower `COEFF` in the test and `PRESSURE_FLUX_COEFF` in Task 3 (stay `≤ 0.25`); `0.2` should pass.

**Step 5: Lint + typecheck**

Run: `node --run static-check`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/wave/wave-dynamic-system.ts src/wave/wave-dynamic-system.test.ts
git commit -m "feat(wave): pure two-pass flux kernel with conservation + reach tests"
```

---

## Task 3: WaterCell actor + WaveDynamicSystem

The lean per-cell actor and the System that drives the kernel and reconciles actors. Needs a real `World`, so it is a browser test.

**Files:**
- Create: `src/wave/water-cell.ts`
- Modify: `src/wave/wave-dynamic-system.ts` (add the `WaveDynamicSystem` class below the kernel)
- Modify: `src/config.ts` (sim constants)
- Create (test): `src/wave/wave-dynamic-system.browser.test.ts`

**Step 1: Add config constants to `src/config.ts`**

```ts
/** Pressure-driven water: per-step fraction of head difference moved across an edge (<= 0.25 for stability). */
export const PRESSURE_FLUX_COEFF = 0.2;
/** Depth at or below which a water cell is dropped (its actor killed). */
export const PRESSURE_DRAIN_THRESHOLD = 0.05;
/** Fixed simulation timestep in ms (decoupled from render frame delta). */
export const PRESSURE_SIM_STEP_MS = 1000 / 60;
/** How long the ocean source tap is held open per wave, in ms. */
export const PRESSURE_SURGE_WINDOW_MS = 1500;
```

**Step 2: Write the lean actor — `src/wave/water-cell.ts`**

```ts
import { Actor, Vector } from "excalibur";
import { WaterComponent } from "./water-component.ts";

export interface WaterCellInit {
  col: number;
  row: number;
  depth: number;
  vel: Vector;
  gridLeft: number;
  gridTop: number;
  tileSize: number;
}

/**
 * A single grid cell of pressure-driven water: a positioned scene Actor that
 * carries a WaterComponent and nothing else (no collider, no scripted motion).
 * WaveDynamicSystem spawns one per wet cell and kills it when the cell drains.
 * Rendering is done by the overlay (M2b), so the actor has no graphics of its own.
 */
export class WaterCell extends Actor {
  readonly water: WaterComponent;

  constructor(init: WaterCellInit) {
    super({
      pos: new Vector(
        init.gridLeft + init.col * init.tileSize + init.tileSize / 2,
        init.gridTop + init.row * init.tileSize + init.tileSize / 2,
      ),
      width: init.tileSize,
      height: init.tileSize,
      name: `WaterCell-${init.col}:${init.row}`,
      z: 7,
    });
    this.graphics.isVisible = false;
    this.water = new WaterComponent({ depth: init.depth, vel: init.vel, col: init.col, row: init.row });
    this.addComponent(this.water);
  }
}
```

**Step 3: Write the failing test — `src/wave/wave-dynamic-system.browser.test.ts`**

```ts
import { expect, test } from "../test/excalibur-browser-test.ts";
import type { Scene } from "excalibur";
import { WaterComponent } from "./water-component.ts";
import { WaveDynamicSystem } from "./wave-dynamic-system.ts";

const drive = (ctx: { step(ms: number): void }, frames: number, ms = 16) => {
  for (let i = 0; i < frames; i++) {
    ctx.step(ms);
  }
};

const makeSystem = (scene: Scene, onComplete?: () => void, surgeWindowMs = 100_000) =>
  new WaveDynamicSystem({
    scene,
    width: 3,
    height: 12,
    sourceDepth: 4,
    groundAt: (_col, row) => 0.5 * row,
    gridLeft: 0,
    gridTop: 32,
    tileSize: 16,
    surgeWindowMs,
    onComplete,
  });

test("spawns WaterCell actors that mirror the simulated field", async ({ ctx }) => {
  ctx.scene.world.add(makeSystem(ctx.scene));

  drive(ctx, 60);

  const entities = ctx.scene.world.query([WaterComponent]).entities;
  expect(entities.length).toBeGreaterThan(0);
  const row0 = entities.map((e) => e.get(WaterComponent)!).filter((w) => w.row === 0);
  expect(row0.length).toBeGreaterThan(0);
  expect(Math.max(...row0.map((w) => w.depth))).toBeGreaterThan(2);
});

test("fires onComplete and kills all actors after the surge window + drain", async ({ ctx }) => {
  let completed = false;
  ctx.scene.world.add(makeSystem(ctx.scene, () => {
    completed = true;
  }, 200));

  drive(ctx, 800);

  expect(completed).toBe(true);
  expect(ctx.scene.world.query([WaterComponent]).entities.length).toBe(0);
});
```

**Step 4: Run to verify it fails**

Run: `node --run test:browser -- src/wave/wave-dynamic-system.browser.test.ts`
Expected: FAIL, `WaveDynamicSystem is not a constructor`.

**Step 5: Append the System to `src/wave/wave-dynamic-system.ts`**

Add the imports at the top of the file:

```ts
import { System, SystemType, Vector, type Scene } from "excalibur";
import {
  PRESSURE_DRAIN_THRESHOLD,
  PRESSURE_FLUX_COEFF,
  PRESSURE_SIM_STEP_MS,
  PRESSURE_SURGE_WINDOW_MS,
} from "../config.ts";
import { WaterComponent } from "./water-component.ts";
import { WaterCell } from "./water-cell.ts";
```

Append the class:

```ts
export interface WaveDynamicSystemOptions {
  scene: Scene;
  width: number;
  height: number;
  sourceDepth: number;
  groundAt: (col: number, row: number) => number;
  gridLeft: number;
  gridTop: number;
  tileSize: number;
  surgeWindowMs?: number;
  onComplete?: () => void;
}

/**
 * Owns the pressure-driven simulation. Each fixed sim step it reads the live
 * WaterComponents, runs computeFluxStep, and reconciles the result onto scene
 * actors (update existing / spawn new WaterCells / kill drained ones). Reads the
 * query once per frame and reconciles once per frame, so deferred entity
 * add/remove never desyncs intermediate sub-steps.
 */
export class WaveDynamicSystem extends System {
  readonly systemType = SystemType.Update;
  static priority = -1;

  private readonly query;
  private accumulatorMs = 0;
  private simTimeMs = 0;
  private sourceOpen = true;
  private completed = false;

  constructor(private readonly opts: WaveDynamicSystemOptions) {
    super();
    this.query = opts.scene.world.query([WaterComponent]);
  }

  update(elapsed: number): void {
    if (this.completed) {
      return;
    }
    this.accumulatorMs = Math.min(this.accumulatorMs + elapsed, PRESSURE_SIM_STEP_MS * 8);
    if (this.accumulatorMs < PRESSURE_SIM_STEP_MS) {
      return;
    }

    const window = this.opts.surgeWindowMs ?? PRESSURE_SURGE_WINDOW_MS;
    let cells = this.readCells();
    while (this.accumulatorMs >= PRESSURE_SIM_STEP_MS) {
      if (this.sourceOpen && this.simTimeMs >= window) {
        this.sourceOpen = false;
      }
      cells = computeFluxStep({
        cells,
        width: this.opts.width,
        height: this.opts.height,
        groundAt: this.opts.groundAt,
        source: { open: this.sourceOpen, depth: this.opts.sourceDepth },
        oceanSink: true,
        coeff: PRESSURE_FLUX_COEFF,
        drainThreshold: PRESSURE_DRAIN_THRESHOLD,
      });
      this.accumulatorMs -= PRESSURE_SIM_STEP_MS;
      this.simTimeMs += PRESSURE_SIM_STEP_MS;
    }

    this.reconcile(cells);

    if (!this.sourceOpen && cells.length === 0 && !this.completed) {
      this.completed = true;
      this.opts.onComplete?.();
    }
  }

  private readCells(): WetCell[] {
    const cells: WetCell[] = [];
    for (const entity of this.query.entities) {
      const w = entity.get(WaterComponent)!;
      cells.push({ col: w.col, row: w.row, depth: w.depth, velX: w.vel.x, velY: w.vel.y });
    }
    return cells;
  }

  private reconcile(cells: WetCell[]): void {
    const actorByKey = new Map<string, WaterCell>();
    for (const entity of this.query.entities) {
      const w = entity.get(WaterComponent)!;
      actorByKey.set(`${w.col}:${w.row}`, entity as WaterCell);
    }

    const nextKeys = new Set<string>();
    for (const cell of cells) {
      const k = `${cell.col}:${cell.row}`;
      nextKeys.add(k);
      const existing = actorByKey.get(k);
      if (existing) {
        existing.water.depth = cell.depth;
        existing.water.vel = new Vector(cell.velX, cell.velY);
      } else {
        const actor = new WaterCell({
          col: cell.col,
          row: cell.row,
          depth: cell.depth,
          vel: new Vector(cell.velX, cell.velY),
          gridLeft: this.opts.gridLeft,
          gridTop: this.opts.gridTop,
          tileSize: this.opts.tileSize,
        });
        this.opts.scene.add(actor);
        actorByKey.set(k, actor);
      }
    }

    for (const [k, actor] of actorByKey) {
      if (!nextKeys.has(k)) {
        actor.kill();
      }
    }
  }

  /** Kill every live water actor (teardown, used by M2b's runtime). */
  clear(): void {
    for (const entity of this.query.entities) {
      (entity as WaterCell).kill();
    }
  }
}
```

**Step 6: Run to verify it passes**

Run: `node --run test:browser -- src/wave/wave-dynamic-system.browser.test.ts`
Expected: PASS (2 tests).

**Step 7: Lint + typecheck + full suite**

Run: `node --run static-check`
Expected: PASS.

**Step 8: Commit**

```bash
git add src/wave/water-cell.ts src/wave/wave-dynamic-system.ts src/config.ts src/wave/wave-dynamic-system.browser.test.ts
git commit -m "feat(wave): WaterCell actors driven by WaveDynamicSystem"
```

---

## Final verification

Run the full gate and confirm green before declaring M2a done:

Run: `node --run static-check`
Expected: PASS (tsc, lint, unit, knip, browser).

The game is unchanged: nothing constructs `WaveDynamicSystem` outside the new tests, so Tide and Classic play exactly as before.

## Definition of done

- `WaterComponent` carries `depth`, `vel`, `col`, `row` (object-arg constructor); no behavior, no tests.
- `computeFluxStep` is a pure kernel with unit tests proving mass conservation, non-negativity, no-checkerboard smoothing, reach `≈ D / TERRAIN_SLOPE`, and drain-to-empty.
- Water cells are sparse `WaterCell` scene actors carrying `WaterComponent`; `WaveDynamicSystem` drives the kernel on a fixed timestep and reconciles actors (update / spawn / kill), firing `onComplete` when the source has released and no water remains.
- No mode wires the system yet; default behavior is unchanged; `node --run static-check` is green.

## Notes for the executor

- **The flux kernel stays pure** (plain `WetCell`/`number` data + injected `groundAt`; no Excalibur, no shared state). This is what keeps the risky math unit-testable; do not reach into Excalibur from `computeFluxStep`.
- **`PRESSURE_FLUX_COEFF` is the single stability knob.** If conservation/no-checkerboard/reach tests oscillate or overshoot, lower it (`≤ 0.25`); do not add ad-hoc damping.
- **Read the query once per frame, reconcile once per frame.** Excalibur defers entity add/remove, so a freshly added `WaterCell` is not queryable until next frame. The sub-step loop runs the pure kernel in memory; actors are synced only at the frame boundary. Do not re-read the query inside the sub-step loop.
- **Do not touch the engine's global timestep.** The fixed step lives in `WaveDynamicSystem`'s accumulator.
- **Do not touch the legacy path.** `WaveSegment`, `WaveActorRuntime`, and the overlay are untouched in M2a; `WaterCell` is a separate lean actor.
- **Scope discipline (YAGNI):** flat ground only, no terrain interaction (M3), no erosion (M4), no rendering or live wiring (M2b). `vel` is populated for the contract but only becomes load-bearing in M4.
- **Knip at the milestone boundary:** `WaveDynamicSystem.clear()` and `WaterCell` are exercised by this milestone's tests, so knip should be satisfied. If knip ever flags them as unused production exports, that is expected to resolve in M2b (`WaveFieldRuntime` consumes both); keep the milestone green rather than deleting them.
- Single-file runners (`node --run test:unit -- <file>` / `node --run test:browser -- <file>`) are verified; use them for the red/green loop, with `static-check` as the full gate.
```
