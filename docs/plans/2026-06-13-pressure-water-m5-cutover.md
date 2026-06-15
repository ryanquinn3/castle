# Pressure Water M5: Tune, Generalize, and Cut Over — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make both game modes run on the pressure-driven water field, with waves that arrive unevenly across columns and an acceptable front feel; then remove the `PRESSURE_WATER_ENABLED` flag and delete the legacy scripted-surge path (`WaveSegment`, `WaveActorRuntime`, the deprecated deterministic solver, and the dead `WaveRenderer` animation).

**Architecture:** Three movements, sequenced so the game stays playable and `node --run static-check` stays green after every commit. **Generalize** the source so the per-column lateral profile from `generateWaveCurve` drives the field (today `WaveFieldRuntime` collapses it to a single scalar). **Tune** front sharpness and the source profile behind the flag (eyeball + subjective sign-off). **Cut over** Tide then Classic to `WaveFieldRuntime`, remove the flag, and delete the now-dead legacy code in dependency order, running `knip` after each deletion.

**Tech Stack:** TypeScript, Excalibur 0.32, Vitest (unit `*.test.ts` jsdom; browser `*.browser.test.ts` Playwright/chromium). See `docs/testing.md`.

**Repo conventions:** Work on the current branch (`feat/pressure-model`; no worktrees, per `AGENTS.md`). **Commit after each task** (committing is authorized; the pre-commit hook runs `static-check`). Per `docs/plans/CLAUDE.md`: sub-agent driven execution with the sonnet model, commit after each task. Do not push unless the user asks. Fast loop: `node --run test:unit`. Single file: `node --run test:unit -- <file>` / `node --run test:browser -- <file>`. Full gate: `node --run static-check` (tsc, lint, unit, knip, browser). Curly braces on all `if`s; `for..of` over index loops; object arguments for 3+ params; check LSP diagnostics after each edit.

---

## Prerequisite

M4 (`2026-06-12-pressure-water-m4-erosion.md`) is landed and the full gate is green with `PRESSURE_WATER_ENABLED = false`. The field path (`WaveFieldRuntime` + `WaveDynamicSystem`/`computeFluxStep` + `WaveRenderSystem` + `applyTerrainFeedback` + `computeErosionHits`) is wired into Tide behind the flag and exercised by browser tests.

## Design decisions

- **Per-column source, not a scalar.** Today `WaveFieldRuntime.playWave` does `const sourceDepth = Math.max(...spawns.map((s) => s.initialDepth))` (`src/wave/wave-field-runtime.ts:57`) and `computeFluxStep` pins the whole of row 0 to that single value (`src/wave/wave-dynamic-system.ts:59-64, 125-129`). M5 changes the kernel's `source` from `{ open; depth: number }` to `{ open; depths: number[] }` so each column is held at its own `generateWaveCurve` depth. This is the "lateral source profile" open question, resolved by threading the existing curve through instead of flattening it.
- **Front sharpness is a tuning problem first, a kernel change only if needed.** `computeFluxStep` is pure hydrostatic relaxation; it computes `velX`/`velY` (consumed only by erosion) but never advects momentum, so the front is inherently rounded. Task 3 tunes the existing knobs (`PRESSURE_FLUX_COEFF`, `PRESSURE_SURGE_WINDOW_MS`, source-depth scaling) and gets the user's subjective sign-off. Adding an inertia/front-steepening term to the kernel is a **contingency** (Task 3b) pursued only if the rounded front is rejected — it is the milestone's main risk and is gated on sign-off, not done speculatively (YAGNI).
- **Cut over Tide before Classic.** Tide already has the flag branch, so it is the lower-risk pilot. Classic (`level-session.ts`) currently has no field path at all and must be wired fresh.
- **Delete in dependency order, `knip`-green per commit.** Sessions stop constructing `WaveActorRuntime` first; only then is the legacy code unreferenced and deletable. Production and its co-located tests are deleted in the same commit so `tsc` never breaks.
- **`generateWaveCurve` stays.** It is the lateral profile generator and is consumed by both paths via `generateWaveSegmentSpawns` (`src/wave/wave-spawner.ts:29`). Only the scripted-actor-specific spawn fields (`x`, `y`, `speed`, `maxTravelDistance`) and the legacy noise become dead.

---

## Visual verification strategy (read before starting)

A passing test suite does **not** mean the water looks right. This migration replaces the entire water-rendering path (scripted `WaveSegment` actors → a rasterized depth field through `WaveOverlay`), so the highest risk is "all green, looks awful." We mitigate it with reproducible screenshot artifacts, apples-to-apples legacy-vs-field comparison on identical boards, explicit visual acceptance criteria, and human sign-off gates at every behavior-changing step — not just at the end when the legacy path is already deleted and there is nothing left to compare against.

### Principles

- **Capture legacy baselines first (Task 0), before any behavior change.** Once Phase E deletes `WaveActorRuntime`/`WaveSegment` the reference is gone. The baseline PNGs are the contract the field path must visually meet or beat.
- **Same boards, same frames, both paths.** Both runtimes share `playWave(spawns)` on a bare scene, so one parameterized harness renders legacy and field on the *same* scenario boards at the *same* canonical frames. Differences are then real, not setup noise.
- **Deterministic frames.** Drive everything on the test clock (`ctx.step(ms)`); capture at named frames (advance / peak / recede / settled), never "whenever". This makes every capture reproducible and re-runnable after a tuning change.
- **Human review at gates, artifacts as evidence.** Pixel-diffing water is too brittle to gate on; instead each checkpoint produces a labeled PNG set the user reviews against the criteria below and signs off. (Optional: a perceptual-diff is fine as an advisory signal, never a hard gate.)
- **Visuals block progress.** A failed visual checkpoint is a stop, exactly like a failed test. Do not cut over (Phase C/D) or delete (Phase E) on unreviewed visuals.

### Scenario catalog

A fixed set of boards (built in the harness from `GridModel` + `placeWall`/hole/tower/castle, mirroring the debug-JSON format in `AGENTS.md`). Each is captured at the canonical frames for both paths:

| ID | Board | What it proves visually |
|----|-------|--------------------------|
| S1 | Flat ground, uniform source | Front shape, depth→color gradient, overlay grid alignment (the `+1` ocean-band offset), recede-to-empty |
| S2 | One tall wall (L3/L4) mid-grid | Water flows *around*, wall cell stays dry, lateral spread reads clearly |
| S3 | One low wall (L1) | Overtopping reads as water sitting on + passing the wall |
| S4 | A hole / trench | Pooling fill, puddle color/depth, finite capacity |
| S5 | Wall + tower in the path | Erosion: terrain swaps, the orange `flashErodedTiles` still fires |
| S6 | Castle in the path, strong source | Castle-flood loss visual |
| S7 | Multi-peak uneven source (`[6,1,6]`-style) | Waves arrive unevenly across columns (the M5 source-profile change) |

### Canonical frames (per scenario)

Capture by stepping the test clock to: **advance** (~early inland travel), **peak** (near max reach), **recede** (source released, draining), **settled** (after drain — should be visually clear, no orphaned overlay). File naming: `m5/<path>/<scenarioId>-<frame>.png`, e.g. `m5/field/S2-peak.png`, `m5/legacy/S2-peak.png`.

### Visual acceptance criteria (concrete — the review checklist)

1. **Grid alignment:** water overlay sits on cell centers; no half-cell shift, no drift across columns (validates the ocean-band offset end-to-end, not just in the rasterizer unit test).
2. **Depth gradient:** deeper water reads visibly different from shallow; the gradient is smooth (bilinear), not blocky per-cell squares.
3. **Front coherence (post-tuning):** the leading edge reads as a wave front, not a scattered speckle or checkerboard; no single-cell flicker between frames.
4. **Lateral behavior:** spread around walls (S2) and overtopping (S3) are visibly distinct.
5. **Pooling:** holes fill and hold water with a believable surface (S4).
6. **Erosion feedback:** eroded tiles flash orange and the terrain sprite swaps (S5).
7. **Recede & cleanup:** water drains north and the **settled** frame is clear — no stuck cells, no leftover overlay, no ghost actors (corroborated by the existing "no `WaterComponent` entities remain" assertion).
8. **Z-order:** water renders above terrain but below HUD/castle overlays; nothing is occluded or double-drawn.
9. **Uneven arrival (S7):** columns visibly reach different depths/rows.
10. **Performance sanity:** a fully flooded board does not trip the `configurePerformanceCanvas2DFallback` threshold (fps < 20 for 100 frames) in the dev server; note frame health during the manual pass.

### Checkpoint cadence

- **Task 0:** capture all legacy baselines (`m5/legacy/*`).
- **After Task 2 (source profile):** capture `m5/field/*`; review S1/S7 for alignment, gradient, uneven arrival. First field-vs-legacy comparison.
- **Task 3 (tuning):** iterate against criteria 2–4 until the user signs off the front; re-capture each iteration.
- **After Task 4 (Tide cutover) and Task 5 (Classic cutover):** manual dev-server play pass + a fresh field capture; confirm in the *real session* (HUD, castle overlay, transitions), not just the harness.
- **Phase E gate (Task 6 preamble):** explicit visual lock-in sign-off — field artifacts meet/beat baseline across all scenarios — **required before any deletion**, since deletion removes the comparison forever.
- **Final:** re-run the harness; the field artifact set is the new baseline of record.

---

## Background the executor needs (verified)

### Current wiring (verified file:line)

- **Tide** branches on the flag (`src/tide-session.ts:329-342`):
  ```ts
  if (PRESSURE_WATER_ENABLED) {
    this.waterRuntime = new WaveFieldRuntime(this, this.makeWaveGridAdapter(), TERRAIN_SLOPE, {
      applier: new WaveEventApplier(this.grid, this.sandLayer),
    });
    result = await this.waterRuntime.playWave(spawns);
  } else {
    this.waveRuntime = new WaveActorRuntime(
      this, this.makeWaveGridAdapter(), new WaveEventApplier(this.grid, this.sandLayer), TERRAIN_SLOPE,
    );
    result = await this.waveRuntime.playWave(spawns);
  }
  ```
- **Classic** always uses the legacy runtime (`src/level-session.ts:281-288`); no flag, no field path:
  ```ts
  this.waveRuntime?.cleanup();
  this.waveRuntime = new WaveActorRuntime(
    this, this.makeWaveGridAdapter(), new WaveEventApplier(this.grid, this.sandLayer), TERRAIN_SLOPE,
  );
  result = await this.waveRuntime.playWave(spawns);
  ```
- Both runtimes share the contract `playWave(spawns: WaveSegmentSpawn[]): Promise<WaveActorRuntimeResult>` and both sessions build `spawns` identically via `generateWaveSegmentSpawns(...)` (`src/level-session.ts:269-279`, `src/tide-session.ts:309-319`). `makeWaveGridAdapter()` is identical in both sessions (`level-session.ts:188-198`, `tide-session.ts:228-238`).
- `WaveActorRuntimeResult = { castleFlooded: boolean; erodedTiles: Terrain[]; sandRedistributed: boolean }` (`src/wave/wave-segment-types.ts:40-44`). Sessions consume `erodedTiles` (→ `waveRenderer.flashErodedTiles`), `sandRedistributed` (→ a 260ms delay), and `castleFlooded` (→ `gameMode.resolveWave`). The field path already returns `sandRedistributed: false`, so the delay is simply skipped — no session change needed for that.

### The kernel source (verified)

`computeFluxStep` (`src/wave/wave-dynamic-system.ts:49`) pins row 0 from a scalar in two places:
```ts
// Pass 1 (lines 59-64):
if (source.open) {
  for (let col = 0; col < width; col++) {
    const k = key(col, 0);
    depth.set(k, Math.max(depth.get(k) ?? 0, source.depth));
  }
}
// Reapply after flux (lines 125-129):
if (source.open && row === 0) {
  nd = Math.max(nd, source.depth);
}
```
`FluxStepInput.source` is typed `{ open: boolean; depth: number }` (`:26`). `WaveDynamicSystemOptions.sourceDepth: number` (`:148`) is passed through at `:205` as `source: { open: this.sourceOpen, depth: this.opts.sourceDepth }`.

The kernel's unit tests (`src/wave/wave-dynamic-system.test.ts`) construct `source: { open, depth }` in a `run` helper (`:17`) and at call sites `:31,42,55,66,70,86,102`.

### `generateWaveCurve` (verified, stays live)

`src/model/wave-simulation.ts:26-38`:
```ts
export function generateWaveCurve(
  numCols: number, peakHeight: number, valleyFraction: number, peakPhase: number, numPeaks: number,
): number[] {
  return Array.from({ length: numCols }, (_, col) => {
    const x = col / (numCols - 1) * numPeaks + peakPhase;
    const wFactor = Math.abs(Math.sin(Math.PI * x));
    return peakHeight * valleyFraction + (peakHeight - peakHeight * valleyFraction) * wFactor;
  });
}
```

### Deletion blast radius (verified)

**Files deletable wholesale after sessions stop using the legacy runtime** (production + co-located test in the same commit):
- `src/wave/wave-actor-runtime.ts` + `src/wave/wave-actor-runtime.test.ts`
- `src/wave/wave-segment.ts` + `src/wave/wave-segment.browser.test.ts`
- `src/model/flow-field.ts` + `src/model/flow-field.test.ts`
- `src/model/water-column.ts` (used only by `flow-field.ts`)
- `src/model/wave-simulation.test.ts` (tests the deprecated `simulateWave`)

**Files edited to drop legacy members:**
- `src/wave/wave-event-applier.ts` — the `blocked`/`overtopped` branch (→ `applySandRedistributionAt`) and the `tileEntered` fall-through (→ `applyWaveWaterHit`) become unreachable once `WaveSegment` is gone (only `WaveSegment` emits those; the field emits only `eroded` + `absorbed`). Remove them, leaving `absorbed` + `eroded`.
- `src/model/grid-model.ts` — `applyWaveWaterHit` (`:285`), `applySandRedistributionAt` (`:336`), `applySandRedistribution` (`:403`), and the `WallErosionEvent` import/re-export (`:8,10`) become dead once the applier branches are removed.
- `src/model/wave-simulation.ts` — delete the `@deprecated` `simulateWave`/`SimulateWaveInput`/`WaveResult` and the `flow-field.ts` import (`:16`); **keep** `generateWaveCurve`. `WallErosionEvent` is deletable once `grid-model.ts` and `wave-renderer.ts` no longer reference it.
- `src/view/wave-renderer.ts` — `playWave` (`:62`, never called — already orphaned), `flashSandRedistribution` (`:231`, never called), `buildCastleFlashOverlays` (`:212`, only called by the dead `playWave`), and the private animation helpers they use (`spawnOverlay`, `rebuildEdges`, `clearEdges`, `spawnEdge`, `spawnBlockFlash`, `spawnOvertopBar`, `cornerHeight`, `waveColorRGBA`) are all dead. **Keep `flashErodedTiles`** (`:270`, called by both sessions) and `cleanup`. Removing `playWave`/`flashSandRedistribution` severs the `WaveResult`/`WallErosionEvent` import (`:2`).
- `src/wave/wave-spawner.ts` — after cutover the field only needs per-column `initialDepth`; the actor fields are dead. Either keep `generateWaveSegmentSpawns` as-is (cheapest) or slim it (Task 9, optional).
- `src/config.ts` — `WAVE_HEIGHT_START` (already unreferenced), `WAVE_SEGMENT_SURGE_SPEED`, `WAVE_SEGMENT_BASE_TRAVEL`, `WAVE_SEGMENT_TRAVEL_PER_DEPTH`, `WAVE_FRONT_NOISE_AMPLITUDE`, `WAVE_FRONT_NOISE_FREQUENCY` (all only via `wave-spawner.ts`), and `WAVE_ROW_DELAY_MS`, `WAVE_RECEDE_ROW_DELAY_MS`, `WATER_RENDER_THRESHOLD` (only via the dead `WaveRenderer.playWave`) become deletable depending on whether `wave-spawner` is slimmed.

**Shared types that stay** (used by the field path): `WaveSegmentSpawn`, `WaveSegmentGrid`, `WaveActorRuntimeResult`, `WaveState` (`wave-overlay.ts`). The `tileEntered` member of the `WaveSegmentEvent` union is legacy-only and is removed with the applier branch. Naming convergence (renaming the `WaveSegment*` types) is optional Task 10.

**knip config** (`knip.config.ts`): `entry: ["tools/**/*.ts"]`, `project: ["src/**/*.ts","src/**/*.tsx"]`. Test files are discovered by Vitest, not flagged. `knip` runs inside `static-check`, so a clean gate proves no orphaned exports remain.

---

## Phase 0 — Visual baseline harness

### Task 0: Reusable screenshot harness + legacy baselines

Build the parameterized scenario harness and capture the **legacy** path artifacts now, while it still exists. No production code changes; this is pure test/tooling and must land before any behavior change.

**Files:**
- Create: `src/wave/wave-visual-scenarios.ts` (shared board catalog — pure board builders, reusable by both the harness and later assertions)
- Create (test): `src/wave/wave-visual-capture.browser.test.ts`

**Step 1: Define the scenario catalog — `src/wave/wave-visual-scenarios.ts`**

A pure module exporting the board builders and per-column source for each scenario S1–S7, built on `GridModel` (mirror the field browser tests' `buildGrid`/adapter pattern in `src/wave/wave-field-runtime-terrain.browser.test.ts`). Each scenario returns `{ id, build(scene): GridModel, spawns(): WaveSegmentSpawn[] }`. Keep boards small (e.g. width 5, height 16) so captures are fast and readable. Ground the wall/hole/tower placement on the real `GridModel` API (`placeWall(col,row,level)`, etc. — verify method names against `grid-model.ts`).

**Step 2: Write the capture harness — `src/wave/wave-visual-capture.browser.test.ts`**

Parameterize over `{ path: "legacy" | "field" }` selected by an env/constant so the same test renders either runtime on each scenario, stepping the clock to the four canonical frames and writing `page.screenshot({ path: \`m5/${path}/${id}-${frame}.png\` })`. Legacy uses `new WaveActorRuntime(scene, adapter, applier, slope)`; field uses `new WaveFieldRuntime(scene, adapter, slope, { applier })`. Drive `playWave(scenario.spawns())` and step to each frame budget. Reuse the shared `ctx` fixture and `page` from `vitest/browser` (see `docs/testing.md` §Capturing screenshots).

> This test asserts nothing about pixels — it is a capture tool. Keep one cheap structural assertion per scenario (e.g. water actors exist at the advance frame) so it is not a no-op test, per the no-placeholder-tests rule.

**Step 3: Capture legacy baselines**

Run the harness in `legacy` mode (flag is already off): `node --run test:browser -- src/wave/wave-visual-capture.browser.test.ts`
Expected: PASS; `test-results/screenshots/m5/legacy/S1..S7-{advance,peak,recede,settled}.png` written. Eyeball them — these are the reference. Save/copy them somewhere durable (e.g. `docs/bugs/` or an attached review) since `test-results/` is regenerated.

**Step 4: Full gate + commit**

Run: `node --run static-check`
Expected: PASS.
```bash
git add src/wave/wave-visual-scenarios.ts src/wave/wave-visual-capture.browser.test.ts
git commit -m "test(wave): visual scenario harness + legacy water baselines"
```

---

## Phase A — Generalize the source (per-column lateral profile)

Behavior changes on the field path only; the flag is still off. After this phase, a flag-on wave arrives unevenly across columns.

### Task 1: Per-column source in `computeFluxStep`

Change the kernel's source from a scalar to a per-column array, unit-tested first.

**Files:**
- Modify: `src/wave/wave-dynamic-system.ts`
- Modify (test): `src/wave/wave-dynamic-system.test.ts`

**Step 1: Update the failing test — `src/wave/wave-dynamic-system.test.ts`**

Change the `run` helper's `source` type to the array shape, and let it accept a scalar for the uniform-source cases by expanding it. Replace the `opts` type and helper (`:14-24`):

```ts
const run = (
  cells: WetCell[],
  steps: number,
  opts: {
    width: number;
    height: number;
    groundAt: (c: number, r: number) => number;
    source: { open: boolean; depth?: number; depths?: number[] };
    oceanSink: boolean;
  },
) => {
  const depths = opts.source.depths ?? Array.from({ length: opts.width }, () => opts.source.depth ?? 0);
  const source = { open: opts.source.open, depths };
  let current = cells;
  for (let s = 0; s < steps; s++) {
    current = computeFluxStep({
      cells: current,
      width: opts.width,
      height: opts.height,
      groundAt: opts.groundAt,
      source,
      oceanSink: opts.oceanSink,
      coeff: COEFF,
      drainThreshold: THRESHOLD,
    });
  }
  return current;
};
```

(The existing call sites pass `source: { open, depth }` and keep working through the `depth?` fallback. Do **not** otherwise change those cases.)

Add a new test asserting per-column behavior (append inside the slope describe block):

```ts
it("holds each column at its own source depth (uneven lateral profile)", () => {
  const out = run([], 4000, {
    width: 3,
    height: 16,
    groundAt: slope(0.5),
    source: { open: true, depths: [6, 1, 6] }, // deep edges, shallow middle
    oceanSink: true,
  });
  const deepestRowIn = (col: number) => Math.max(0, ...out.filter((c) => c.col === col).map((c) => c.row));
  // Deep columns (D=6 → ~12 rows) reach much further inland than the shallow one (D=1 → ~2 rows).
  expect(deepestRowIn(0)).toBeGreaterThan(deepestRowIn(1) + 3);
  expect(deepestRowIn(2)).toBeGreaterThan(deepestRowIn(1) + 3);
});
```

**Step 2: Run to verify it fails**

Run: `node --run test:unit -- src/wave/wave-dynamic-system.test.ts`
Expected: FAIL — `computeFluxStep` still expects `source.depth`; `source: { open, depths }` is a type error / the per-column test does not hold.

**Step 3: Implement — `src/wave/wave-dynamic-system.ts`**

Change the `source` field type (`:25-26`):
```ts
  /** Row-0 tap: while open, column `col` of row 0 is pinned to at least `depths[col]`. */
  source: { open: boolean; depths: number[] };
```

Update Pass 1 pin (`:59-64`):
```ts
  if (source.open) {
    for (let col = 0; col < width; col++) {
      const k = key(col, 0);
      depth.set(k, Math.max(depth.get(k) ?? 0, source.depths[col] ?? 0));
    }
  }
```

Update the reapply-after-flux pin (`:125-129`):
```ts
    if (source.open && row === 0) {
      // Dirichlet boundary: reapply the per-column source pin after flux.
      nd = Math.max(nd, source.depths[col] ?? 0);
    }
```

**Step 4: Run to verify it passes**

Run: `node --run test:unit -- src/wave/wave-dynamic-system.test.ts`
Expected: PASS (existing mass/reach/terrain tests unchanged via the scalar fallback; new per-column test green).

**Step 5: Lint + typecheck**

Run: `node --run static-check`
Expected: FAIL at `WaveDynamicSystem` / `WaveFieldRuntime` (they still pass `sourceDepth`/`depth`). That is fixed in Task 2; if you prefer a green commit here, do Tasks 1 and 2 back-to-back before committing. Otherwise proceed to Task 2 and commit them together.

> Recommended: treat Tasks 1+2 as one commit, since the kernel signature change ripples into the system in Task 2.

---

### Task 2: Thread per-column depths through the system and runtime

**Files:**
- Modify: `src/wave/wave-dynamic-system.ts` (`WaveDynamicSystemOptions` + `update`)
- Modify: `src/wave/wave-field-runtime.ts`
- Create (test): `src/wave/wave-field-runtime-profile.browser.test.ts`

**Step 1: Write the failing test — `src/wave/wave-field-runtime-profile.browser.test.ts`**

```ts
import { expect, test } from "../test/excalibur-browser-test.ts";
import { TERRAIN_SLOPE } from "../config.ts";
import { GridModel } from "../model/grid-model.ts";
import { WaterComponent } from "./water-component.ts";
import { WaveFieldRuntime } from "./wave-field-runtime.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave-segment-types.ts";

const HEIGHT = 16;
const WIDTH = 3;

const buildGrid = (scene: import("excalibur").Scene): GridModel =>
  new GridModel(
    { width: WIDTH, height: HEIGHT, castleCol: 1, castleRow: 13, castleWidth: 1, castleHeight: 1 },
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

// Deep outer columns, shallow middle — the lateral profile must survive into the field.
const unevenSpawns = (): WaveSegmentSpawn[] =>
  [6, 1, 6].map((initialDepth, col) => ({ col, x: 0, y: 0, initialDepth, speed: 0, maxTravelDistance: 0 }));

test("an uneven source profile reaches further inland in deep columns than the shallow one", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);
  const runtime = new WaveFieldRuntime(ctx.scene, adapterFor(grid), TERRAIN_SLOPE, { surgeWindowMs: 4000 });
  const done = runtime.playWave(unevenSpawns());

  let maxRowCol0 = 0;
  let maxRowCol1 = 0;
  for (let i = 0; i < 1500; i++) {
    ctx.step(16);
    for (const e of ctx.scene.world.query([WaterComponent]).entities) {
      const w = e.get(WaterComponent)!;
      if (w.col === 0) { maxRowCol0 = Math.max(maxRowCol0, w.row); }
      if (w.col === 1) { maxRowCol1 = Math.max(maxRowCol1, w.row); }
    }
  }
  await done;

  expect(maxRowCol0).toBeGreaterThan(maxRowCol1 + 2);
});
```

**Step 2: Run to verify it fails**

Run: `node --run test:browser -- src/wave/wave-field-runtime-profile.browser.test.ts`
Expected: FAIL — the runtime still collapses to `Math.max`, so all columns reach the same row and the inequality does not hold.

**Step 3: Implement**

In `src/wave/wave-dynamic-system.ts`, change `WaveDynamicSystemOptions` (`:148`):
```ts
  sourceDepths: number[];
```
and the kernel call in `update` (`:205`):
```ts
        source: { open: this.sourceOpen, depths: this.opts.sourceDepths },
```

In `src/wave/wave-field-runtime.ts`, replace the scalar (`:56-57`) with the per-column array and pass it through (`:81`):
```ts
    const width = spawns.length;
    const sourceDepths = spawns.map((s) => s.initialDepth);
```
```ts
        sourceDepths,
```
(Delete the `const sourceDepth = Math.max(...)` line and the `sourceDepth,` option.)

**Step 4: Run to verify it passes**

Run: `node --run test:browser -- src/wave/wave-field-runtime-profile.browser.test.ts`
Expected: PASS. Also re-run the existing field browser tests:
Run: `node --run test:browser -- src/wave/wave-field-runtime-erosion.browser.test.ts src/wave/wave-field-runtime-terrain.browser.test.ts src/wave/wave-field-runtime.browser.test.ts`
Expected: PASS (uniform-source spawns still behave as before — `depths` all equal).

**Step 5: Full gate + commit**

Run: `node --run static-check`
Expected: PASS.

**Step 6: VISUAL CHECKPOINT — first field capture vs legacy baseline**

Run the harness in `field` mode: `node --run test:browser -- src/wave/wave-visual-capture.browser.test.ts` (with the field selector on).
Compare `m5/field/S1-*` and `m5/field/S7-*` against `m5/legacy/S1-*`. Review criteria 1 (grid alignment), 2 (depth gradient), 9 (uneven arrival on S7). Present both sets to the user. **Stop and fix if alignment or gradient is visibly wrong** — these are structural bugs (e.g. the ocean-band offset), not feel. Do not paper over with tuning.

```bash
git add src/wave/wave-dynamic-system.ts src/wave/wave-dynamic-system.test.ts src/wave/wave-field-runtime.ts src/wave/wave-field-runtime-profile.browser.test.ts
git commit -m "feat(wave): per-column source profile in the pressure field"
```

---

## Phase B — Front sharpness and source tuning (subjective sign-off)

### Task 3: Tune the existing knobs (collaborative checkpoint)

The acceptance criterion "front feel is acceptable" is subjective. This task is a tuning loop with the user, not an automated test.

**Files:**
- Modify (tuning only): `src/config.ts` (`PRESSURE_FLUX_COEFF`, `PRESSURE_SURGE_WINDOW_MS`; optionally a source-depth scale)

**Steps:**
1. Temporarily set `PRESSURE_WATER_ENABLED = true` in `src/config.ts`. Run the dev server (already running per `AGENTS.md`) and observe Tide.
2. Evaluate against the design intent (`docs/plans/2026-06-12-pressure-water-simulation-design.md`): a wave that advances inland, spreads around walls, pools, and recedes; reach approximately `D / s` rows.
3. Adjust knobs within their bounds — `PRESSURE_FLUX_COEFF` must stay `≤ 0.25` (stability, documented at its definition). Larger coeff → faster spread; longer `PRESSURE_SURGE_WINDOW_MS` → longer sustained head.
4. **Re-run the visual harness (`field` mode) after each knob change** and review the full S1–S7 set against criteria 2–4 (gradient, front coherence, lateral behavior). The harness frames make tuning reproducible — you are comparing the same scenarios across iterations, not chasing a moving target. Present the before/after sets to the user for sign-off. **Do not proceed to cutover without explicit sign-off on front feel.**
5. **Revert `PRESSURE_WATER_ENABLED` to `false`** before committing.
6. Run: `node --run static-check`; commit the tuned constants:
   ```bash
   git add src/config.ts
   git commit -m "tune(wave): pressure field flux/surge knobs for front feel"
   ```

> If the user signs off on the rounded front, skip Task 3b entirely (YAGNI).

### Task 3b (CONTINGENCY — only if Task 3 sign-off rejects the rounded front)

Pure hydrostatic relaxation cannot sharpen a front; an inertia term is required. This is the milestone's highest-risk change and must be TDD'd against a measurable steepness metric. **Do not start without user agreement that Task 3 tuning was insufficient.**

**Files:** Modify `src/wave/wave-dynamic-system.ts` (kernel) + `src/wave/wave-dynamic-system.test.ts`.

**Approach (design to validate, not final code):** carry a fraction of each cell's prior velocity as momentum so depth overshoots at the leading edge instead of relaxing symmetrically — an upwind advection term added to the flux, behind a new `PRESSURE_INERTIA_COEFF` knob (default `0` = today's behavior, so the change is inert until tuned). The kernel already tracks `velX`/`velY`; the term biases outflow in the direction of existing velocity.

**Test first:** seed a held source on a slope, run to steady state, and assert the depth drop across the two rows at the leading edge is steeper with inertia on than off (a front-steepness ratio), while mass conservation and non-negativity (the existing closed-box tests) still hold. Iterate the coefficient with the user. Keep the stability clamp (`scale = sum > d ? d / sum : 1`) intact.

Commit:
```bash
git add src/wave/wave-dynamic-system.ts src/wave/wave-dynamic-system.test.ts src/config.ts
git commit -m "feat(wave): optional inertia term to sharpen the pressure-field front"
```

---

## Phase C — Cut over Tide

### Task 4: Remove the flag branch in `tide-session.ts`

**Files:**
- Modify: `src/tide-session.ts`

**Step 1: Replace the conditional (`:329-342`) with the field path unconditionally**

```ts
    this.waterRuntime = new WaveFieldRuntime(this, this.makeWaveGridAdapter(), TERRAIN_SLOPE, {
      applier: new WaveEventApplier(this.grid, this.sandLayer),
    });
    result = await this.waterRuntime.playWave(spawns);
```

Remove the `else` block constructing `WaveActorRuntime`, the `PRESSURE_WATER_ENABLED` import (`:29`), the `WaveActorRuntime` import (`:13`), and the now-unused `private waveRuntime: WaveActorRuntime | null = null;` field (`:51`) plus its cleanup references (`:197-200, 326, 371-374, 453-456` — delete the `this.waveRuntime?.cleanup(); this.waveRuntime = null;` lines, keep the `waterRuntime` ones).

**Step 2: Verify**

Run: `node --run test:browser` (Tide browser tests exercise the field path now) and the visual baseline test.
Expected: PASS.

**VISUAL CHECKPOINT (required):** play Tide in the dev server (real session, not just the harness) — confirm the water reads correctly *with* the HUD, castle overlay, banners, and scene transitions: uneven arrival, lateral spread, pooling, erosion flash, castle flood, and a clean board after recede (criteria 1–10). The harness renders water in isolation; this is the only check that catches z-order/overlay/scene-chrome regressions. Get user sign-off before committing.

**Step 3: Full gate + commit**

Run: `node --run static-check`
Expected: PASS (`WaveActorRuntime` is still referenced by Classic, so it is not yet dead).
```bash
git add src/tide-session.ts
git commit -m "feat(tide): run on the pressure water field unconditionally"
```

---

## Phase D — Cut over Classic

### Task 5: Wire `WaveFieldRuntime` into `level-session.ts`

**Files:**
- Modify: `src/level-session.ts`
- Create (test): `src/level-session-field.browser.test.ts` (only if a focused regression is cheap to express; otherwise rely on the full browser suite + manual play)

**Step 1: Swap the runtime (`:281-288`)**

```ts
    this.waterRuntime?.cleanup();
    this.waterRuntime = new WaveFieldRuntime(
      this,
      this.makeWaveGridAdapter(),
      TERRAIN_SLOPE,
      { applier: new WaveEventApplier(this.grid, this.sandLayer) },
    );
    result = await this.waterRuntime.playWave(spawns);
```

Change the field declaration (`:48`) and all cleanup sites (`:166, 281, 317, 371, 398`) from `waveRuntime: WaveActorRuntime` to `waterRuntime: WaveFieldRuntime`. Replace the `WaveActorRuntime` import (`:13`) with `WaveFieldRuntime`.

**Step 2: Verify**

Run: `node --run static-check`
Expected: PASS. `WaveActorRuntime` is now referenced only by its own test → still not knip-dead until Task 6.

**VISUAL CHECKPOINT (required):** play Classic in the dev server — multiple waves per level, win/loss, erosion flashes, between-waves planning. Confirm water visuals and the full session chrome across the planning→wave→between-waves loop (criteria 1–10), and that nothing regressed versus Tide. Get user sign-off before committing.

**Step 3: Commit**
```bash
git add src/level-session.ts
git commit -m "feat(level): run Classic on the pressure water field"
```

---

## Phase E — Remove the flag and delete the legacy path

> **VISUAL LOCK-IN GATE (blocking, before Task 6).** Deletion is the point of no return for legacy comparison. Before deleting anything: re-run the harness in both `legacy` and `field` modes, lay the full `m5/legacy/*` and `m5/field/*` sets side by side, and get the user's explicit confirmation that the field path **meets or beats** the baseline across all scenarios and criteria. If any scenario regresses, fix it (tuning or bug) and re-gate. Do not start Task 6 without this sign-off. After deletion, archive the field set as the new baseline of record (e.g. commit the PNGs under `docs/bugs/` or attach to the review).

Each task ends green (`static-check` including `knip`). Delete production + co-located tests together.

### Task 6: Delete `PRESSURE_WATER_ENABLED` and `WaveActorRuntime`

**Files:**
- Delete: `src/wave/wave-actor-runtime.ts`, `src/wave/wave-actor-runtime.test.ts`
- Modify: `src/config.ts` (remove `PRESSURE_WATER_ENABLED`, `:137`)

**Steps:**
1. Delete the two files. Confirm no remaining import of `WaveActorRuntime` (`tide-session` and `level-session` were updated in Tasks 4–5).
2. Remove the `PRESSURE_WATER_ENABLED` export from `src/config.ts`; confirm no references remain.
3. Run: `node --run static-check` → PASS (knip should not flag anything new).
4. Commit:
   ```bash
   git rm src/wave/wave-actor-runtime.ts src/wave/wave-actor-runtime.test.ts
   git add src/config.ts
   git commit -m "chore(wave): delete WaveActorRuntime and the PRESSURE_WATER_ENABLED flag"
   ```

### Task 7: Delete `WaveSegment` and the legacy applier/grid erosion path

**Files:**
- Delete: `src/wave/wave-segment.ts`, `src/wave/wave-segment.browser.test.ts`
- Modify: `src/wave/wave-event-applier.ts` (remove `blocked`/`overtopped` + `tileEntered` branches; keep `absorbed` + `eroded`), `src/wave/wave-event-applier.test.ts` (drop the legacy-event cases)
- Modify: `src/wave/wave-segment-types.ts` (remove the `tileEntered` member from `WaveSegmentEvent`)
- Modify: `src/model/grid-model.ts` (remove `applyWaveWaterHit`, `applySandRedistributionAt`, `applySandRedistribution`, and the `WallErosionEvent` import/re-export), `src/model/grid-model*.test.ts` (drop tests for the removed methods — keep `grid-model-erosion.browser.test.ts`, which tests the live `applyErosionHits`)

**Steps:**
1. Delete `wave-segment.ts` + its test.
2. In `wave-event-applier.ts`, remove the legacy branches so the type-switch handles only `absorbed` and `eroded`; update its test accordingly.
3. Remove `tileEntered` from the `WaveSegmentEvent` union.
4. In `grid-model.ts`, remove the three now-unreferenced methods and the `WallErosionEvent` import/re-export; remove their tests.
5. Run: `node --run static-check` → PASS. If knip flags `WallErosionEvent` as now-unused in `wave-simulation.ts`, leave it for Task 8 (it is still imported by `wave-renderer.ts` until then) — order Task 8 immediately after.
6. Commit:
   ```bash
   git rm src/wave/wave-segment.ts src/wave/wave-segment.browser.test.ts
   git add src/wave/wave-event-applier.ts src/wave/wave-event-applier.test.ts src/wave/wave-segment-types.ts src/model/grid-model.ts src/model/*.test.ts
   git commit -m "chore(wave): delete WaveSegment and the legacy tileEntered/sand-redistribution path"
   ```

### Task 8: Delete the dead `WaveRenderer` animation and the deprecated solver

**Files:**
- Modify: `src/view/wave-renderer.ts` (remove `playWave`, `flashSandRedistribution`, `buildCastleFlashOverlays`, and the private helpers they alone use; remove the `WaveResult`/`WallErosionEvent` import; keep `flashErodedTiles` + `cleanup` + their helpers `addActor`/`removeActor`/`delay`)
- Delete: `src/model/flow-field.ts`, `src/model/flow-field.test.ts`, `src/model/water-column.ts`, `src/model/wave-simulation.test.ts`
- Modify: `src/model/wave-simulation.ts` (delete `simulateWave`, `SimulateWaveInput`, `WaveResult`, `WallErosionEvent`, and the `flow-field.ts` import; keep **only** `generateWaveCurve`)

**Steps:**
1. Slim `wave-renderer.ts` to the erosion-flash surface; confirm the `WaveResult`/`WallErosionEvent` import is removed and `flashErodedTiles` (both sessions' caller) still compiles.
2. Delete the four solver files.
3. Reduce `wave-simulation.ts` to `generateWaveCurve` (still imported by `wave-spawner.ts`). Consider renaming the file later (it is no longer about "simulation"); deferred to Task 10.
4. Run: `node --run static-check` → PASS. knip must be clean (no orphaned exports). If `WATER_RENDER_THRESHOLD`, `WAVE_ROW_DELAY_MS`, `WAVE_RECEDE_ROW_DELAY_MS` are now unreferenced, remove them in this commit.
5. Commit:
   ```bash
   git rm src/model/flow-field.ts src/model/flow-field.test.ts src/model/water-column.ts src/model/wave-simulation.test.ts
   git add src/view/wave-renderer.ts src/model/wave-simulation.ts src/config.ts
   git commit -m "chore(wave): delete deprecated solver and dead WaveRenderer animation"
   ```

### Task 9 (optional): Slim `wave-spawner.ts` to per-column depths

Only if it leaves the code cleaner with no behavior change. The field reads only `initialDepth` and `spawns.length`. Option: keep `generateWaveSegmentSpawns` returning `WaveSegmentSpawn[]` (cheapest, zero risk) **or** introduce `generateSourceDepths(...) : number[]` and change `playWave` to accept `number[]`. If you do the latter, remove `WAVE_SEGMENT_*` and `WAVE_FRONT_NOISE_*` constants and update both sessions. Gate: `static-check` green, knip clean. Commit separately.

> Recommendation: defer unless the dead spawn fields actively confuse. YAGNI.

---

## Phase F — Naming convergence (optional)

### Task 10 (optional): Converge `Wave`/`Water` naming

With the actor path gone, `WaveSegmentSpawn` / `WaveSegmentGrid` / `WaveActorRuntimeResult` are misnomers. Rename (e.g. `WaveSegmentGrid → WaveFieldGrid`, `WaveActorRuntimeResult → WaveResult`, `WaveSegmentSpawn → WaveColumnSource`), and consider renaming `wave-simulation.ts → wave-curve.ts`. Pure rename, no behavior change; do it last so it does not collide with the to-be-deleted legacy `WaveResult`. One commit, `static-check` green.

> Cosmetic. Skip if the user does not want the churn.

---

## Deferred / out of scope

- **Sand redistribution** (`blocked`/`overtopped` sloughing) stays unported and is deleted, not reimplemented — same rationale as M4 (walls were already a no-op; towers double-count with velocity erosion). The field reports `sandRedistributed: false` and Classic/Tide simply skip the 260ms delay.
- **Castle flood flash:** neither the legacy nor the field path renders a dedicated castle-flood flash today (the legacy `WaveRenderer.playWave` flash was already orphaned). M5 does not add one; flood remains a game-mode loss signal. If desired, raise as a follow-up.

## Final verification

Run the full gate and confirm green before declaring M5 done:

Run: `node --run static-check`
Expected: PASS (tsc, lint, unit, knip, browser). `knip` clean confirms no orphaned legacy exports remain.

**Final visual regression pass:** re-run the harness (`field` mode — `legacy` no longer exists) and confirm the S1–S7 set still matches the locked-in artifacts from the Phase E gate. Then play both modes in the dev server: Classic (multi-wave levels, win/loss) and Tide (continuous waves). Walk the full criteria checklist (1–10): uneven arrival, flow around walls, pooling, erosion flash, castle flood, clean recede, z-order, and frame health. This artifact set is the new baseline of record.

## Definition of done

- The pressure field's source is per-column: `computeFluxStep` takes `source.depths: number[]`, `WaveFieldRuntime` passes the full `generateWaveCurve` profile (no `Math.max` collapse), and a headless test proves deep columns out-reach shallow ones.
- Front feel has the user's explicit sign-off (Task 3; inertia term only if that sign-off required it).
- Both Classic and Tide construct `WaveFieldRuntime` unconditionally; `PRESSURE_WATER_ENABLED` is removed.
- `WaveSegment`, `WaveActorRuntime`, `flow-field.ts`, `water-column.ts`, the deprecated `simulateWave`/`WaveResult`, the dead `WaveRenderer` animation, the legacy `tileEntered`/sand-redistribution applier+grid path, and their now-dead config constants are deleted.
- `generateWaveCurve` and `WaveRenderer.flashErodedTiles` survive (both still used).
- `node --run static-check` is green and `knip` reports no dead code after every commit.
- **Visuals signed off, not assumed:** legacy baselines captured (Task 0), field artifacts reviewed at each behavior-changing step, the front feel explicitly approved (Task 3), the Phase E visual lock-in gate passed before any deletion, and both modes walked through the full criteria checklist in a real session. No checkpoint was skipped on a green-tests basis alone.

## Notes for the executor

- **Keep the game working after every commit.** The phase order (generalize → tune → cut over Tide → cut over Classic → delete) guarantees the legacy path is unreferenced before deletion; do not reorder deletions ahead of cutover.
- **Tasks 1+2 commit together** (the kernel signature change ripples into the system in the same breath).
- **The flux kernel stability clamp stays.** Per-column source does not change the `coeff ≤ 0.25` / per-cell outflow-clamp invariants; the closed-box mass/non-negativity tests must stay green.
- **Front sharpness is the risk.** Tune first, sign off, and only then consider the inertia term. Do not ship a speculative kernel rewrite.
- **knip is the dead-code oracle.** After each Phase E deletion, a clean `static-check` proves the removal was complete. If knip flags a leftover export, finish removing it in the same commit rather than suppressing it.
- **Visuals are a gate, not a courtesy.** Green tests are necessary, not sufficient — this migration's classic failure is "all tests pass, water looks awful." Capture legacy baselines before touching behavior (Task 0), review field artifacts at every checkpoint, and never cut over or delete on unreviewed visuals. If you are tempted to skip a checkpoint because the suite is green, that is exactly when not to.
- **Distinguish structural visual bugs from feel.** Misalignment, blocky gradients, ghost overlays, z-order, and stuck water are *bugs* — fix them, do not tune around them. Front rounding/sharpness is *feel* — that is what Task 3 tuning and sign-off are for.
- **Update docs in the cutover commit set:** once both modes are live, update `docs/gameplay.md` if water behavior changed perceptibly (M4 deliberately deferred this to M5), and refresh the `src/wave/` section of `AGENTS.md` to drop the deleted files and the flag.
```
