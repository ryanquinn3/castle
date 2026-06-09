# Terrain → Excalibur Actor Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
>
> **Supersedes** `docs/plans/2026-06-08-terrain-actor-migration-design.md` (WIP brainstorm). That doc's decisions are folded in here and updated for the post-wall-tier codebase.

**Goal:** Turn the four terrain implementations (`FlatGround` / `Hole` / `Wall` / `Tower`) into formal Excalibur `Actor`s, delete the parallel `Tile` / `GridView` view layer, and make `GridModel` the single grid container that renders itself and owns scene add/remove.

**Architecture:** `Terrain extends Actor`; each cell is one actor that owns its transform (pos from col/row + layout), its graphics (today's `getRenderInfo().customDraw` cached as a `Canvas`), a dormant `CollisionType.Passive` box collider (the seam future water-physics plugs into), and its existing data/behavior. `GridModel` holds the actor grid, wires array-based neighbors, and adds/removes actors to the `Scene` on type-swap — detected for free via `applyDelta` instance identity (same instance → in-place mutation, refresh graphics; new instance → swap actors). The column-based wave simulation is **untouched**; this migration only re-homes terrain. The castle becomes a standalone decorative actor, not a terrain type.

**Tech Stack:** TypeScript, Excalibur.js, Vite, Vitest (jsdom `unit` project + real-browser `browser` project).

**Why now / north star:** This unblocks future work where water becomes volume-carrying physics blobs that split against walls and merge on contact, using real terrain colliders. That water rework is explicitly **out of scope** here.

---

## Execution notes (read first)

- **Branch:** Work on a feature branch the user manages. Do **not** create or switch branches; do **not** create git worktrees (this repo is not set up for them — see `AGENTS.md`). Just commit onto the current branch.
- **Subagents:** When executing via subagents, use **sonnet**-based subagents per task.
- **Verification gate — every commit must be green:** `node --run static-check` (`tools/check.sh`) runs **tsc + oxlint(`lint:fix`) + unit + browser + knip** in parallel; **every commit must pass all of it**, including `tsc` and `knip`. This is a hard constraint and it dictates the commit boundaries below: because `knip` fails on unused exports/files and a `GridModel` constructor-signature change breaks every caller's `tsc` simultaneously, the view-layer cutover (Phase 2) is a **single atomic commit** — you cannot land it in green pieces. For fast inner-loop iteration use `node --run test:unit` (jsdom) and `node --run test:browser` (real browser); target a single file with `npx vitest run --project unit <path>` or `npx vitest run --project browser <path>`. Run the full `node --run static-check` immediately before each commit.
- **knip note:** knip flags unused *exports, files, and dependencies* — not unused class *methods*. So adding `Terrain.syncGraphic` before production calls it is fine (it's a method); adding a new exported `CastleActor` class before anything imports it is **not** fine (unused export) — which is why `CastleActor` is created inside the atomic cutover, not before.
- **Do not start a dev server** — one is always running (`AGENTS.md`).
- **Collaborate before improvising:** if a step's reality diverges from this plan, stop and surface it rather than inventing scope.

## Key facts verified against the codebase (2026-06-09)

- Excalibur cannot be imported in **pure Node** (`excalibur.js` touches `window` at module load). Unit tests run in **jsdom** (`vitest.config.ts` → project `unit`, `environment: "jsdom"`), so `new Wall(2)` constructs fine there; only real rendering + collision firing need the `browser` project. `tools/replay-wave.ts` runs in pure Node and therefore **must be retired** once terrain imports Excalibur.
- `Tile.updateVisual()` (`src/view/tile.ts`) holds the render logic to port: `elevation === 0` → transparent `flatRect`; sprite path; `customDraw` path with a module-level `graphicsCache: Map<string, Graphic>` keyed by `cacheKey`.
- `applyDelta` identity contract (the swap signal):
  - `FlatGround.applyDelta(+)` → `this`; `applyDelta(-)` → `new Hole(...)`.
  - `Hole.applyDelta(deeper)` → `this`; `Hole.applyDelta(→ ≥0)` → `new FlatGround()`.
  - `Wall.applyDelta(_)` → `this`; `Tower.applyDelta(_)` → `this`.
- `GridView` (`src/view/grid-view.ts`) is pure delegation: every method forwards to `model` then calls `refreshTileVisual(col,row)` on the cell + 4 neighbors (wall/hole edge rendering depends on neighbors).
- `GridView` / `Tile` consumers (non-test): `src/level-session.ts`, `src/tide-session.ts`, `src/view/planning-phase.ts`, `src/view/wave-renderer.ts`, `src/view/terrain-editor.ts`, `src/view/screen-overlays.ts`, `src/wave/wave-event-applier.ts`.
- `Tile` flows as a render target for effects: `WaveEventApplier.apply()` returns `erodedTile`; `WaveActorRuntime` collects `erodedTiles: Tile[]`; sessions call `waveRenderer.flashErodedTiles(...)`; `wave-renderer.ts:192` and `screen-overlays.ts:74` call `grid.getTile(col,row)` for `.pos`. These all only need `.pos` → a terrain actor satisfies them.
- Browser test fixture: `import { expect, test } from "../test/excalibur-browser-test.ts"`, then `test("...", async ({ ctx }) => { ctx.scene, ctx.game, ctx.step(ms) })`. Reference: `src/view/sand-layer.browser.test.ts`.
- Layout: `computeLayout(window)` → `{ tileSize, gridLeft, gridTop }`. Tile center for `(col,row)` = `gridLeft + (col + 0.5) * tileSize`, `gridTop + (row + 0.5) * tileSize` (see `Tile` constructor).

---

## Phase 1 — Terrain becomes a self-rendering Actor (dormant)

Goal: `Terrain extends Actor`, each subclass positions + renders itself and carries a Passive collider, **without** wiring into any scene yet. `GridView`/`Tile` stay live and continue to render the game. End state: game looks identical, terrain actors exist but are unused. This phase is purely additive so it stays green.

### Task 1.1: Make `Terrain` extend `Actor` with transform + collider

**Files:**
- Modify: `src/model/terrain/terrain.ts`
- Modify: `src/model/terrain/flat-ground.ts`, `hole.ts`, `wall.ts`, `tower.ts` (constructor `super()` calls)
- Test: `src/model/terrain/terrain-actor.test.ts` (Create)

**Step 1: Write the failing test** (`src/model/terrain/terrain-actor.test.ts`)

```ts
import { Actor, CollisionType } from "excalibur";
import { describe, expect, it } from "vitest";
import { Wall } from "./wall.ts";
import { FlatGround } from "./flat-ground.ts";

describe("Terrain as Actor", () => {
  it("is an Excalibur Actor", () => {
    expect(new FlatGround()).toBeInstanceOf(Actor);
  });

  it("positions itself from col/row on attach", () => {
    const wall = new Wall(1);
    wall.attach({ neighborsOf: () => ({ north: null, south: null, east: null, west: null }) }, 3, 2);
    // center of cell (col 3, row 2); exact px asserted via layout in browser test,
    // here we assert it is no longer at the origin default.
    expect(wall.pos.x).toBeGreaterThan(0);
    expect(wall.pos.y).toBeGreaterThan(0);
  });

  it("uses a passive collider", () => {
    expect(new FlatGround().body.collisionType).toBe(CollisionType.Passive);
  });
});
```

**Step 2: Run to verify it fails**

Run: `npx vitest run --project unit src/model/terrain/terrain-actor.test.ts`
Expected: FAIL (`Terrain` is not an `Actor`; no `body`).

**Step 3: Implement** — edit `src/model/terrain/terrain.ts`

Change the abstract class declaration and constructor. Add the layout-derived positioning into `attach`. Keep all existing abstract members.

```ts
import { Actor, CollisionType, type Color, type ImageSource, type Sprite } from 'excalibur';
import { computeLayout } from '../../config.ts';
import type { WaterColumn } from '../water-column.ts';

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

// ... keep CardinalDirection, WallEvent, SerializedTerrain, ErosionResult,
//     Neighbors, NeighborGrid, NO_NEIGHBORS, TileRenderInfo unchanged ...

export abstract class Terrain extends Actor {
  private grid: NeighborGrid | null = null;
  // col/row already declared; keep them.
  col = -1;
  row = -1;

  constructor() {
    super({ width: TILE_SIZE, height: TILE_SIZE, collisionType: CollisionType.Passive });
  }

  attach(grid: NeighborGrid, col: number, row: number): void {
    this.grid = grid;
    this.col = col;
    this.row = row;
    this.pos.x = GRID_LEFT + (col + 0.5) * TILE_SIZE;
    this.pos.y = GRID_TOP + (row + 0.5) * TILE_SIZE;
  }

  // get neighbors, connectsTo, abstract members: UNCHANGED.
}
```

Then in each subclass constructor add `super()` where one doesn't already chain it:
- `wall.ts` constructor already calls `super()` — keep, it now hits the new no-arg `Terrain` constructor.
- `hole.ts`, `tower.ts`: ensure their constructors call `super()` first (check current code; `Hole`/`Tower` take args — keep their arg handling, just confirm `super()` is the first statement).
- `flat-ground.ts` has no explicit constructor — fine, default chains to `super()`.

**Step 4: Run to verify it passes**

Run: `npx vitest run --project unit src/model/terrain/terrain-actor.test.ts`
Expected: PASS.

**Step 5: Full gate + commit**

Run: `node --run static-check`
Expected: all green (`tsc`, `lint`, `unit_test`, `browser_test`, `knip`). Existing terrain data tests still construct fine in jsdom; `tools/replay-wave.ts` is only broken at *runtime* (not exercised by the gate) and is deleted in Phase 3.

```bash
git add src/model/terrain/
git commit -m "refactor: Terrain extends Actor with transform + passive collider"
```

### Task 1.2: Port `Tile.updateVisual` rendering onto `Terrain`

**Files:**
- Modify: `src/model/terrain/terrain.ts` (add `syncGraphic()`)
- Test: `src/model/terrain/terrain-render.browser.test.ts` (Create — rendering needs a real canvas)

**Step 1: Write the failing browser test** (`src/model/terrain/terrain-render.browser.test.ts`)

```ts
import { Canvas } from "excalibur";
import { expect, test } from "../../test/excalibur-browser-test.ts";
import { Wall } from "./wall.ts";
import { FlatGround } from "./flat-ground.ts";

test("wall syncs a Canvas graphic", async ({ ctx }) => {
  const wall = new Wall(2);
  wall.attach({ neighborsOf: () => ({ north: null, south: null, east: null, west: null }) }, 1, 1);
  ctx.scene.add(wall);
  wall.syncGraphic();
  expect(wall.graphics.current).toBeInstanceOf(Canvas);
});

test("flat ground (elevation 0) syncs the transparent rect", async ({ ctx }) => {
  const flat = new FlatGround();
  flat.attach({ neighborsOf: () => ({ north: null, south: null, east: null, west: null }) }, 1, 1);
  ctx.scene.add(flat);
  flat.syncGraphic();
  expect(flat.graphics.current).toBeDefined();
});
```

**Step 2: Run to verify it fails**

Run: `npx vitest run --project browser src/model/terrain/terrain-render.browser.test.ts`
Expected: FAIL (`syncGraphic` is not a function).

**Step 3: Implement** — add to `Terrain` in `src/model/terrain/terrain.ts`

Port the logic verbatim from `src/view/tile.ts` (the module-level `graphicsCache` + `flatRect` + the three render branches), but read from `this` instead of mirrored fields:

```ts
import { Canvas, Color, type Graphic, Rectangle } from 'excalibur';

const graphicsCache = new Map<string, Graphic>();
const flatRect = new Rectangle({ width: TILE_SIZE - 1, height: TILE_SIZE - 1, color: Color.Transparent });

// inside class Terrain:
syncGraphic(): void {
  if (this.elevation === 0) {
    this.graphics.use(flatRect);
    return;
  }
  const info = this.getRenderInfo();
  if (info.sprite && !info.customDraw) {
    const sprite = info.sprite.toSprite();
    sprite.width = TILE_SIZE;
    sprite.height = TILE_SIZE;
    if (info.tint) { sprite.tint = info.tint; }
    this.graphics.use(sprite);
    return;
  }
  if (info.customDraw) {
    const cacheKey = info.cacheKey ?? `${this.col}:${this.row}:${this.elevation}`;
    const cached = graphicsCache.get(cacheKey);
    if (cached) { this.graphics.use(cached); return; }
    const canvas = new Canvas({
      width: TILE_SIZE, height: TILE_SIZE, quality: 3, cache: true,
      draw: (c) => info.customDraw!(c, TILE_SIZE, TILE_SIZE),
    });
    graphicsCache.set(cacheKey, canvas);
    this.graphics.use(canvas);
    return;
  }
  this.graphics.use(flatRect);
}
```

> Note: `Tile` used `info.sprite.clone()` on a `Sprite`; `getRenderInfo().sprite` is an `ImageSource` (`Resources.X`), and current terrain returns `sprite: null` everywhere (wall draws via `customDraw`, flat/hole/tower via `customDraw` or null). The `info.sprite` branch is effectively dead today; `.toSprite()` keeps it correct if ever used. Verify against `src/view/tile.ts` while porting.

**Step 4: Run to verify it passes**

Run: `npx vitest run --project browser src/model/terrain/terrain-render.browser.test.ts`
Expected: PASS.

**Step 5: Full gate + commit**

Run: `node --run static-check`
Expected: PASS.

```bash
git add src/model/terrain/
git commit -m "refactor: port tile rendering onto Terrain.syncGraphic"
```

---

## Phase 2 — The view-layer cutover (one atomic green commit)

Goal: in a **single commit**, make `GridModel` take the `Scene` and own the actor grid (populate, swap, refresh), repoint every caller off `GridView`, delete `GridView` / `Tile` / `CastleTile`, introduce the standalone `CastleActor`, change `Tile` types to `Terrain`, and move `grid-model.test.ts` to the browser project.

**Why atomic:** the `GridModel` constructor gains a required `Scene`, which breaks every construction site's `tsc` at once; `CastleActor` is an unused export (knip-fail) until a session imports it; deleting `GridView`/`Tile` requires callers already repointed; the old `grid-model.test.ts` constructs `GridModel` with one arg and must move in the same change. There is no green intermediate. Build it all on the working tree, get `node --run static-check` fully green, then make **one** commit.

This is one task with an ordered build sequence. Write the new tests first (they'll fail to compile until the implementation lands — that's expected for an atomic change; do not commit until everything is green together).

### Task 2.1: Cutover

**Files — create:**
- `src/model/grid-model.browser.test.ts`
- `src/view/castle-actor.ts`
- `src/view/castle-actor.browser.test.ts`

**Files — modify:**
- `src/model/grid-model.ts`
- `src/level-session.ts`, `src/tide-session.ts`
- `src/view/terrain-editor.ts`, `src/view/wave-renderer.ts`, `src/view/screen-overlays.ts`, `src/view/planning-phase.ts`
- `src/wave/wave-event-applier.ts`, `src/wave/wave-segment-types.ts`, `src/wave/wave-actor-runtime.ts`
- `src/wave/wave-event-applier.test.ts`, `src/wave/wave-actor-runtime.test.ts` (retype `erodedTile` doubles)

**Files — delete (`git rm`):**
- `src/view/grid-view.ts`, `src/view/grid-view.test.ts`
- `src/view/tile.ts`, `src/view/castle-tile.ts`
- `src/model/grid-model.test.ts`

**Step 1 — Write the new browser tests (will not pass yet).**

`src/model/grid-model.browser.test.ts` — actor-lifecycle cases plus the ported data cases from the old `grid-model.test.ts`:

```ts
import { expect, test } from "../test/excalibur-browser-test.ts";
import { GridModel } from "./grid-model.ts";
import { FlatGround } from "./terrain/flat-ground.ts";
import { Hole } from "./terrain/hole.ts";

function makeModel(scene: import("excalibur").Scene) {
  return new GridModel({ width: 5, height: 5, castleCol: 2, castleRow: 4, castleWidth: 1, castleHeight: 1 }, scene);
}

test("adds a terrain actor per cell to the scene", async ({ ctx }) => {
  makeModel(ctx.scene);
  expect(ctx.scene.actors.filter(a => a instanceof FlatGround)).toHaveLength(25);
});

test("digging swaps the FlatGround actor for a Hole actor in the scene", async ({ ctx }) => {
  const model = makeModel(ctx.scene);
  const before = model.getCell(1, 1);
  model.setElevation(1, 1, -1);
  const after = model.getCell(1, 1);
  expect(after).toBeInstanceOf(Hole);
  expect(ctx.scene.actors).not.toContain(before);
  expect(ctx.scene.actors).toContain(after);
});

test("deepening a hole keeps the same actor instance (no swap)", async ({ ctx }) => {
  const model = makeModel(ctx.scene);
  model.setElevation(1, 1, -1);
  const hole = model.getCell(1, 1);
  model.setElevation(1, 1, -1);
  expect(model.getCell(1, 1)).toBe(hole);
  expect(ctx.scene.actors).toContain(hole);
});

// + every case ported from the old src/model/grid-model.test.ts, each built
//   via makeModel(ctx.scene). Data assertions (elevation, pools, serialize,
//   hit counts) are unchanged; only construction takes a scene now.
```

`src/view/castle-actor.browser.test.ts`:

```ts
import { expect, test } from "../test/excalibur-browser-test.ts";
import { CastleActor } from "./castle-actor.ts";

test("castle actor renders the castle sprite", async ({ ctx }) => {
  const castle = new CastleActor(2, 4);
  ctx.scene.add(castle);
  expect(castle.graphics.current).toBeDefined();
});
```

**Step 2 — `GridModel` takes a scene and owns swap/refresh** (`src/model/grid-model.ts`).

```ts
import { Scene } from 'excalibur';

export class GridModel implements NeighborGrid {
  // ...existing readonly fields...
  private readonly scene: Scene;
  private cells: Terrain[][];

  constructor(input: GridModelInput, scene: Scene) {
    // ...assign readonly fields exactly as today...
    this.scene = scene;
    this.cells = [];
    this.initFlatGrid();
    this.detectPools();
  }

  private initFlatGrid(): void {
    this.cells = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => new FlatGround()),
    );
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const cell = this.cells[row][col];
        cell.attach(this, col, row);
        this.scene.add(cell);
        cell.syncGraphic();
      }
    }
  }

  private setCell(col: number, row: number, next: Terrain): void {
    const prev = this.cells[row][col];
    if (next !== prev) {
      this.scene.remove(prev);
      next.attach(this, col, row);
      this.cells[row][col] = next;
      this.scene.add(next);
    }
    this.refreshGraphics(col, row);
  }

  private refreshGraphics(col: number, row: number): void {
    for (const [c, r] of [[col, row], [col, row - 1], [col, row + 1], [col - 1, row], [col + 1, row]]) {
      if (this.inBounds(c, r)) { this.cells[r][c].syncGraphic(); }
    }
  }

  private refreshPoolGraphics(): void {
    for (const pool of this.pools) {
      for (const { col, row } of pool.members) { this.cells[row][col].syncGraphic(); }
    }
  }

  reset(): void {
    for (const row of this.cells) {
      for (const cell of row) { this.scene.remove(cell); }
    }
    this.initFlatGrid();
    this.pools = [];
    this.poolMap.clear();
    this.detectPools();
  }
```

The existing mutation methods already route through `setCell` (or in-place mutation), so they inherit swap + refresh. Two that mutate in place need explicit refreshes:
- `applyPuddleDeltas`: after the `cell.addPuddle(...)` loop, call `this.refreshPoolGraphics()`.
- `applySandRedistributionAt`: after its `setElevation` calls, call `this.refreshPoolGraphics()` (puddle visuals depend on pool membership — this replaces `GridView.refreshPoolVisuals`).

Add the view-only methods that lived on `GridView`:
```ts
  applyActorPuddleDelta(col: number, row: number, depth: number): void {
    this.applyPuddleDeltas([{ col, row, depth }]);
  }
  // applySandRedistributionAt already exists and returns boolean — reuse it as-is.
```
Keep `applyWaveWaterHit` returning `ErosionResult | null`; the applier (Step 5) derives the actor via `getCell`.

**Step 3 — `CastleActor`** (`src/view/castle-actor.ts`), porting `CastleTile.updateVisual`:

```ts
import { Actor, Vector } from "excalibur";
import { CASTLE_HEIGHT, CASTLE_WIDTH, computeLayout } from "../config.ts";
import { Resources } from "../resources.ts";

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);
const CASTLE_OFFSET = new Vector((CASTLE_WIDTH - 1) * TILE_SIZE * 0.5, (CASTLE_HEIGHT - 1) * TILE_SIZE * 0.5);

export class CastleActor extends Actor {
  constructor(col: number, row: number) {
    super({
      x: GRID_LEFT + (col + 0.5) * TILE_SIZE,
      y: GRID_TOP + (row + 0.5) * TILE_SIZE,
      z: 1, // above flat ground, below selection highlights
    });
    const sprite = Resources.Castle.toSprite();
    sprite.width = TILE_SIZE * CASTLE_WIDTH - 1;
    sprite.height = TILE_SIZE * CASTLE_HEIGHT - 1;
    this.graphics.use(sprite);
    this.graphics.offset = CASTLE_OFFSET;
  }
}
```

**Step 4 — Repoint the sessions** (`src/level-session.ts`, `src/tide-session.ts`):
- Replace `this.model = new GridModel({...})` + `this.grid = new GridView(this.model, this)` with a single `GridModel({...}, this)` (the scene). Collapse `this.grid` and `this.model` into one `GridModel` reference (keep whichever field name minimizes churn; update internal `this.grid.model.X` reads to `this.grid.X`).
- After constructing the grid, `this.add(new CastleActor(this.grid.castleCol, this.grid.castleRow))`.
- `WaveRenderer`, `WaveEventApplier`, `showElevationLabels`, planning-phase all now receive the `GridModel`.

**Step 5 — Repoint the remaining callers** (mechanical; use LSP `findReferences` on `GridView`, `getTile`, `Tile` to catch every site):
- `src/view/terrain-editor.ts`: field/param `GridView` → `GridModel`; `this.grid.model.` → `this.grid.`.
- `src/view/wave-renderer.ts`: import `GridModel`; `import type { Terrain }` instead of `Tile`; `grid.getTile(...)` → `grid.getCell(...)` (always returns a `Terrain`, never `undefined` — simplify the castle-flash loop); `Tile[]` → `Terrain[]`.
- `src/view/screen-overlays.ts`: `GridView` → `GridModel`; `grid.getTile` → `grid.getCell`.
- `src/view/planning-phase.ts`: `GridView` → `GridModel`.
- `src/wave/wave-event-applier.ts`: `grid: GridView` → `GridModel`; set `result.erodedTile = this.grid.applyWaveWaterHit(event.col, event.row, event.depth) ? this.grid.getCell(event.col, event.row) : null;`.
- `src/wave/wave-segment-types.ts`: `erodedTile: Tile | null` → `Terrain | null`; `erodedTiles: Tile[]` → `Terrain[]` (import `type { Terrain }`).
- `src/wave/wave-actor-runtime.ts`: result `erodedTiles` typed `Terrain[]` via the shared type.
- `src/wave/wave-event-applier.test.ts`, `src/wave/wave-actor-runtime.test.ts`: the `erodedTile` test doubles are `{}` cast to `never`/the type — keep the cast, just ensure the imported type name is `Terrain`. `flashErodedTiles`/castle-flash only read `.pos`, satisfied by `Terrain`.

**Step 6 — Delete the dead layer:**
```bash
git rm src/view/grid-view.ts src/view/grid-view.test.ts src/view/tile.ts src/view/castle-tile.ts src/model/grid-model.test.ts
```
Then confirm nothing dangles: `grep -rn "grid-view\|GridView\|from './tile'\|view/tile\|CastleTile" src` → expect no matches.

**Step 7 — Full gate (must be entirely green before committing):**

Run: `node --run static-check`
Expected: `tsc ok`, `lint ok`, `unit_test ok`, `browser_test ok`, `knip ok`.

If knip reports an unused export, it's a missed wire-up (e.g. `CastleActor` not added, or a `GridModel` method no caller uses) — fix the wiring, don't suppress.

**Step 8 — Commit (single atomic commit):**
```bash
git add src/
git commit -m "refactor: terrain actors own the grid; delete GridView/Tile, add CastleActor"
```

---

## Phase 3 — Retire dead tooling & update docs

### Task 3.1: Retire `tools/replay-wave.ts`

**Files:**
- Delete: `tools/replay-wave.ts`

**Step 1:** Confirm nothing references it.

Run: `grep -rn "replay-wave" . --exclude-dir=node_modules` → expect only the doc mentions (which Task 3.2 updates).

**Step 2:** `git rm tools/replay-wave.ts`. (It runs in pure Node and can no longer import the now-Excalibur terrain classes; a future actor-driven debug harness can replace it if needed.)

**Step 3: Gate + commit**

Run: `node --run static-check`
Expected: PASS.

```bash
git rm tools/replay-wave.ts
git commit -m "chore: retire replay-wave.ts (incompatible with actor terrain)"
```

### Task 3.2: Update architecture + gameplay docs

**Files:**
- Modify: `AGENTS.md` — Architecture section: remove `src/view/grid-view.ts`, `src/view/tile.ts`, `src/view/castle-tile.ts` from core files; update `terrain/*` bullet to note each terrain is an Excalibur `Actor`; update `grid-model.ts` bullet to "single grid container: holds the terrain actor grid, wires neighbors, adds/removes actors to the Scene on type-swap, renders via `Terrain.syncGraphic`"; add `src/view/castle-actor.ts`; remove the "Debug Serialization → replay-wave.ts" run instructions (keep the **D**-to-copy JSON description, drop the `tools/replay-wave.ts` usage block).
- Modify: `docs/gameplay.md` — only if it references the view/Tile layer or replay tool; otherwise no gameplay behavior changed, so likely a no-op. Verify with `grep -n "Tile\|GridView\|replay" docs/gameplay.md`.

**Step 1:** Make the edits. Use the humanizer skill if writing prose.

**Step 2:** `node --run static-check` (docs don't affect it, but confirm the tree is still green).

**Step 3: Commit**

```bash
git add AGENTS.md docs/gameplay.md docs/plans/2026-06-09-terrain-actor-migration.md
git commit -m "docs: terrain-actor migration; supersede WIP design"
```

---

## Out of scope (deferred to future water-physics work)

- Volume-carrying water blobs, split-on-wall, merge-on-contact, continuous-2D water motion.
- Collision-driven wave detection (`resolveWaveHit`), deleting `WaveSegment.planWaveCells` / the reach indicator, retuning depletion constants.
- Using terrain colliders for anything (they ship dormant here).
- Any change to `flow-field.ts`, `wave-simulation.ts` (`generateWaveCurve` stays), `water-column.ts`, or the column-based wave runtime beyond type/name plumbing.

## Definition of done

- `node --run static-check` green.
- Game renders identically to pre-migration (terrain, walls/holes/towers, castle, puddles, erosion, sand layer) — verify by running the app.
- `GridView`, `Tile`, `CastleTile`, `tools/replay-wave.ts` deleted; no references remain.
- `Terrain extends Actor` with a Passive collider; `GridModel` is the single container holding + rendering the actor grid.
- Terrain data unit tests stay in `unit`; grid/integration tests live in `browser`.
```
