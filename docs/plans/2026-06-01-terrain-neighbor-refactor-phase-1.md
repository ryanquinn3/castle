# Terrain Neighbor Refactor (Phase 1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give every `Terrain` instance live knowledge of its four cardinal neighbors, and decouple the view layer from neighbor computation, with zero change to rendered output.

**Architecture:** A narrow `NeighborGrid` interface (implemented by `GridModel`) owns the n/s/e/w direction arithmetic. Each `Terrain` stores its `(col,row)` plus a back-reference and exposes a lazy `get neighbors()` that looks up live, so it can never go stale when cells are replaced on mutation. The existing (vestigial) `Hole.neighbors` flag field and the detectPools write are removed; `Hole` rendering derives its edge flags from `this.neighbors` instead of flags threaded through the view. `getPoolNeighbors` is **kept** (the digging hover-preview code still uses it).

**Tech Stack:** TypeScript, Excalibur.js, Vite, Vitest (unit), Playwright (visual regression).

**Design doc:** `docs/plans/2026-06-01-terrain-neighbor-refactor-and-wall-rendering.md` (this is Phase 1 of two).

---

## Pre-flight

**Files involved:**
- Modify: `src/model/terrain.ts`
- Modify: `src/model/grid-model.ts`
- Modify: `src/view/tile.ts`
- Modify: `src/view/grid-view.ts:110-121` (`refreshTileVisual`)
- Test: `src/model/terrain.test.ts`, `src/model/grid-model.test.ts`

**Untouched (verified consumers of `getPoolNeighbors`, hover-preview only):** `src/view/single-cell-digging.ts:205`, `src/view/drag-digging.ts:290`, `src/view/drag-digging.test.ts:89`.

**Conventions to follow:**
- `grid-model.test.ts` uses `baseTest.extend<{ grid: GridModel }>(...)` fixtures. Reuse the existing `grid` fixture.
- `terrain.test.ts` uses plain `test(...)` with `describe` blocks per class.
- Curly braces on all `if`s; `for..of`/iterators over index loops where natural; canonical errors; object args for 3+ params.
- Conventional commits (`feat:`, `refactor:`, `test:`).

**Behavior-preservation invariant:** adjacent holes are always in the same pool (pools are a flood-fill over adjacent holes), so `neighbor instanceof Hole` equals today's `getPoolNeighbors` membership flag, and out-of-bounds maps to `null instanceof Hole === false` just like `getPool(...) === undefined`. Therefore Playwright baselines MUST stay unchanged.

---

## Task 1: Neighbor types + `Terrain.neighbors` getter

**Files:**
- Modify: `src/model/terrain.ts` (top of file + `Terrain` base class)
- Test: `src/model/terrain.test.ts`

**Step 1: Write the failing test**

Add to `src/model/terrain.test.ts` (new `describe` near the top, after imports):

```ts
describe('Terrain.neighbors', () => {
  test('unattached terrain reports all-null neighbors', () => {
    const wall = new Wall(3);
    expect(wall.neighbors).toEqual({ north: null, south: null, east: null, west: null });
  });

  test('attach wires a NeighborGrid that resolves directions', () => {
    const north = new Wall(1);
    const fakeGrid = {
      neighborsOf: (_col: number, _row: number) => ({ north, south: null, east: null, west: null }),
    };
    const wall = new Wall(3);
    wall.attach(fakeGrid, 2, 5);
    expect(wall.col).toBe(2);
    expect(wall.row).toBe(5);
    expect(wall.neighbors.north).toBe(north);
  });
});
```

Add `NeighborGrid` to the existing import line:

```ts
import { FlatGround, Hole, Tower, Wall, type NeighborGrid } from './terrain.ts';
```

**Step 2: Run test to verify it fails**

Run: `node --run test:unit`
Expected: FAIL (`attach` / `neighbors` not defined; `NeighborGrid` not exported).

**Step 3: Write minimal implementation**

In `src/model/terrain.ts`, add above the `Terrain` abstract class (after the existing interfaces):

```ts
export type Neighbors = {
  north: Terrain | null;
  south: Terrain | null;
  east: Terrain | null;
  west: Terrain | null;
};

// The grid owns the n/s/e/w direction arithmetic and bounds checking.
export interface NeighborGrid {
  neighborsOf(col: number, row: number): Neighbors;
}

const NO_NEIGHBORS: Neighbors = { north: null, south: null, east: null, west: null };
```

In the `Terrain` abstract class body, add fields + methods (before the abstract members):

```ts
private grid: NeighborGrid | null = null;
col = -1;
row = -1;

attach(grid: NeighborGrid, col: number, row: number): void {
  this.grid = grid;
  this.col = col;
  this.row = row;
}

get neighbors(): Neighbors {
  if (!this.grid) {
    return NO_NEIGHBORS;
  }
  return this.grid.neighborsOf(this.col, this.row);
}
```

**Step 4: Run test to verify it passes**

Run: `node --run test:unit`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/model/terrain.ts src/model/terrain.test.ts
git commit -m "feat: add NeighborGrid interface and Terrain.neighbors getter"
```

---

## Task 2: `Terrain.connectsTo()`

**Files:**
- Modify: `src/model/terrain.ts` (`Terrain` base, `Wall`, `Tower`)
- Test: `src/model/terrain.test.ts`

**Step 1: Write the failing test**

Add to `src/model/terrain.test.ts`:

```ts
describe('connectsTo', () => {
  test('walls connect to walls and towers, not flat/hole/null', () => {
    const wall = new Wall(3);
    expect(wall.connectsTo(new Wall(1))).toBe(true);
    expect(wall.connectsTo(new Tower(15))).toBe(true);
    expect(wall.connectsTo(new FlatGround())).toBe(false);
    expect(wall.connectsTo(new Hole(2))).toBe(false);
    expect(wall.connectsTo(null)).toBe(false);
  });

  test('towers connect to walls and towers', () => {
    const tower = new Tower(15);
    expect(tower.connectsTo(new Wall(1))).toBe(true);
    expect(tower.connectsTo(new Tower(15))).toBe(true);
    expect(tower.connectsTo(new FlatGround())).toBe(false);
  });

  test('flat and hole connect to nothing', () => {
    expect(new FlatGround().connectsTo(new Wall(1))).toBe(false);
    expect(new Hole(2).connectsTo(new Hole(2))).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --run test:unit`
Expected: FAIL (`connectsTo` not a function).

**Step 3: Write minimal implementation**

In the `Terrain` base class, add a default:

```ts
connectsTo(_other: Terrain | null): boolean {
  return false;
}
```

In `Wall` and `Tower`, override:

```ts
override connectsTo(other: Terrain | null): boolean {
  return other instanceof Wall || other instanceof Tower;
}
```

**Step 4: Run test to verify it passes**

Run: `node --run test:unit`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/model/terrain.ts src/model/terrain.test.ts
git commit -m "feat: add Terrain.connectsTo for wall/tower connectivity"
```

---

## Task 3: `GridModel` implements `NeighborGrid` + `setCell` choke point

**Files:**
- Modify: `src/model/grid-model.ts`
- Test: `src/model/grid-model.test.ts`

**Step 1: Write the failing test**

Add to `src/model/grid-model.test.ts` (new `describe`):

```ts
describe('neighborsOf', () => {
  test('returns adjacent terrain instances', ({ grid }) => {
    grid.setElevation(5, 5, 2); // wall
    grid.setElevation(5, 4, -1); // hole to the north
    const n = grid.neighborsOf(5, 5);
    expect(n.north).toBe(grid.getCell(5, 4));
    expect(n.south).toBe(grid.getCell(5, 6));
    expect(n.east).toBe(grid.getCell(6, 5));
    expect(n.west).toBe(grid.getCell(4, 5));
  });

  test('returns null past the grid edge', ({ grid }) => {
    const n = grid.neighborsOf(0, 0);
    expect(n.north).toBeNull();
    expect(n.west).toBeNull();
    expect(n.south).not.toBeNull();
    expect(n.east).not.toBeNull();
  });

  test('terrain.neighbors reflects live state after a cell is replaced', ({ grid }) => {
    grid.setElevation(5, 5, 2);
    const wall = grid.getCell(5, 5);
    expect(wall.neighbors.east).toBe(grid.getCell(6, 5)); // flat
    grid.setElevation(6, 5, 3); // replace east neighbor with a wall
    expect(wall.connectsTo(wall.neighbors.east)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --run test:unit`
Expected: FAIL (`neighborsOf` not a function).

**Step 3: Write minimal implementation**

In `src/model/grid-model.ts`:

Add `NeighborGrid`, `Neighbors` to the terrain import:

```ts
import { Terrain, FlatGround, Wall, Hole, Tower, type NeighborGrid, type Neighbors } from './terrain.ts';
```

Declare the class implements it:

```ts
export class GridModel implements NeighborGrid {
```

Add the private cell-or-null helper, the `neighborsOf` method, and the `setCell` choke point (place near `getCell`):

```ts
private cellOrNull(col: number, row: number): Terrain | null {
  if (!this.inBounds(col, row)) {
    return null;
  }
  return this.cells[row][col];
}

neighborsOf(col: number, row: number): Neighbors {
  return {
    north: this.cellOrNull(col, row - 1),
    south: this.cellOrNull(col, row + 1),
    east: this.cellOrNull(col + 1, row),
    west: this.cellOrNull(col - 1, row),
  };
}

private setCell(col: number, row: number, terrain: Terrain): void {
  terrain.attach(this, col, row);
  this.cells[row][col] = terrain;
}
```

Route all assignments through attachment:

- `makeFlatGrid()` -> keep building the array, then attach. Replace its body so the constructor and `reset()` produce attached cells. Simplest: add a private `initFlatGrid()` that both fills and attaches, and call it from the constructor and `reset()` in place of `this.cells = this.makeFlatGrid()`:

```ts
private initFlatGrid(): void {
  this.cells = Array.from({ length: this.height }, () =>
    Array.from({ length: this.width }, () => new FlatGround()),
  );
  for (let row = 0; row < this.height; row++) {
    for (let col = 0; col < this.width; col++) {
      this.cells[row][col].attach(this, col, row);
    }
  }
}
```

  Constructor: replace `this.cells = this.makeFlatGrid();` with `this.initFlatGrid();`.
  `reset()`: replace `this.cells = this.makeFlatGrid();` with `this.initFlatGrid();`.
  Delete the now-unused `makeFlatGrid()`.

- `setElevation`: change `this.cells[row][col] = this.cells[row][col].applyDelta(clampedDelta);` to:

```ts
this.setCell(col, row, this.cells[row][col].applyDelta(clampedDelta));
```

- `placeTower`: change `this.cells[row][col] = new Tower(TOWER_HEIGHT);` to `this.setCell(col, row, new Tower(TOWER_HEIGHT));`.

- `applyErosion`: change `this.cells[row][col] = new FlatGround();` to `this.setCell(col, row, new FlatGround());`.

**Step 4: Run test to verify it passes**

Run: `node --run test:unit`
Expected: PASS (new `neighborsOf` block green; existing `getPoolNeighbors` block still green).

**Step 5: Commit**

```bash
git add src/model/grid-model.ts src/model/grid-model.test.ts
git commit -m "feat: GridModel implements NeighborGrid with setCell attachment"
```

---

## Task 4: Remove vestigial `Hole.neighbors`; derive hole render flags from `this.neighbors`; add `cacheKey`

**Files:**
- Modify: `src/model/terrain.ts` (`TileRenderInfo`, `Hole`, remove `PoolNeighborFlags`)
- Modify: `src/model/grid-model.ts` (`detectPools` write block)
- Test: `src/model/grid-model.test.ts` (replace the `pool neighbor flags on Hole` block)

**Step 1: Write the failing test**

In `src/model/grid-model.test.ts`, **replace** the entire `describe('pool neighbor flags on Hole', ...)` block (currently ~lines 439-465) with:

```ts
describe('hole neighbor awareness', () => {
  test('a hole sees adjacent holes via this.neighbors', ({ grid }) => {
    grid.setElevation(3, 3, -1);
    grid.setElevation(4, 3, -1); // east
    grid.setElevation(3, 4, -1); // south

    const hole = grid.getCell(3, 3) as Hole;
    expect(hole.neighbors.south).toBeInstanceOf(Hole);
    expect(hole.neighbors.east).toBeInstanceOf(Hole);
    expect(hole.neighbors.north).not.toBeInstanceOf(Hole);
    expect(hole.neighbors.west).not.toBeInstanceOf(Hole);
  });

  test('hole getRenderInfo exposes a stable cacheKey reflecting neighbors', ({ grid }) => {
    grid.setElevation(3, 3, -1);
    const before = (grid.getCell(3, 3) as Hole).getRenderInfo().cacheKey;
    grid.setElevation(4, 3, -1); // add an east hole neighbor
    const after = (grid.getCell(3, 3) as Hole).getRenderInfo().cacheKey;
    expect(before).not.toEqual(after);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --run test:unit`
Expected: FAIL (`getRenderInfo().cacheKey` undefined; old block referenced removed field).

**Step 3: Write minimal implementation**

In `src/model/terrain.ts`:

1. Update `TileRenderInfo` (drop the `neighbors` param on `customDraw`, add `cacheKey`):

```ts
export interface TileRenderInfo {
  sprite: Sprite | null;
  tint: Color | null;
  cacheKey?: string;
  customDraw?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}
```

2. Delete the `PoolNeighborFlags` interface (lines ~42-47).

3. In `Hole`: delete the field `neighbors: PoolNeighborFlags = {...}` (line ~267).

4. In `Hole.getRenderInfo()`: derive edge flags from `this.neighbors`, set `cacheKey`, and change `customDraw` to read those flags (no param). Replace the method with:

```ts
getRenderInfo(): TileRenderInfo {
  const nb = this.neighbors;
  const nt = nb.north instanceof Hole;
  const nbm = nb.south instanceof Hole;
  const nl = nb.west instanceof Hole;
  const nr2 = nb.east instanceof Hole;
  const cacheKey = `hole:${this.elevation}:${this.puddleDepth}:${+nt}${+nbm}${+nl}${+nr2}`;
  return {
    sprite: null,
    tint: null,
    cacheKey,
    customDraw: (ctx, width, height) => {
      const elevation = this.elevation;
      const puddleDepth = this.puddleDepth;
      const color = elevationToColor(elevation);
      const r = color.r;
      const g = color.g;
      const b = color.b;
      const cornerRadius = Math.max(3, Math.floor(width * 0.2));

      const fillW = nr2 ? width : width - 1;
      const fillH = nbm ? height : height - 1;

      const tl = (!nt && !nl) ? cornerRadius : 0;
      const tr = (!nt && !nr2) ? cornerRadius : 0;
      const br = (!nbm && !nr2) ? cornerRadius : 0;
      const bl = (!nbm && !nl) ? cornerRadius : 0;
      ctx.beginPath();
      ctx.roundRect(0, 0, fillW, fillH, [tl, tr, br, bl]);
      ctx.save();
      ctx.clip();

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, fillW, fillH);

      const shadowR = clamp(r - 60, 0, 255);
      const shadowG = clamp(g - 60, 0, 255);
      const shadowB = clamp(b - 60, 0, 255);
      const diffuseR = clamp(r + 30, 0, 255);
      const diffuseG = clamp(g + 30, 0, 255);
      const diffuseB = clamp(b + 30, 0, 255);

      ctx.fillStyle = `rgb(${shadowR},${shadowG},${shadowB})`;
      if (!nt) { ctx.fillRect(0, 0, fillW, 2); }
      if (!nl) { ctx.fillRect(0, 0, 2, fillH); }

      ctx.fillStyle = `rgb(${diffuseR},${diffuseG},${diffuseB})`;
      if (!nbm) { ctx.fillRect(0, height - 2, fillW, 1); }
      if (!nr2) { ctx.fillRect(width - 2, 0, 1, fillH); }

      if (puddleDepth > 0 && elevation < 0) {
        const puddleAlpha = 0.25 + (puddleDepth / -elevation) * 0.45;
        ctx.fillStyle = `rgba(60, 130, 200, ${puddleAlpha})`;
        const px = nl ? 2 : 0;
        const py = nt ? 2 : 0;
        const pw = (nr2 ? width : width - 2) - px;
        const ph = (nbm ? height : height - 2) - py;
        ctx.fillRect(px, py, pw, ph);
      }

      ctx.restore();
    },
  };
}
```

> Note: the local names mirror the originals (`nt`, `nb`->`nbm` to avoid clashing with the `nb` neighbors object, `nl`, `nr2`) so the draw math is byte-identical to today's output.

In `src/model/grid-model.ts`:

5. In `detectPools()`, delete the trailing block that writes `cell.neighbors` (the `for (const pool of this.pools)` loop that sets `cell.neighbors = {...}`, current ~lines 323-335). Keep everything that builds `this.pools` and `this.poolMap`.

**Step 4: Run test to verify it passes**

Run: `node --run test:unit`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/model/terrain.ts src/model/grid-model.ts src/model/grid-model.test.ts
git commit -m "refactor: derive Hole render flags from neighbors, drop vestigial field"
```

---

## Task 5: Decouple the view from neighbor computation

**Files:**
- Modify: `src/view/tile.ts`
- Modify: `src/view/grid-view.ts:110-121`

**Step 1: Write the failing test**

This task is a view-layer wiring change verified by the existing `src/view/grid-view.test.ts` suite plus the build. No new unit test (the behavior is exercised by visual regression in Task 6). Confirm the contract by type-checking.

**Step 2: Run to verify current state compiles**

Run: `node --run build`
Expected: PASS before the change (baseline).

**Step 3: Make the change**

In `src/view/tile.ts`:

- Delete the local `export interface PoolNeighbors {...}` (lines ~14-19).
- Change the method signature `updateVisual(neighbors?: PoolNeighbors): void` to `updateVisual(): void`.
- Replace the `customDraw` branch so it uses `info.cacheKey` and calls `customDraw` with no neighbor arg:

```ts
if (info.customDraw) {
  const cacheKey = info.cacheKey ?? `${this.elevation}:${this.puddleDepth}`;
  const cached = graphicsCache.get(cacheKey);
  if (cached) {
    this.graphics.use(cached);
    return;
  }
  const canvas = new Canvas({
    width: TILE_SIZE,
    height: TILE_SIZE,
    cache: true,
    draw: (ctx) => info.customDraw!(ctx, TILE_SIZE, TILE_SIZE),
  });
  graphicsCache.set(cacheKey, canvas);
  this.graphics.use(canvas);
  return;
}
```

In `src/view/grid-view.ts` `refreshTileVisual` (lines ~110-121): remove the `getPoolNeighbors` call and pass no args:

```ts
refreshTileVisual(col: number, row: number): void {
  const tile = this.getTile(col, row);
  if (!tile) {
    return;
  }
  tile.elevation = this.model.getElevation(col, row);
  tile.puddleDepth = this.model.getPuddleDepth(col, row);
  tile.waveHitCount = this.model.getHitCount(col, row);
  tile.terrain = this.model.getCell(col, row);
  tile.updateVisual();
}
```

**Step 4: Run to verify it compiles and unit tests pass**

Run: `node --run build && node --run test:unit`
Expected: PASS. (Verified: `grid-view.test.ts` references none of `updateVisual`/`PoolNeighbors`/`getPoolNeighbors`/`cacheKey`, so no test edits are needed here. The digging files and `drag-digging.test.ts` are untouched because they call `getPoolNeighbors` directly for previews.)

**Step 5: Commit**

```bash
git add src/view/tile.ts src/view/grid-view.ts
git commit -m "refactor: tiles render from terrain.neighbors via cacheKey, drop view neighbor plumbing"
```

---

## Task 6: Full verification (incl. visual regression)

**Files:** none (verification only).

**Step 1: Static checks**

Run: `node --run lint && node --run build && node --run test:unit`
Expected: all PASS.

**Step 2: Visual regression (the behavior-preservation proof)**

Run the Playwright suite against the existing baselines (do NOT update baselines):

Run: `node --run test:integration` (or the project's Playwright command per `AGENTS.md` Testing section)
Expected: PASS with **no** screenshot diffs. Holes (and everything else) render byte-identically because the derived flags equal the old pool flags.

If a diff appears, STOP and use superpowers:systematic-debugging, the invariant in Pre-flight says output must be identical; a diff means a flag-derivation or attachment bug, not an intended change.

**Step 3: Commit (only if any non-source artifacts changed, e.g. none expected)**

No commit expected. If verification is clean, Phase 1 is complete and Phase 2 (contiguous wall rendering) can begin from the design doc.

---

## Done criteria

- [ ] `Terrain` exposes `attach()`, `col`, `row`, `get neighbors()`, `connectsTo()`.
- [ ] `GridModel implements NeighborGrid`; every cell assignment routes through `setCell`/`initFlatGrid` (attached).
- [ ] `Hole` renders from `this.neighbors`; vestigial `Hole.neighbors` field and `detectPools` write removed; `PoolNeighborFlags` deleted.
- [ ] `getPoolNeighbors` retained for hover previews; `single-cell-digging`/`drag-digging` untouched.
- [ ] `TileRenderInfo.cacheKey` drives the tile graphics cache; `customDraw` no longer takes neighbors; view no longer threads neighbor flags.
- [ ] `lint`, `build`, `test:unit` green; **Playwright baselines unchanged**.
