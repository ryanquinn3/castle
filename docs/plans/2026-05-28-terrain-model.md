# Terrain Model Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace implicit elevation-based terrain representation with a `Terrain` class hierarchy (`FlatGround`, `Hole`, `Wall`) so each terrain type encapsulates its own water interaction, erosion, hit counting, mutation, and rendering -- clearing the path for a `Tower` type.

**Architecture:** Abstract `Terrain` base class stored in every cell of `GridModel.cells: Terrain[][]`. Eliminates parallel `elevations[][]`, `puddleDepths[][]`, `hitCounts[][]` arrays. Wave simulation takes `Terrain[][]` directly and calls `cell.onWaterHit(column, direction)` instead of `WaterColumn.applyTerrain(elevation)`. Each subclass owns its full behavior: `Wall` counts hits, erodes, returns sprites. `GridModel` keeps only grid-level concerns (pool detection, sand redistribution with neighbor lookups, projection helpers for serialization).

**Tech Stack:** Excalibur.js, TypeScript, Vitest

---

### Task 1: Create Terrain base class and FlatGround

**Files:**
- Create: `src/model/terrain.ts`
- Create: `src/model/terrain.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { FlatGround } from './terrain.ts';

describe('FlatGround', () => {
  test('has elevation 0', () => {
    const t = new FlatGround();
    expect(t.elevation).toBe(0);
  });

  test('sprite is null', () => {
    const t = new FlatGround();
    expect(t.sprite).toBeNull();
  });

  test('onWaterHit passes water through unchanged', () => {
    const t = new FlatGround();
    const column = { floorLevel: 0, surfaceLevel: 5, depth: 5 };
    const event = t.onWaterHit(column, 'north');
    expect(event).toBeNull();
    expect(column.depth).toBe(5);
  });

  test('applyHits returns null', () => {
    const t = new FlatGround();
    expect(t.applyHits(5)).toBeNull();
  });

  test('applyDelta +3 returns Wall with height 3', () => {
    const t = new FlatGround();
    const result = t.applyDelta(3);
    expect(result.elevation).toBe(3);
    expect(result.constructor.name).toBe('Wall');
  });

  test('applyDelta -2 returns Hole with depth 2', () => {
    const t = new FlatGround();
    const result = t.applyDelta(-2);
    expect(result.elevation).toBe(-2);
    expect(result.constructor.name).toBe('Hole');
  });

  test('applyDelta 0 returns FlatGround', () => {
    const t = new FlatGround();
    const result = t.applyDelta(0);
    expect(result.constructor.name).toBe('FlatGround');
  });

  test('resetHits is a no-op', () => {
    const t = new FlatGround();
    t.resetHits();
    expect(t.elevation).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --run src/model/terrain.test.ts`
Expected: FAIL -- module not found

**Step 3: Write minimal implementation**

```ts
import type { ImageSource } from 'excalibur';
import type { WaterColumn } from './water-column.ts';

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';
export type WallEvent = 'overtopped' | 'blocked' | null;

export interface ErosionResult {
  newElevation: number;
}

export abstract class Terrain {
  abstract get elevation(): number;
  abstract get sprite(): ImageSource | null;

  abstract onWaterHit(column: WaterColumn, direction: CardinalDirection): WallEvent;
  abstract applyHits(count: number): ErosionResult | null;
  abstract applyDelta(amount: number): Terrain;
  abstract resetHits(): void;
}

export class FlatGround extends Terrain {
  get elevation(): number {
    return 0;
  }

  get sprite(): ImageSource | null {
    return null;
  }

  onWaterHit(_column: WaterColumn, _direction: CardinalDirection): WallEvent {
    return null;
  }

  applyHits(_count: number): ErosionResult | null {
    return null;
  }

  applyDelta(amount: number): Terrain {
    if (amount > 0) {
      return new Wall(amount);
    }
    if (amount < 0) {
      return new Hole(-amount);
    }
    return new FlatGround();
  }

  resetHits(): void {}
}
```

Note: `Wall` and `Hole` are forward-referenced here. They'll be stubbed minimally (just constructor + elevation getter) so this compiles, then fully implemented in Tasks 2-3.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --run src/model/terrain.test.ts`
Expected: PASS

**Step 5: Run typecheck**

Run: `npm run build`
Expected: PASS (no type errors)

**Step 6: Commit**

```bash
git add src/model/terrain.ts src/model/terrain.test.ts
git commit -m "feat: add Terrain base class and FlatGround implementation"
```

---

### Task 2: Implement Wall

**Files:**
- Modify: `src/model/terrain.ts`
- Modify: `src/model/terrain.test.ts`

**Step 1: Write the failing tests**

Add to `terrain.test.ts`:

```ts
import { FlatGround, Wall, Hole } from './terrain.ts';
import { WaterColumn } from './water-column.ts';

describe('Wall', () => {
  test('elevation equals height', () => {
    const w = new Wall(5);
    expect(w.elevation).toBe(5);
  });

  test('sprite returns WallLevel1 for height 1-5', () => {
    const w = new Wall(3);
    expect(w.sprite).not.toBeNull();
  });

  test('sprite returns WallLevel4 for height 16-20', () => {
    const w = new Wall(18);
    expect(w.sprite).not.toBeNull();
  });

  test('onWaterHit blocks when wall height >= water surface', () => {
    const w = new Wall(5);
    const col = new WaterColumn(0, 4);
    const event = w.onWaterHit(col, 'north');
    expect(event).toBe('blocked');
    expect(col.depth).toBe(0);
  });

  test('onWaterHit overtops when wall between floor and surface', () => {
    const w = new Wall(3);
    const col = new WaterColumn(0, 5);
    const event = w.onWaterHit(col, 'north');
    expect(event).toBe('overtopped');
    expect(col.floorLevel).toBe(3);
    expect(col.depth).toBe(2);
  });

  test('onWaterHit passes through when wall at or below floor', () => {
    const w = new Wall(1);
    const col = new WaterColumn(2, 5);
    const event = w.onWaterHit(col, 'north');
    expect(event).toBeNull();
  });

  test('onWaterHit counts hit when water depth >= 2 above wall', () => {
    const w = new Wall(3);
    const col = new WaterColumn(0, 6);
    w.onWaterHit(col, 'north');
    expect(w.hitCount).toBe(1);
  });

  test('onWaterHit does not count hit when water depth < 2 above wall', () => {
    const w = new Wall(3);
    const col = new WaterColumn(0, 4);
    w.onWaterHit(col, 'north');
    expect(w.hitCount).toBe(0);
  });

  test('erodes after 3 hits', () => {
    const w = new Wall(5);
    const tallColumn = () => new WaterColumn(0, 10);
    w.onWaterHit(tallColumn(), 'north');
    w.onWaterHit(tallColumn(), 'north');
    w.onWaterHit(tallColumn(), 'north');
    expect(w.elevation).toBe(4);
    expect(w.hitCount).toBe(0);
  });

  test('applyHits erodes and returns result at threshold', () => {
    const w = new Wall(5);
    expect(w.applyHits(2)).toBeNull();
    const result = w.applyHits(1);
    expect(result).toEqual({ newElevation: 4 });
    expect(w.hitCount).toBe(0);
  });

  test('applyHits handles multiple erosions from large hit count', () => {
    const w = new Wall(5);
    const result = w.applyHits(6);
    expect(w.elevation).toBe(3);
    expect(w.hitCount).toBe(0);
  });

  test('applyDelta +2 increases height', () => {
    const w = new Wall(3);
    const result = w.applyDelta(2);
    expect(result.elevation).toBe(5);
    expect(result).toBe(w);
  });

  test('applyDelta -3 on height 3 returns FlatGround', () => {
    const w = new Wall(3);
    const result = w.applyDelta(-3);
    expect(result.constructor.name).toBe('FlatGround');
  });

  test('applyDelta -5 on height 3 returns Hole with depth 2', () => {
    const w = new Wall(3);
    const result = w.applyDelta(-5);
    expect(result.constructor.name).toBe('Hole');
    expect(result.elevation).toBe(-2);
  });

  test('applyDelta clamps to MAX_ELEVATION', () => {
    const w = new Wall(18);
    const result = w.applyDelta(5);
    expect(result.elevation).toBe(20);
  });

  test('resetHits clears hit count', () => {
    const w = new Wall(5);
    w.applyHits(2);
    expect(w.hitCount).toBe(2);
    w.resetHits();
    expect(w.hitCount).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --run src/model/terrain.test.ts`
Expected: FAIL

**Step 3: Implement Wall**

Add to `terrain.ts`:

```ts
import { MAX_ELEVATION, MIN_ELEVATION } from '../config.ts';
import { Resources } from '../resources.ts';

export class Wall extends Terrain {
  height: number;
  hitCount: number = 0;

  constructor(height: number) {
    super();
    this.height = Math.min(height, MAX_ELEVATION);
  }

  get elevation(): number {
    return this.height;
  }

  get sprite(): ImageSource | null {
    if (this.height <= 5) {
      return Resources.WallLevel1;
    }
    if (this.height <= 10) {
      return Resources.WallLevel2;
    }
    if (this.height <= 15) {
      return Resources.WallLevel3;
    }
    return Resources.WallLevel4;
  }

  onWaterHit(column: WaterColumn, _direction: CardinalDirection): WallEvent {
    if (column.isEmpty()) {
      return null;
    }

    const effectiveHeight = this.height;
    let event: WallEvent = null;

    if (effectiveHeight >= column.surfaceLevel) {
      column.surfaceLevel = column.floorLevel;
      event = 'blocked';
    } else if (effectiveHeight > column.floorLevel) {
      column.floorLevel = effectiveHeight;
      event = 'overtopped';
    }

    if (column.surfaceLevel - this.height >= 2) {
      this.hitCount += 1;
      if (this.hitCount >= 3) {
        this.hitCount -= 3;
        this.height -= 1;
      }
    }

    return event;
  }

  applyHits(count: number): ErosionResult | null {
    this.hitCount += count;
    let eroded = false;
    while (this.hitCount >= 3 && this.height > 0) {
      this.hitCount -= 3;
      this.height -= 1;
      eroded = true;
    }
    return eroded ? { newElevation: this.height } : null;
  }

  applyDelta(amount: number): Terrain {
    const newHeight = this.height + amount;
    if (newHeight <= 0) {
      if (newHeight < 0) {
        return new Hole(Math.min(-newHeight, -MIN_ELEVATION));
      }
      return new FlatGround();
    }
    this.height = Math.min(newHeight, MAX_ELEVATION);
    return this;
  }

  resetHits(): void {
    this.hitCount = 0;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --run src/model/terrain.test.ts`
Expected: PASS

**Step 5: Run typecheck**

Run: `npm run build`
Expected: PASS

**Step 6: Commit**

```bash
git add src/model/terrain.ts src/model/terrain.test.ts
git commit -m "feat: implement Wall terrain type with hit counting and erosion"
```

---

### Task 3: Implement Hole

**Files:**
- Modify: `src/model/terrain.ts`
- Modify: `src/model/terrain.test.ts`

**Step 1: Write the failing tests**

Add to `terrain.test.ts`:

```ts
describe('Hole', () => {
  test('elevation is negative depth', () => {
    const h = new Hole(3);
    expect(h.elevation).toBe(-3);
  });

  test('sprite is null', () => {
    const h = new Hole(3);
    expect(h.sprite).toBeNull();
  });

  test('starts with 0 puddle depth', () => {
    const h = new Hole(3);
    expect(h.puddleDepth).toBe(0);
  });

  test('effectiveDepth is depth minus puddle', () => {
    const h = new Hole(5);
    h.puddleDepth = 2;
    expect(h.effectiveDepth).toBe(3);
  });

  test('effectiveDepth is 0 when fully puddled', () => {
    const h = new Hole(3);
    h.puddleDepth = 3;
    expect(h.effectiveDepth).toBe(0);
  });

  test('addPuddle increases puddle depth clamped to max', () => {
    const h = new Hole(3);
    h.addPuddle(5);
    expect(h.puddleDepth).toBe(3);
  });

  test('onWaterHit returns null (holes handled by pool absorption)', () => {
    const h = new Hole(3);
    const col = new WaterColumn(0, 5);
    const event = h.onWaterHit(col, 'north');
    expect(event).toBeNull();
  });

  test('applyHits erodes toward zero after threshold', () => {
    const h = new Hole(3);
    const result = h.applyHits(3);
    expect(result).toEqual({ newElevation: -2 });
    expect(h.elevation).toBe(-2);
  });

  test('applyDelta +3 on depth 3 returns FlatGround', () => {
    const h = new Hole(3);
    const result = h.applyDelta(3);
    expect(result.constructor.name).toBe('FlatGround');
  });

  test('applyDelta +5 on depth 3 returns Wall with height 2', () => {
    const h = new Hole(3);
    const result = h.applyDelta(5);
    expect(result.constructor.name).toBe('Wall');
    expect(result.elevation).toBe(2);
  });

  test('applyDelta -2 increases depth', () => {
    const h = new Hole(3);
    const result = h.applyDelta(-2);
    expect(result.elevation).toBe(-5);
    expect(result).toBe(h);
  });

  test('applyDelta clamps to MIN_ELEVATION', () => {
    const h = new Hole(18);
    const result = h.applyDelta(-5);
    expect(result.elevation).toBe(-20);
  });

  test('applyDelta clears excess puddle when depth shrinks', () => {
    const h = new Hole(5);
    h.puddleDepth = 4;
    h.applyDelta(3);
    expect(h.depth).toBe(2);
    expect(h.puddleDepth).toBe(2);
  });

  test('resetHits clears hit count', () => {
    const h = new Hole(3);
    h.applyHits(2);
    h.resetHits();
    expect(h.applyHits(2)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --run src/model/terrain.test.ts`
Expected: FAIL

**Step 3: Implement Hole**

Add to `terrain.ts`:

```ts
export class Hole extends Terrain {
  depth: number;
  puddleDepth: number = 0;
  private hitCount: number = 0;

  constructor(depth: number) {
    super();
    this.depth = Math.min(depth, -MIN_ELEVATION);
  }

  get elevation(): number {
    return -this.depth;
  }

  get effectiveDepth(): number {
    return Math.max(0, this.depth - this.puddleDepth);
  }

  get sprite(): ImageSource | null {
    return null;
  }

  addPuddle(amount: number): void {
    this.puddleDepth = Math.min(this.depth, this.puddleDepth + amount);
  }

  onWaterHit(_column: WaterColumn, _direction: CardinalDirection): WallEvent {
    return null;
  }

  applyHits(count: number): ErosionResult | null {
    this.hitCount += count;
    let eroded = false;
    while (this.hitCount >= 3 && this.depth > 0) {
      this.hitCount -= 3;
      this.depth -= 1;
      eroded = true;
    }
    this.puddleDepth = Math.min(this.puddleDepth, this.depth);
    return eroded ? { newElevation: this.elevation } : null;
  }

  applyDelta(amount: number): Terrain {
    const newElevation = this.elevation + amount;
    if (newElevation >= 0) {
      if (newElevation > 0) {
        return new Wall(Math.min(newElevation, MAX_ELEVATION));
      }
      return new FlatGround();
    }
    this.depth = Math.min(-newElevation, -MIN_ELEVATION);
    this.puddleDepth = Math.min(this.puddleDepth, this.depth);
    return this;
  }

  resetHits(): void {
    this.hitCount = 0;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --run src/model/terrain.test.ts`
Expected: PASS

**Step 5: Run typecheck**

Run: `npm run build`
Expected: PASS

**Step 6: Commit**

```bash
git add src/model/terrain.ts src/model/terrain.test.ts
git commit -m "feat: implement Hole terrain type with puddle and erosion"
```

---

### Task 4: Migrate GridModel to Terrain cells

**Files:**
- Modify: `src/model/grid-model.ts`
- Modify: `src/model/grid-model.test.ts`

This is the largest task. `GridModel` drops `elevations[][]`, `puddleDepths[][]`, `hitCounts[][]` and replaces them with `cells: Terrain[][]`.

**Step 1: Update GridModel internals**

Replace the three parallel arrays with `cells: Terrain[][]`. All existing public methods delegate to the cell's methods. Key changes:

```ts
import { Terrain, FlatGround, Wall, Hole } from './terrain.ts';

export class GridModel {
  readonly width: number;
  readonly height: number;
  readonly castleCol: number;
  readonly castleRow: number;
  private cells: Terrain[][];
  private pools: Pool[] = [];
  private poolMap = new Map<string, Pool>();

  constructor(input: GridModelInput) {
    this.width = input.width;
    this.height = input.height;
    this.castleCol = input.castleCol;
    this.castleRow = input.castleRow;
    this.cells = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => new FlatGround()),
    );
    this.detectPools();
  }

  getCell(col: number, row: number): Terrain {
    if (!this.inBounds(col, row)) {
      return new FlatGround();
    }
    return this.cells[row][col];
  }

  getCells(): Terrain[][] {
    return this.cells;
  }

  getElevation(col: number, row: number): number {
    return this.getCell(col, row).elevation;
  }

  getElevations(): number[][] {
    return this.cells.map(row => row.map(cell => cell.elevation));
  }

  setElevation(col: number, row: number, delta: number): void {
    if (!this.inBounds(col, row)) {
      return;
    }
    this.cells[row][col] = this.cells[row][col].applyDelta(delta);
    this.detectPools();
  }

  getPuddleDepth(col: number, row: number): number {
    const cell = this.getCell(col, row);
    if (cell instanceof Hole) {
      return cell.puddleDepth;
    }
    return 0;
  }

  getPuddleDepths(): number[][] {
    return this.cells.map(row =>
      row.map(cell => (cell instanceof Hole ? cell.puddleDepth : 0)),
    );
  }

  effectiveHoleDepth(col: number, row: number): number {
    const cell = this.getCell(col, row);
    if (cell instanceof Hole) {
      return cell.effectiveDepth;
    }
    return 0;
  }

  getHitCount(col: number, row: number): number {
    const cell = this.getCell(col, row);
    if (cell instanceof Wall) {
      return cell.hitCount;
    }
    return 0;
  }

  resetHitCounts(): void {
    for (const row of this.cells) {
      for (const cell of row) {
        cell.resetHits();
      }
    }
  }

  applyPuddleDeltas(deltas: PuddleDelta[]): void {
    for (const delta of deltas) {
      if (!this.inBounds(delta.col, delta.row)) {
        continue;
      }
      const cell = this.cells[delta.row][delta.col];
      if (cell instanceof Hole) {
        cell.addPuddle(delta.depth);
      }
    }
    this.detectPools();
  }

  applyErosion(advanceMap: number[][], recedeMap: number[][]): ErosionResult[] {
    const results: ErosionResult[] = [];
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        if (this.isCastle(col, row)) {
          continue;
        }
        const cell = this.cells[row][col];
        let hits = 0;
        const elev = cell.elevation;
        if (advanceMap[row]?.[col] > 0 && advanceMap[row][col] - elev >= 2) {
          hits++;
        }
        if (recedeMap[row]?.[col] > 0 && recedeMap[row][col] - elev >= 2) {
          hits++;
        }
        if (hits === 0) {
          continue;
        }
        const result = cell.applyHits(hits);
        if (result) {
          results.push({ col, row, newElevation: result.newElevation });
          if (cell.elevation === 0) {
            this.cells[row][col] = new FlatGround();
          }
        }
      }
    }
    return results;
  }

  applySandRedistribution(events: WallErosionEvent[][]): void {
    for (let row = 0; row < events.length; row++) {
      for (let col = 0; col < events[row].length; col++) {
        if (events[row][col] === null) {
          continue;
        }
        if (this.isCastle(col, row) || !this.inBounds(col, row)) {
          continue;
        }
        this.cells[row][col] = this.cells[row][col].applyDelta(-1);

        const upRow = row - 1;
        if (
          !this.inBounds(col, upRow) ||
          this.isCastle(col, upRow) ||
          !(this.cells[upRow][col] instanceof Hole)
        ) {
          continue;
        }
        this.cells[upRow][col] = this.cells[upRow][col].applyDelta(+1);
      }
    }
  }

  detectPools(): void {
    this.pools = [];
    this.poolMap.clear();
    const visited = new Set<string>();
    let nextId = 0;

    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        if (!(this.cells[row][col] instanceof Hole)) {
          continue;
        }
        const key = `${col}:${row}`;
        if (visited.has(key)) {
          continue;
        }

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
            if (visited.has(nk) || !this.inBounds(nc, nr)) {
              continue;
            }
            if (!(this.cells[nr][nc] instanceof Hole)) {
              continue;
            }
            visited.add(nk);
            queue.push({ col: nc, row: nr });
          }
        }
        this.pools.push(pool);
      }
    }
  }

  reset(): void {
    this.cells = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => new FlatGround()),
    );
    this.pools = [];
    this.poolMap.clear();
    this.detectPools();
  }
}
```

**Step 2: Update existing GridModel tests**

The existing tests in `grid-model.test.ts` should continue to pass since the public API (`getElevation`, `setElevation`, `applyErosion`, etc.) stays the same. Update any tests that directly reference internal state. Add new tests for `getCell` and `getCells`.

**Step 3: Run tests**

Run: `npm run test:unit -- --run src/model/grid-model.test.ts`
Expected: PASS (all existing tests still green)

**Step 4: Run typecheck**

Run: `npm run build`
Expected: May have type errors in consumers -- note them but don't fix yet (Tasks 5-7 handle that).

**Step 5: Commit**

```bash
git add src/model/grid-model.ts src/model/grid-model.test.ts
git commit -m "refactor: migrate GridModel from parallel arrays to Terrain cells"
```

---

### Task 5: Migrate wave simulation to use Terrain cells

**Files:**
- Modify: `src/model/flow-field.ts`
- Modify: `src/model/flow-field.test.ts`
- Modify: `src/model/wave-simulation.ts`

The simulation inputs change from `elevations: number[][]` + `effectiveHoleDepths: number[][]` to `cells: Terrain[][]`. The row loop calls `cell.onWaterHit(column, direction)` instead of `column.applyTerrain(effectiveElev)`.

**Step 1: Update AdvanceInput/RecedeInput interfaces**

Replace `elevations` and `effectiveHoleDepths` with `cells: Terrain[][]` in `AdvanceInput`, `RecedeInput`, and `SimulateWaveInput`. Keep `terrainSlope` since it's a global modifier.

**Step 2: Update simulateAdvance**

Key changes in the row loop:
- `cell.onWaterHit(column, 'north')` replaces the `applyTerrain` + manual blocked/blockedWater tracking
- Wall blocking: check if cell is a `Wall` and the event is `'blocked'` to populate `blocked[]`/`blockedWater[]` for redistribution
- Pool absorption: read `effectiveDepth` from `Hole` cells instead of the `effectiveHoleDepths` array
- `absorbIntoPoolGroups` still operates on projected arrays extracted from the cells for that row

```ts
for (let col = 0; col < numCols; col++) {
  const cell = cells[row][col];
  if (columns[col].isEmpty()) {
    continue;
  }

  const savedDepth = columns[col].depth;
  const event = cell.onWaterHit(columns[col], 'north');
  wallEvents[row][col] = event;

  if (event === 'blocked' && cell instanceof Wall) {
    blocked[col] = true;
    blockedWater[col] = savedDepth;
  } else if (event !== null && cell.elevation <= 0) {
    wallEvents[row][col] = null;
  }
}
```

**Step 3: Update simulateRecede**

Same pattern but with `'south'` direction and iterating bottom-to-top.

**Step 4: Update simulateWave**

Extract `elevations` and `effectiveHoleDepths` from `cells` for any remaining array-based operations, or pass `cells` through to advance/recede.

**Step 5: Update flow-field tests**

The test helpers `flatElevations(rows, cols)` and `zeroHoleDepths(rows, cols)` need to become terrain-cell-based helpers:

```ts
function flatCells(rows: number, cols: number): Terrain[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => new FlatGround()),
  );
}
```

Tests that set specific elevations will create `Wall` or `Hole` cells directly.

**Step 6: Run tests**

Run: `npm run test:unit -- --run src/model/flow-field.test.ts`
Expected: PASS

Run: `npm run test:unit -- --run src/model/wave-simulation.test.ts`
Expected: PASS

**Step 7: Run typecheck**

Run: `npm run build`
Expected: PASS or known errors in view layer (Task 6)

**Step 8: Commit**

```bash
git add src/model/flow-field.ts src/model/flow-field.test.ts src/model/wave-simulation.ts
git commit -m "refactor: wave simulation takes Terrain cells directly"
```

---

### Task 6: Update view layer for Terrain model

**Files:**
- Modify: `src/view/tile.ts`
- Modify: `src/view/grid-view.ts`
- Modify: `src/view/single-cell-digging.ts`

**Step 1: Update tile.ts**

Remove `WALL_TIERS` array. Replace the elevation-based sprite selection with `cell.sprite`:

```ts
// In updateVisual or a new method:
const sprite = terrain.sprite;
if (sprite) {
  // render the sprite
} else if (terrain instanceof Hole) {
  // render hole with puddle (existing hole rendering logic)
} else {
  // flat ground (existing transparent rect)
}
```

The `Tile` class should accept a `Terrain` reference instead of separate `elevation`/`puddleDepth`/`waveHitCount` properties.

**Step 2: Update grid-view.ts**

`refreshTileVisual` passes the `Terrain` cell to the tile instead of individual properties:

```ts
refreshTileVisual(col: number, row: number): void {
  const tile = this.getTile(col, row);
  if (!tile) {
    return;
  }
  tile.terrain = this.model.getCell(col, row);
  const neighbors = this.model.getPoolNeighbors(col, row);
  tile.updateVisual(neighbors ?? undefined);
}
```

**Step 3: Update single-cell-digging.ts**

No significant changes needed -- it already calls `grid.setElevation(col, row, delta)` which now delegates to `applyDelta` internally. Verify hover highlight logic still works (it checks elevation for wall-buildable state).

**Step 4: Run typecheck**

Run: `npm run build`
Expected: PASS

**Step 5: Manual verification**

Start the dev server and verify:
- Flat ground renders correctly
- Digging creates visible holes with correct coloring
- Building walls shows correct tier sprites
- Puddles display in holes after waves
- Wall erosion visuals (flash) still work

**Step 6: Commit**

```bash
git add src/view/tile.ts src/view/grid-view.ts src/view/single-cell-digging.ts
git commit -m "refactor: view layer reads from Terrain cells instead of raw elevation"
```

---

### Task 7: Update session files and clean up dead code

**Files:**
- Modify: `src/game-session.ts`
- Modify: `src/tide-session.ts`
- Modify: `src/model/wave-simulation.ts` (if needed)
- Delete or modify: `src/model/water-column.ts` (remove `applyTerrain` if no longer called)
- Modify: `src/view/wave-renderer.ts` (if needed)

**Step 1: Update game-session.ts and tide-session.ts**

The erosion and sand redistribution calls should still work since `GridView` delegates to `GridModel`. Verify the wave simulation input construction passes `cells` instead of `elevations`/`holeDepths`.

The call sites in both sessions that build `SimulateWaveInput` need updating:

```ts
// Before:
const result = simulateWave({
  elevations: this.grid.model.getElevations(),
  puddleDepths: this.grid.model.getPuddleDepths(),
  ...
});

// After:
const result = simulateWave({
  cells: this.grid.model.getCells(),
  ...
});
```

**Step 2: Clean up WaterColumn**

`WaterColumn.applyTerrain` is no longer called by the simulation (it's replaced by `Terrain.onWaterHit`). Remove it. Update `water-column.test.ts` to remove those tests.

Note: `WaterColumn` itself still exists -- it's the water state passed to `onWaterHit`. Only the `applyTerrain` method moves.

**Step 3: Remove WallEvent from flow-field.ts**

`WallEvent` type and `WallErosionEvent` re-export should now come from `terrain.ts`. Update imports across the codebase.

**Step 4: Run all tests**

Run: `npm run test:unit`
Expected: PASS

**Step 5: Run typecheck**

Run: `npm run build`
Expected: PASS

**Step 6: Manual verification**

Play through a full game session:
- Planning phase: dig holes, build walls
- Wave phase: water advances, walls block/overtop, holes absorb
- Erosion: walls degrade over multiple waves
- Sand redistribution: walls lose elevation after hits
- Level progression works
- Tide mode works

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: clean up dead code from terrain migration"
```

---

### Task 8: Final verification and docs

**Files:**
- Modify: `AGENTS.md` (update architecture section)
- Modify: `docs/gameplay.md` (if terrain types are documented there)

**Step 1: Run full test suite**

Run: `npm test`
Expected: All unit tests and visual regression tests pass.

**Step 2: Update AGENTS.md architecture section**

Update the "Model layer" section to document the new terrain model:

```markdown
### Model layer (`src/model/`)

- **`terrain.ts`** - Terrain base class and subclasses (FlatGround, Hole, Wall). Each type owns its elevation, sprite, water interaction, erosion, and mutation behavior
- **`grid-model.ts`** - Grid state: Terrain cells, pool detection, sand redistribution, projection helpers
- **`flow-field.ts`** - Flow field computation for wave spread, takes Terrain cells directly
- **`wave-simulation.ts`** - Column-by-column wave height simulation with terrain interaction
- **`water-column.ts`** - Water column state passed to Terrain.onWaterHit()
```

**Step 3: Commit**

```bash
git add AGENTS.md docs/gameplay.md
git commit -m "docs: update architecture for terrain model refactor"
```
