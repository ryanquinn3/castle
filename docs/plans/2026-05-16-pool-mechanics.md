# Pool Mechanics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adjacent negative-elevation tiles form visual pools (no internal borders) and water fills deepest cells first with gravity-like behavior during wave simulation.

**Architecture:** Add a Pool data structure to grid.ts with flood-fill detection. Modify tile rendering to suppress borders between pool members. Rework wave simulation to redistribute water within pools incrementally (one row per tick, sideways immediate).

**Tech Stack:** TypeScript, Excalibur.js

---

### Task 1: Pool data structure and detection in grid.ts

**Files:**
- Modify: `src/grid.ts`

**Step 1: Add Pool interface and poolId to tiles**

Add to `src/grid.ts`:

```typescript
export interface Pool {
  id: number;
  members: { col: number; row: number }[];
}
```

**Step 2: Add flood-fill pool detection method**

Add `detectPools()` method to `TileGrid`. Uses BFS from each unvisited negative-elevation tile, 4-connected (cardinal only). Returns `Pool[]` and stores on `this.pools`. Each member tile gets a `poolId` field (or -1 if not in a pool).

```typescript
private pools: Pool[] = [];
private poolMap: Map<string, Pool> = new Map();

detectPools(): void {
  this.pools = [];
  this.poolMap.clear();
  const visited = new Set<string>();
  let nextId = 0;

  for (let row = 0; row < GRID_HEIGHT; row++) {
    for (let col = 0; col < GRID_WIDTH; col++) {
      const tile = this.getTile(col, row);
      if (!tile || tile.elevation >= 0) { continue; }
      const key = `${col}:${row}`;
      if (visited.has(key)) { continue; }

      const pool: Pool = { id: nextId++, members: [] };
      const queue = [{ col, row }];
      visited.add(key);

      while (queue.length > 0) {
        const cur = queue.shift()!;
        pool.members.push(cur);
        this.poolMap.set(`${cur.col}:${cur.row}`, pool);

        for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const nc = cur.col + dc;
          const nr = cur.row + dr;
          const nk = `${nc}:${nr}`;
          if (visited.has(nk)) { continue; }
          const nt = this.getTile(nc, nr);
          if (!nt || nt.elevation >= 0) { continue; }
          visited.add(nk);
          queue.push({ col: nc, row: nr });
        }
      }
      this.pools.push(pool);
    }
  }
}

getPool(col: number, row: number): Pool | undefined {
  return this.poolMap.get(`${col}:${row}`);
}
```

**Step 3: Call detectPools() after elevation mutations**

Add `this.detectPools()` at the end of:
- `setElevation()`
- `applyPuddleDeltas()`
- `applyErosion()`
- `applySandRedistribution()`
- Constructor (after all tiles created)

**Step 4: Add helper to check if neighbor is in same pool**

```typescript
isPoolNeighbor(col: number, row: number, dc: number, dr: number): boolean {
  const pool = this.getPool(col, row);
  if (!pool) { return false; }
  const neighbor = this.getPool(col + dc, row + dr);
  return neighbor === pool;
}
```

**Step 5: Build and typecheck**

Run: `rtk npm run build`
Expected: Clean build, no type errors.

**Step 6: Commit**

```bash
rtk git add src/grid.ts && rtk git commit -m "feat: add pool detection with flood-fill in TileGrid"
```

---

### Task 2: Visual border suppression for pool tiles

**Files:**
- Modify: `src/tile.ts`
- Modify: `src/grid.ts` (add neighbor info passing)

**Step 1: Add neighbor elevation context to Tile.updateVisual()**

Change `updateVisual()` signature to accept optional neighbor info:

```typescript
interface NeighborInfo {
  top: boolean;    // true if neighbor above is negative elevation (same pool)
  bottom: boolean;
  left: boolean;
  right: boolean;
}

updateVisual(neighbors?: NeighborInfo): void {
```

When `neighbors` is provided and this tile has negative elevation, skip borders on edges where the neighbor flag is true.

**Step 2: Modify border drawing for negative elevation tiles**

In the `else` branch (elevation < 0) of the canvas draw function, conditionally draw each border:

- Top shadow border (line 153-154): skip if `neighbors.top`
- Left shadow border (line 155): skip if `neighbors.left`
- Bottom diffuse border (line 158): skip if `neighbors.bottom`
- Right diffuse border (line 159): skip if `neighbors.right`

**Step 3: Update cache key to include neighbor info**

Change cache key from `${elevation}:${puddleDepth}` to include neighbor flags:
```typescript
const nKey = neighbors
  ? `${+neighbors.top}${+neighbors.bottom}${+neighbors.left}${+neighbors.right}`
  : '0000';
const cacheKey = `${elevation}:${puddleDepth}:${nKey}`;
```

**Step 4: Add refreshPoolVisuals() to TileGrid**

After `detectPools()`, call a method that updates visuals for all pool member tiles with correct neighbor info:

```typescript
refreshPoolVisuals(): void {
  for (const pool of this.pools) {
    for (const { col, row } of pool.members) {
      const tile = this.getTile(col, row);
      if (!tile) { continue; }
      tile.updateVisual({
        top: this.isPoolNeighbor(col, row, 0, -1),
        bottom: this.isPoolNeighbor(col, row, 0, 1),
        left: this.isPoolNeighbor(col, row, -1, 0),
        right: this.isPoolNeighbor(col, row, 1, 0),
      });
    }
  }
}
```

Call `refreshPoolVisuals()` at the end of `detectPools()`.

**Step 5: Build and typecheck**

Run: `rtk npm run build`
Expected: Clean build.

**Step 6: Verify visually**

Run: `npm run dev`
Dig adjacent holes in planning phase. Confirm internal borders disappear while outer borders remain. Each cell still shows its own depth color.

**Step 7: Commit**

```bash
rtk git add src/tile.ts src/grid.ts && rtk git commit -m "feat: suppress internal borders between pool tiles"
```

---

### Task 3: Pool-aware water redistribution in wave simulation

**Files:**
- Modify: `src/wave.ts`
- Modify: `src/grid.ts` (add pool water helpers)

This is the core mechanic change. Water entering a pool tile redistributes to same-row pool members (sideways immediate), then flows down one row per tick.

**Step 1: Add pool topology to wave simulation input**

Extend `AdvanceInput` and `RecedeInput`:

```typescript
export interface PoolInfo {
  members: { col: number; row: number }[];
}

// Add to AdvanceInput and SimulateWaveInput:
pools: PoolInfo[];
poolMap: Map<string, PoolInfo>;
```

Pass pool data from `WaveAnimator.animate()` through `simulateWave()`.

**Step 2: Add same-row pool redistribution function**

```typescript
function redistributeInPool(
  pool: PoolInfo,
  row: number,
  puddleDelta: number[][],
  effectiveHoleDepths: number[][],
  elevations: number[][],
): void {
  // Collect same-row members of this pool
  const rowMembers = pool.members.filter(m => m.row === row);
  if (rowMembers.length <= 1) { return; }

  // Gather total water and total capacity for these cells
  let totalWater = 0;
  const cells: { col: number; elevation: number; capacity: number }[] = [];

  for (const m of rowMembers) {
    totalWater += puddleDelta[row][m.col];
    const capacity = effectiveHoleDepths[row][m.col];
    cells.push({ col: m.col, elevation: elevations[row][m.col], capacity });
  }

  if (totalWater <= 0) { return; }

  // Sort by elevation (deepest first)
  cells.sort((a, b) => a.elevation - b.elevation);

  // Fill from deepest up, equalizing surface level
  // Reset all deltas for these cells, then redistribute
  for (const c of cells) {
    puddleDelta[row][c.col] = 0;
  }

  let remaining = totalWater;
  for (let i = 0; i < cells.length && remaining > 0; i++) {
    const nextLevel = i + 1 < cells.length ? cells[i + 1].elevation : 0;
    const groupSize = i + 1;
    const depthToNext = nextLevel - cells[i].elevation;

    if (depthToNext > 0) {
      const fillNeeded = depthToNext * groupSize;
      if (remaining >= fillNeeded) {
        remaining -= fillNeeded;
        // All cells 0..i fill up to nextLevel
      } else {
        const perCell = remaining / groupSize;
        for (let j = 0; j <= i; j++) {
          const cap = cells[j].capacity;
          puddleDelta[row][cells[j].col] = Math.min(cap, /* accumulated */);
        }
        remaining = 0;
      }
    }
  }
  // ... (full equalization algorithm)
}
```

The exact algorithm: accumulate water into sorted cells bottom-up. For each "level band" between adjacent elevations, fill the group evenly. Clamp each cell's delta to its effective capacity. Update effectiveHoleDepths in-place so subsequent columns/rows see correct state.

**Step 3: Integrate redistribution into simulateAdvance()**

After processing each row in the advance loop (after the per-column logic and before lateral spread):

```typescript
// After tile interactions for this row, redistribute within pools
const poolsSeenThisRow = new Set<PoolInfo>();
for (let col = 0; col < numCols; col++) {
  if (puddleDelta[row][col] > 0) {
    const pool = poolMap.get(`${col}:${row}`);
    if (pool && !poolsSeenThisRow.has(pool)) {
      poolsSeenThisRow.add(pool);
      redistributeInPool(pool, row, puddleDelta, effectiveHoleDepths, elevations);
    }
  }
}
```

**Step 4: Handle downward flow within pools**

When the wave advances to a new row, if a cell is in a pool and has pool members in the previous row that have accumulated water, that water can flow down. After the standard column-by-column processing for row R:

- For each pool with members at row R, check if row R-1 members have surplus water (puddle delta exceeding their share after equalization)
- Allow overflow to flow into row R members, subject to their remaining capacity
- This naturally happens because effectiveHoleDepths are updated in-place

**Step 5: Skip lateral spread for pool members**

In the lateral spread section, skip spreading from/to columns that are in the same pool at this row (pool redistribution already handles this):

```typescript
// In spread loop: skip if both col and neighbor are in the same pool at this row
const colPool = poolMap.get(`${col}:${row}`);
const nPool = poolMap.get(`${n}:${row}`);
if (colPool && colPool === nPool) { continue; }
```

**Step 6: Mirror changes for simulateRecede()**

Same redistribution logic but:
- Flow direction is upward (row-1 instead of row+1)
- Same-row sideways spread is still immediate
- Use `effectiveLocal` (the mutable copy) for capacity tracking

**Step 7: Pass pool data through simulateWave()**

In `simulateWave()`, accept pools in `SimulateWaveInput`, pass to both `simulateAdvance()` and `simulateRecede()`.

In `WaveAnimator.animate()`, get pool data from grid:

```typescript
const pools = this.grid.getPools();
const poolMap = this.grid.getPoolMap();
```

**Step 8: Build and typecheck**

Run: `rtk npm run build`
Expected: Clean build.

**Step 9: Test gameplay**

Run: `npm run dev`
- Dig a 3x1 horizontal trench at varying depths (-1, -3, -1)
- Send wave. Verify water fills the -3 cell before the -1 cells
- Dig an L-shaped pool. Verify water flows sideways within same row and down one row per tick
- Verify non-pool tiles still behave normally

**Step 10: Commit**

```bash
rtk git add src/wave.ts src/grid.ts src/wave-animator.ts && rtk git commit -m "feat: pool-aware water redistribution during wave simulation"
```

---

### Task 4: Update Playwright visual regression baselines

**Files:**
- Modify: `tests/main.spec.ts-snapshots/*`

**Step 1: Rebuild baselines**

Run: `npm run test:integration-update`
Expected: New baselines generated reflecting pool border changes.

**Step 2: Run tests against new baselines**

Run: `rtk npm test`
Expected: All tests pass.

**Step 3: Commit**

```bash
rtk git add tests/ && rtk git commit -m "test: update baselines for pool mechanics"
```
