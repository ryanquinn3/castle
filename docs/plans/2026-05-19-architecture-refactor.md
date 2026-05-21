# Architecture Refactor: Layer Separation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate the codebase into simulation (pure data), rendering (Excalibur), and orchestration layers so wave physics, visual treatment, and game mode can each evolve independently.

**Architecture:** Three layers with clear import boundaries. `src/model/` has zero Excalibur imports and owns all game state (grid elevations, puddles, pools, wave simulation, flow physics). `src/view/` owns all Excalibur actors and rendering (tile visuals, wave overlays, planning HUD, screen overlays). `src/modes/` defines a `GameMode` interface for progression strategy, with `LevelMode` implementing today's discrete-level behavior. `game-session.ts` is a thin Excalibur Scene that wires the layers together.

**Tech Stack:** TypeScript, Excalibur.js 0.32, Vitest (unit), Playwright (visual regression)

---

## Task 1: Extract GridModel from TileGrid

Extract pure-data grid logic into `src/model/grid-model.ts`. No Excalibur imports. This is the foundation every other task builds on.

**Files:**
- Create: `src/model/grid-model.ts`
- Create: `src/model/grid-model.test.ts`
- Modify: `src/grid.ts` (will delegate to GridModel in Task 2)

**Step 1: Write failing tests for GridModel**

Create `src/model/grid-model.test.ts`. These tests cover the data logic currently in `TileGrid` but without any Excalibur Scene stub.

```ts
import { describe, expect, test } from 'vitest';
import { GridModel } from './grid-model';
import { GRID_WIDTH, GRID_HEIGHT, CASTLE_COL, CASTLE_ROW } from '../config';

describe('GridModel', () => {
  function makeModel(): GridModel {
    return new GridModel({
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      castleCol: CASTLE_COL,
      castleRow: CASTLE_ROW,
    });
  }

  test('initializes all elevations to 0', () => {
    const model = makeModel();
    const elevations = model.getElevations();
    for (const row of elevations) {
      for (const val of row) {
        expect(val).toBe(0);
      }
    }
  });

  test('getElevation returns 0 for in-bounds tile', () => {
    const model = makeModel();
    expect(model.getElevation(0, 0)).toBe(0);
  });

  test('getElevation returns 0 for out-of-bounds tile', () => {
    const model = makeModel();
    expect(model.getElevation(-1, 0)).toBe(0);
    expect(model.getElevation(GRID_WIDTH, 0)).toBe(0);
  });

  test('setElevation changes elevation and clamps to bounds', () => {
    const model = makeModel();
    model.setElevation(0, 0, -3);
    expect(model.getElevation(0, 0)).toBe(-3);
    model.setElevation(0, 0, +5);
    expect(model.getElevation(0, 0)).toBe(2);
  });

  test('setElevation clears puddle when elevation becomes non-negative', () => {
    const model = makeModel();
    model.setElevation(2, 2, -4);
    model.applyPuddleDeltas([{ col: 2, row: 2, depth: 2 }]);
    expect(model.getPuddleDepth(2, 2)).toBe(2);
    model.setElevation(2, 2, +4);
    expect(model.getPuddleDepth(2, 2)).toBe(0);
  });

  test('applyPuddleDeltas accumulates and clamps to -elevation', () => {
    const model = makeModel();
    model.setElevation(0, 0, -3);
    model.applyPuddleDeltas([{ col: 0, row: 0, depth: 2 }]);
    expect(model.getPuddleDepth(0, 0)).toBe(2);
    model.applyPuddleDeltas([{ col: 0, row: 0, depth: 5 }]);
    expect(model.getPuddleDepth(0, 0)).toBe(3);
  });

  test('applyPuddleDeltas ignores non-negative elevation tiles', () => {
    const model = makeModel();
    model.applyPuddleDeltas([{ col: 1, row: 1, depth: 2 }]);
    expect(model.getPuddleDepth(1, 1)).toBe(0);
  });

  test('effectiveHoleDepth returns hole minus puddle', () => {
    const model = makeModel();
    model.setElevation(2, 2, -4);
    model.applyPuddleDeltas([{ col: 2, row: 2, depth: 1 }]);
    expect(model.effectiveHoleDepth(2, 2)).toBe(3);
  });

  test('effectiveHoleDepth returns 0 for non-negative elevation', () => {
    const model = makeModel();
    expect(model.effectiveHoleDepth(0, 0)).toBe(0);
    model.setElevation(0, 0, +3);
    expect(model.effectiveHoleDepth(0, 0)).toBe(0);
  });

  test('detectPools groups adjacent negative-elevation tiles', () => {
    const model = makeModel();
    model.setElevation(0, 0, -2);
    model.setElevation(1, 0, -2);
    model.setElevation(3, 0, -2);
    const pools = model.getPools();
    expect(pools.length).toBe(2);
    const pool0 = model.getPool(0, 0);
    expect(pool0).toBeDefined();
    expect(pool0).toBe(model.getPool(1, 0));
    expect(pool0).not.toBe(model.getPool(3, 0));
  });

  test('resetHitCounts zeroes all hit counts', () => {
    const model = makeModel();
    model.getHitCount(0, 0);
    model.incrementHitCount(0, 0, 2);
    expect(model.getHitCount(0, 0)).toBe(2);
    model.resetHitCounts();
    expect(model.getHitCount(0, 0)).toBe(0);
  });

  test('applyErosion erodes walls/holes hit 3+ times', () => {
    const model = makeModel();
    model.setElevation(0, 0, +3);
    const advanceMap = Array.from({ length: GRID_HEIGHT }, () => new Array(GRID_WIDTH).fill(0));
    const recedeMap = Array.from({ length: GRID_HEIGHT }, () => new Array(GRID_WIDTH).fill(0));
    advanceMap[0][0] = 6;
    recedeMap[0][0] = 6;
    const result = model.applyErosion(advanceMap, recedeMap);
    expect(result.length).toBe(0);
    // Hit count is now 2, need one more
    advanceMap[0][0] = 6;
    const result2 = model.applyErosion(advanceMap, recedeMap);
    // 2 + 2 = 4, triggers erosion (4 >= 3)
    expect(result2.length).toBeGreaterThan(0);
  });

  test('applySandRedistribution lowers wall by 1 and raises upstream hole', () => {
    const model = makeModel();
    model.setElevation(5, 5, +3);
    model.setElevation(5, 4, -2);
    const events = Array.from({ length: GRID_HEIGHT }, () =>
      new Array<import('../wave').WallErosionEvent>(GRID_WIDTH).fill(null),
    );
    events[5][5] = 'overtopped';
    model.applySandRedistribution(events);
    expect(model.getElevation(5, 5)).toBe(2);
    expect(model.getElevation(5, 4)).toBe(-1);
  });

  test('reset restores all tiles to initial state', () => {
    const model = makeModel();
    model.setElevation(0, 0, -5);
    model.applyPuddleDeltas([{ col: 0, row: 0, depth: 2 }]);
    model.reset();
    expect(model.getElevation(0, 0)).toBe(0);
    expect(model.getPuddleDepth(0, 0)).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/model/grid-model.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement GridModel**

Create `src/model/grid-model.ts`. Extract all data logic from `src/grid.ts` (TileGrid), removing all Excalibur dependencies.

```ts
import type { WallErosionEvent } from '../wave';

export interface GridModelInput {
  width: number;
  height: number;
  castleCol: number;
  castleRow: number;
}

export interface PuddleDelta {
  col: number;
  row: number;
  depth: number;
}

export interface Pool {
  id: number;
  members: { col: number; row: number }[];
}

export interface ErosionResult {
  col: number;
  row: number;
  newElevation: number;
}

export interface PoolNeighbors {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export class GridModel {
  readonly width: number;
  readonly height: number;
  readonly castleCol: number;
  readonly castleRow: number;

  private elevations: number[][];
  private puddles: number[][];
  private hitCounts: number[][];
  private pools: Pool[] = [];
  private poolMap = new Map<string, Pool>();

  private maxElev = 10;
  private minElev = -10;

  constructor(input: GridModelInput) {
    this.width = input.width;
    this.height = input.height;
    this.castleCol = input.castleCol;
    this.castleRow = input.castleRow;
    this.elevations = Array.from({ length: this.height }, () => new Array(this.width).fill(0));
    this.puddles = Array.from({ length: this.height }, () => new Array(this.width).fill(0));
    this.hitCounts = Array.from({ length: this.height }, () => new Array(this.width).fill(0));
  }

  setElevationBounds(min: number, max: number): void {
    this.minElev = min;
    this.maxElev = max;
  }

  private inBounds(col: number, row: number): boolean {
    return row >= 0 && row < this.height && col >= 0 && col < this.width;
  }

  isCastle(col: number, row: number): boolean {
    return col === this.castleCol && row === this.castleRow;
  }

  getElevation(col: number, row: number): number {
    if (!this.inBounds(col, row)) {
      return 0;
    }
    return this.elevations[row][col];
  }

  getElevations(): number[][] {
    return this.elevations.map(row => row.slice());
  }

  setElevation(col: number, row: number, delta: number): void {
    if (!this.inBounds(col, row)) {
      return;
    }
    this.elevations[row][col] = Math.max(this.minElev, Math.min(this.maxElev, this.elevations[row][col] + delta));
    if (this.elevations[row][col] >= 0) {
      this.puddles[row][col] = 0;
    } else {
      this.puddles[row][col] = Math.min(this.puddles[row][col], -this.elevations[row][col]);
    }
    this.detectPools();
  }

  getPuddleDepth(col: number, row: number): number {
    if (!this.inBounds(col, row)) {
      return 0;
    }
    return this.puddles[row][col];
  }

  effectiveHoleDepth(col: number, row: number): number {
    if (!this.inBounds(col, row)) {
      return 0;
    }
    const e = this.elevations[row][col];
    if (e >= 0) {
      return 0;
    }
    return Math.max(0, (-e) - this.puddles[row][col]);
  }

  applyPuddleDeltas(deltas: PuddleDelta[]): void {
    for (const delta of deltas) {
      if (!this.inBounds(delta.col, delta.row)) {
        continue;
      }
      if (this.elevations[delta.row][delta.col] >= 0) {
        continue;
      }
      const maxDepth = -this.elevations[delta.row][delta.col];
      this.puddles[delta.row][delta.col] = Math.min(maxDepth, this.puddles[delta.row][delta.col] + delta.depth);
    }
    this.detectPools();
  }

  getHitCount(col: number, row: number): number {
    if (!this.inBounds(col, row)) {
      return 0;
    }
    return this.hitCounts[row][col];
  }

  incrementHitCount(col: number, row: number, amount: number): void {
    if (!this.inBounds(col, row)) {
      return;
    }
    this.hitCounts[row][col] += amount;
  }

  resetHitCounts(): void {
    for (const row of this.hitCounts) {
      row.fill(0);
    }
  }

  applyErosion(advanceMap: number[][], recedeMap: number[][]): ErosionResult[] {
    const results: ErosionResult[] = [];
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        if (this.isCastle(col, row)) {
          continue;
        }
        let hits = 0;
        if (advanceMap[row][col] > 0 && advanceMap[row][col] - this.elevations[row][col] >= 2) {
          hits++;
        }
        if (recedeMap[row][col] > 0 && recedeMap[row][col] - this.elevations[row][col] >= 2) {
          hits++;
        }
        if (hits === 0) {
          continue;
        }
        this.hitCounts[row][col] += hits;
        while (this.hitCounts[row][col] >= 3) {
          if (this.elevations[row][col] > 0) {
            this.setElevation(col, row, -1);
            results.push({ col, row, newElevation: this.elevations[row][col] });
          } else if (this.elevations[row][col] < 0) {
            this.setElevation(col, row, +1);
            results.push({ col, row, newElevation: this.elevations[row][col] });
          } else {
            break;
          }
          this.hitCounts[row][col] -= 3;
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
        if (this.isCastle(col, row)) {
          continue;
        }
        this.setElevation(col, row, -1);
        if (row > 0 && !this.isCastle(col, row - 1) && this.getElevation(col, row - 1) < 0) {
          this.setElevation(col, row - 1, +1);
        }
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
        if (this.elevations[row][col] >= 0) {
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
            if (visited.has(nk)) {
              continue;
            }
            if (!this.inBounds(nc, nr) || this.elevations[nr][nc] >= 0) {
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

  getPool(col: number, row: number): Pool | undefined {
    return this.poolMap.get(`${col}:${row}`);
  }

  getPools(): Pool[] {
    return this.pools;
  }

  getPoolMap(): Map<string, Pool> {
    return this.poolMap;
  }

  getPoolNeighbors(col: number, row: number): PoolNeighbors | undefined {
    const pool = this.getPool(col, row);
    if (!pool) {
      return undefined;
    }
    return {
      top: this.getPool(col, row - 1) === pool,
      bottom: this.getPool(col, row + 1) === pool,
      left: this.getPool(col - 1, row) === pool,
      right: this.getPool(col + 1, row) === pool,
    };
  }

  reset(): void {
    for (const row of this.elevations) { row.fill(0); }
    for (const row of this.puddles) { row.fill(0); }
    for (const row of this.hitCounts) { row.fill(0); }
    this.pools = [];
    this.poolMap.clear();
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/model/grid-model.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm run test:unit`
Expected: PASS (no existing tests broken)

**Step 6: Commit**

```bash
git add src/model/grid-model.ts src/model/grid-model.test.ts
git commit -m "feat: extract GridModel as pure-data grid (no Excalibur)"
```

---

## Task 2: Wire TileGrid to delegate to GridModel

Make `TileGrid` (now effectively GridView) delegate all data operations to `GridModel`. TileGrid becomes a rendering adapter that creates/manages Excalibur actors and reads state from the model.

**Files:**
- Modify: `src/grid.ts`
- Modify: `src/grid.test.ts`

**Step 1: Update TileGrid to accept and delegate to GridModel**

Modify `src/grid.ts`:
- Constructor takes `GridModel` and `Scene` instead of just `Scene`
- All data methods (`getElevation`, `setElevation`, `applyErosion`, etc.) delegate to `this.model`
- Keep Excalibur-specific methods: tile actor creation, pool visual refresh
- Expose `model` as a public readonly field so the orchestrator can pass it to simulation functions

```ts
import { Scene } from 'excalibur';
import { Tile } from './tile';
import { GRID_WIDTH, GRID_HEIGHT } from './config';
import { GridModel } from './model/grid-model';
import type { WallErosionEvent } from './wave';
import type { PuddleDelta, ErosionResult } from './model/grid-model';

export { type PuddleDelta, type ErosionResult } from './model/grid-model';

export class TileGrid {
  readonly model: GridModel;
  private tiles: Tile[][];

  constructor(model: GridModel, scene: Scene) {
    this.model = model;
    this.tiles = [];
    for (let row = 0; row < model.height; row++) {
      this.tiles[row] = [];
      for (let col = 0; col < model.width; col++) {
        const tile = new Tile(col, row, model.isCastle(col, row));
        this.tiles[row][col] = tile;
        scene.add(tile);
      }
    }
    this.refreshAllVisuals();
  }

  getTile(col: number, row: number): Tile | undefined {
    if (row < 0 || row >= this.model.height || col < 0 || col >= this.model.width) {
      return undefined;
    }
    return this.tiles[row][col];
  }

  getElevation(col: number, row: number): number {
    return this.model.getElevation(col, row);
  }

  getPuddleDepth(col: number, row: number): number {
    return this.model.getPuddleDepth(col, row);
  }

  effectiveHoleDepth(col: number, row: number): number {
    return this.model.effectiveHoleDepth(col, row);
  }

  getElevations(): number[][] {
    return this.model.getElevations();
  }

  setElevation(col: number, row: number, delta: number): void {
    this.model.setElevation(col, row, delta);
    const tile = this.getTile(col, row);
    if (tile) {
      this.refreshTileVisual(col, row);
    }
  }

  applyPuddleDeltas(deltas: PuddleDelta[]): void {
    this.model.applyPuddleDeltas(deltas);
    for (const delta of deltas) {
      this.refreshTileVisual(delta.col, delta.row);
    }
    this.refreshPoolVisuals();
  }

  applyErosion(advanceMap: number[][], recedeMap: number[][]): ErosionResult[] {
    const results = this.model.applyErosion(advanceMap, recedeMap);
    for (const r of results) {
      this.refreshTileVisual(r.col, r.row);
    }
    return results;
  }

  applySandRedistribution(events: WallErosionEvent[][]): void {
    this.model.applySandRedistribution(events);
    this.refreshAllVisuals();
  }

  resetHitCounts(): void {
    this.model.resetHitCounts();
  }

  getPoolMap(): Map<string, import('./model/grid-model').Pool> {
    return this.model.getPoolMap();
  }

  set level(level: number) {
    // No-op for now; elevation bounds managed externally via model.setElevationBounds
  }

  refreshTileVisual(col: number, row: number): void {
    const tile = this.getTile(col, row);
    if (!tile) {
      return;
    }
    tile.elevation = this.model.getElevation(col, row);
    tile.puddleDepth = this.model.getPuddleDepth(col, row);
    tile.waveHitCount = this.model.getHitCount(col, row);
    const neighbors = this.model.getPoolNeighbors(col, row);
    tile.updateVisual(neighbors ?? undefined);
  }

  refreshAllVisuals(): void {
    for (let row = 0; row < this.model.height; row++) {
      for (let col = 0; col < this.model.width; col++) {
        this.refreshTileVisual(col, row);
      }
    }
  }

  refreshPoolVisuals(): void {
    for (const pool of this.model.getPools()) {
      for (const { col, row } of pool.members) {
        this.refreshTileVisual(col, row);
      }
    }
  }
}
```

**Step 2: Update grid.test.ts to construct GridModel + TileGrid**

Modify `src/grid.test.ts` to create a `GridModel` first, then pass it to `TileGrid`. The test assertions stay the same; only construction changes.

Replace the fixture:

```ts
import { GridModel } from './model/grid-model';
import { GRID_WIDTH, GRID_HEIGHT, CASTLE_COL, CASTLE_ROW } from './config';

function makeScene(): Scene {
  return { add: () => {} } as unknown as Scene;
}

function makeModel(): GridModel {
  return new GridModel({ width: GRID_WIDTH, height: GRID_HEIGHT, castleCol: CASTLE_COL, castleRow: CASTLE_ROW });
}

const test = baseTest.extend<{ grid: TileGrid }>({
  grid: async ({}, use) => {
    await use(new TileGrid(makeModel(), makeScene()));
  },
});
```

**Step 3: Run all unit tests**

Run: `npm run test:unit`
Expected: PASS

**Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (or address type errors if any files import from grid.ts and the API changed)

**Step 5: Commit**

```bash
git add src/grid.ts src/grid.test.ts
git commit -m "refactor: TileGrid delegates data ops to GridModel"
```

---

## Task 3: Extract GameMode interface + LevelMode

Move level-progression logic out of `level.ts` and `config.ts`/`wave.ts` into a `GameMode` interface with a `LevelMode` implementation.

**Files:**
- Create: `src/modes/game-mode.ts`
- Create: `src/modes/level-mode.ts`
- Create: `src/modes/level-mode.test.ts`
- Modify: `src/wave.ts` (remove `waveHeightForLevel`, `wavesForLevel`)
- Modify: `src/wave.test.ts` (move level-progression tests to level-mode.test.ts)
- Modify: `src/config.ts` (remove level-specific functions `maxElevationForLevel`, `minElevationForLevel`)

**Step 1: Write failing tests for LevelMode**

Create `src/modes/level-mode.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { LevelMode } from './level-mode';
import { WAVE_HEIGHT_START, WAVE_HEIGHT_INCREMENT, WAVES_BASE, WAVES_INCREMENT, SCOOP_START, SCOOP_INCREMENT, MAX_ELEVATION, MIN_ELEVATION, ENHANCED_SHOVEL_WAVES_REQUIRED } from '../config';

describe('LevelMode', () => {
  function makeMode(): LevelMode {
    return new LevelMode();
  }

  test('waveHeight returns WAVE_HEIGHT_START on level 1', () => {
    const mode = makeMode();
    const params = mode.nextWaveParams({ level: 1, wavesCompleted: 0, consecutiveCleanWaves: 0, hasEnhancedShovel: false });
    expect(params.peakHeight).toBe(WAVE_HEIGHT_START);
  });

  test('waveHeight increases every other level', () => {
    const mode = makeMode();
    const params = mode.nextWaveParams({ level: 3, wavesCompleted: 0, consecutiveCleanWaves: 0, hasEnhancedShovel: false });
    expect(params.peakHeight).toBe(WAVE_HEIGHT_START + Math.floor(3 / 2) * WAVE_HEIGHT_INCREMENT);
  });

  test('waveCount returns WAVES_BASE on level 1', () => {
    const mode = makeMode();
    const params = mode.nextWaveParams({ level: 1, wavesCompleted: 0, consecutiveCleanWaves: 0, hasEnhancedShovel: false });
    expect(params.waveCount).toBe(WAVES_BASE);
  });

  test('waveCount increases every other level', () => {
    const mode = makeMode();
    const params = mode.nextWaveParams({ level: 4, wavesCompleted: 0, consecutiveCleanWaves: 0, hasEnhancedShovel: false });
    expect(params.waveCount).toBe(WAVES_BASE + Math.floor(3 / 2) * WAVES_INCREMENT);
  });

  test('scoopBudget scales with level', () => {
    const mode = makeMode();
    expect(mode.scoopBudget({ level: 1, wavesCompleted: 0, consecutiveCleanWaves: 0, hasEnhancedShovel: false })).toBe(SCOOP_START);
    expect(mode.scoopBudget({ level: 3, wavesCompleted: 0, consecutiveCleanWaves: 0, hasEnhancedShovel: false })).toBe(SCOOP_START + 2 * SCOOP_INCREMENT);
  });

  test('elevationBounds return defaults for early levels', () => {
    const mode = makeMode();
    const bounds = mode.elevationBounds(1);
    expect(bounds.min).toBe(MIN_ELEVATION);
    expect(bounds.max).toBe(MAX_ELEVATION);
  });

  test('elevationBounds expand at higher levels', () => {
    const mode = makeMode();
    const bounds10 = mode.elevationBounds(10);
    expect(bounds10.max).toBe(15);
    expect(bounds10.min).toBe(-15);
    const bounds20 = mode.elevationBounds(20);
    expect(bounds20.max).toBe(20);
    expect(bounds20.min).toBe(-20);
  });

  test('resolveWave returns plan after non-flooding wave', () => {
    const mode = makeMode();
    const result = mode.resolveWave(
      { level: 1, wavesCompleted: 1, consecutiveCleanWaves: 0, hasEnhancedShovel: false },
      { castleFlooded: false, allWavesComplete: true },
    );
    expect(result).toEqual({ type: 'advance' });
  });

  test('resolveWave returns gameover on castle flood', () => {
    const mode = makeMode();
    const result = mode.resolveWave(
      { level: 1, wavesCompleted: 0, consecutiveCleanWaves: 0, hasEnhancedShovel: false },
      { castleFlooded: true, allWavesComplete: false },
    );
    expect(result).toEqual({ type: 'gameover' });
  });

  test('checkCleanWaveReward grants enhanced shovel after enough clean waves', () => {
    const mode = makeMode();
    const state = { level: 1, wavesCompleted: 0, consecutiveCleanWaves: ENHANCED_SHOVEL_WAVES_REQUIRED - 1, hasEnhancedShovel: false };
    expect(mode.checkCleanWaveReward(state, true)).toBe(true);
    expect(mode.checkCleanWaveReward(state, false)).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modes/level-mode.test.ts`
Expected: FAIL

**Step 3: Create GameMode interface**

Create `src/modes/game-mode.ts`:

```ts
export interface GameState {
  level: number;
  wavesCompleted: number;
  consecutiveCleanWaves: number;
  hasEnhancedShovel: boolean;
}

export interface WaveParams {
  peakHeight: number;
  waveCount: number;
}

export interface WaveOutcome {
  castleFlooded: boolean;
  allWavesComplete: boolean;
}

export type PhaseTransition =
  | { type: 'plan' }
  | { type: 'advance' }
  | { type: 'gameover' };

export interface GameMode {
  nextWaveParams(state: GameState): WaveParams;
  scoopBudget(state: GameState): number;
  elevationBounds(level: number): { min: number; max: number };
  resolveWave(state: GameState, outcome: WaveOutcome): PhaseTransition;
  checkCleanWaveReward(state: GameState, isClean: boolean): boolean;
}
```

**Step 4: Implement LevelMode**

Create `src/modes/level-mode.ts`:

```ts
import type { GameMode, GameState, WaveParams, WaveOutcome, PhaseTransition } from './game-mode';
import {
  WAVE_HEIGHT_START, WAVE_HEIGHT_INCREMENT,
  WAVES_BASE, WAVES_INCREMENT,
  SCOOP_START, SCOOP_INCREMENT,
  MAX_ELEVATION, MIN_ELEVATION,
  ENHANCED_SHOVEL_WAVES_REQUIRED,
} from '../config';

export class LevelMode implements GameMode {
  nextWaveParams(state: GameState): WaveParams {
    const heightBumps = Math.floor(state.level / 2);
    const waveBumps = Math.floor((state.level - 1) / 2);
    return {
      peakHeight: WAVE_HEIGHT_START + heightBumps * WAVE_HEIGHT_INCREMENT,
      waveCount: WAVES_BASE + waveBumps * WAVES_INCREMENT,
    };
  }

  scoopBudget(state: GameState): number {
    return SCOOP_START + (state.level - 1) * SCOOP_INCREMENT;
  }

  elevationBounds(level: number): { min: number; max: number } {
    if (level >= 20) {
      return { min: -20, max: 20 };
    }
    if (level >= 10) {
      return { min: -15, max: 15 };
    }
    return { min: MIN_ELEVATION, max: MAX_ELEVATION };
  }

  resolveWave(state: GameState, outcome: WaveOutcome): PhaseTransition {
    if (outcome.castleFlooded) {
      return { type: 'gameover' };
    }
    if (outcome.allWavesComplete) {
      return { type: 'advance' };
    }
    return { type: 'plan' };
  }

  checkCleanWaveReward(state: GameState, isClean: boolean): boolean {
    if (state.hasEnhancedShovel) {
      return false;
    }
    if (!isClean) {
      return false;
    }
    return state.consecutiveCleanWaves + 1 >= ENHANCED_SHOVEL_WAVES_REQUIRED;
  }
}
```

**Step 5: Run tests**

Run: `npx vitest run src/modes/level-mode.test.ts`
Expected: PASS

**Step 6: Remove level-specific functions from wave.ts and config.ts**

Remove `waveHeightForLevel` and `wavesForLevel` from `src/wave.ts`.
Remove `maxElevationForLevel` and `minElevationForLevel` from `src/config.ts`.

Update `src/wave.test.ts`: remove the `waveHeightForLevel` and `wavesForLevel` describe blocks (those tests are now in `level-mode.test.ts`).

Update any imports in `src/level.ts` that reference these functions. For now, `level.ts` can import from `LevelMode` directly. (Task 6 will fully rewire `level.ts` into `game-session.ts`.)

**Step 7: Run full test suite + typecheck**

Run: `npm run test:unit && npx tsc --noEmit`
Expected: PASS

**Step 8: Commit**

```bash
git add src/modes/ src/wave.ts src/wave.test.ts src/config.ts src/level.ts
git commit -m "feat: extract GameMode interface and LevelMode from level/wave logic"
```

---

## Task 4: Split WaveAnimator into simulation invocation + WaveRenderer

Move simulation invocation out of `WaveAnimator`. Rename it to `WaveRenderer` and move to `src/view/`. It receives pre-computed `WaveResult` and only handles visuals.

**Files:**
- Create: `src/view/wave-renderer.ts` (rendering-only, extracted from `src/wave-animator.ts`)
- Delete: `src/wave-animator.ts`
- Modify: `src/level.ts` (temporarily wire new WaveRenderer; Task 6 will move this to GameSession)

**Step 1: Create WaveRenderer**

Create `src/view/wave-renderer.ts`. This is `WaveAnimator` with `animate()` split into two parts:
1. `playWave(result: WaveResult)` - takes pre-computed result, plays the animation
2. The wave curve generation + `simulateWave()` call moves to the caller (level.ts for now, GameSession later)

```ts
import { Scene, Actor, Color, Rectangle, Vector, Text, Font } from 'excalibur';
import type { WaveResult, WallErosionEvent } from '../wave';
import type { TileGrid } from '../grid';
import type { ErosionResult } from '../model/grid-model';
import { CASTLE_COL, CASTLE_ROW, GRID_WIDTH, GRID_HEIGHT, TILE_SIZE, WAVE_ROW_DELAY_MS, WAVE_RECEDE_ROW_DELAY_MS, GRID_LEFT, GRID_TOP, FLOW_MIN_WATER } from '../config';

const POST_WAVE_PAUSE_MS = 800;
const CASTLE_FLASH_MS = 200;
const labelFont = new Font({ size: 10 });

export class WaveRenderer {
  private overlayActors: Actor[] = [];
  private edgeMap = new Map<string, Actor>();

  constructor(private grid: TileGrid, private scene: Scene) {}

  async playWave(result: WaveResult): Promise<void> {
    const hasWater: boolean[][] = Array.from({ length: GRID_HEIGHT }, () =>
      Array.from({ length: GRID_WIDTH }, () => false),
    );
    const overlayGrid: (Actor | null)[][] = Array.from({ length: GRID_HEIGHT }, () =>
      Array.from({ length: GRID_WIDTH }, () => null),
    );
    const flashed: boolean[][] = Array.from({ length: GRID_HEIGHT }, () =>
      Array.from({ length: GRID_WIDTH }, () => false),
    );

    for (const frame of result.advanceFrames) {
      await this.delay(WAVE_ROW_DELAY_MS);
      for (let row = 0; row < GRID_HEIGHT; row++) {
        for (let col = 0; col < GRID_WIDTH; col++) {
          const hasWaterNow = frame[row][col] > FLOW_MIN_WATER;
          if (hasWaterNow && !hasWater[row][col]) {
            hasWater[row][col] = true;
            const overlay = this.spawnOverlay(col, row, frame[row][col]);
            overlayGrid[row][col] = overlay;
            if (!flashed[row][col]) {
              flashed[row][col] = true;
              if (result.wallErosionEvents[row][col] === 'blocked') {
                this.spawnBlockFlash(col, row);
              } else if (result.wallErosionEvents[row][col] === 'overtopped') {
                this.spawnOvertopBar(col, row);
              }
            }
          } else if (!hasWaterNow && hasWater[row][col]) {
            hasWater[row][col] = false;
            const existing = overlayGrid[row][col];
            if (existing) {
              existing.actions.fade(0, 120).callMethod(() => this.scene.remove(existing));
              overlayGrid[row][col] = null;
            }
          }
        }
      }
      this.rebuildEdges(hasWater);
    }

    for (const frame of result.recedeFrames) {
      await this.delay(WAVE_RECEDE_ROW_DELAY_MS);
      for (let row = 0; row < GRID_HEIGHT; row++) {
        for (let col = 0; col < GRID_WIDTH; col++) {
          const hasWaterNow = frame[row][col] > FLOW_MIN_WATER;
          if (!hasWaterNow && hasWater[row][col]) {
            hasWater[row][col] = false;
            const existing = overlayGrid[row][col];
            if (existing) {
              existing.actions.fade(0, 120).callMethod(() => this.scene.remove(existing));
              overlayGrid[row][col] = null;
            }
          }
          if (hasWaterNow) {
            hasWater[row][col] = true;
            this.spawnRecedeOverlay(col, row, frame[row][col]);
          }
        }
      }
      this.rebuildEdges(hasWater);
    }

    this.clearEdges();

    for (let col = 0; col < GRID_WIDTH; col++) {
      let firstRow = -1;
      for (let row = 0; row < GRID_HEIGHT; row++) {
        if (result.advanceHeightMap[row][col] > 0) {
          firstRow = row;
          break;
        }
      }
      if (firstRow === -1) {
        continue;
      }
      const height = result.advanceHeightMap[firstRow][col];
      const labelActor = new Actor({
        pos: new Vector(
          GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
          GRID_TOP + firstRow * TILE_SIZE + TILE_SIZE / 2,
        ),
        z: 10,
      });
      labelActor.graphics.use(new Text({
        text: String(Math.round(height)),
        color: Color.White,
        font: labelFont,
      }));
      this.scene.add(labelActor);
      this.overlayActors.push(labelActor);
    }

    await this.delay(POST_WAVE_PAUSE_MS);

    if (result.castleFlooded) {
      const castleTile = this.grid.getTile(CASTLE_COL, CASTLE_ROW);
      if (castleTile) {
        for (let i = 0; i < 3; i++) {
          const redRect = new Rectangle({
            width: TILE_SIZE - 1,
            height: TILE_SIZE - 1,
            color: Color.Red,
          });
          castleTile.graphics.use(redRect);
          await this.delay(CASTLE_FLASH_MS);
          castleTile.updateVisual();
          await this.delay(CASTLE_FLASH_MS);
        }
      }
    }
  }

  async flashSandRedistribution(events: WallErosionEvent[][]): Promise<void> {
    const actors: Actor[] = [];
    for (let row = 0; row < events.length; row++) {
      for (let col = 0; col < events[row].length; col++) {
        if (events[row][col] === null) {
          continue;
        }
        for (const r of [row, row - 1]) {
          if (r < 0 || r >= GRID_HEIGHT) {
            continue;
          }
          const actor = new Actor({
            pos: new Vector(
              GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
              GRID_TOP + r * TILE_SIZE + TILE_SIZE / 2,
            ),
            width: TILE_SIZE - 1,
            height: TILE_SIZE - 1,
            color: Color.fromRGB(230, 200, 140, 0.75),
            z: 7,
          });
          this.scene.add(actor);
          actors.push(actor);
          actor.actions.fade(0, 240);
        }
      }
    }
    if (actors.length === 0) {
      return;
    }
    await this.delay(260);
    for (const a of actors) {
      this.scene.remove(a);
    }
  }

  async flashErodedTiles(erosionResults: ErosionResult[]): Promise<void> {
    if (erosionResults.length === 0) {
      return;
    }
    const flashActors: Actor[] = [];
    for (const result of erosionResults) {
      const actor = new Actor({
        pos: new Vector(
          GRID_LEFT + result.col * TILE_SIZE + TILE_SIZE / 2,
          GRID_TOP + result.row * TILE_SIZE + TILE_SIZE / 2,
        ),
        width: TILE_SIZE - 1,
        height: TILE_SIZE - 1,
        color: Color.fromRGB(255, 140, 0, 0.7),
      });
      this.scene.add(actor);
      flashActors.push(actor);
    }
    await this.delay(350);
    for (const actor of flashActors) {
      this.scene.remove(actor);
    }
  }

  cleanup(): void {
    for (const actor of this.overlayActors) {
      this.scene.remove(actor);
    }
    this.overlayActors = [];
    this.clearEdges();
  }

  private rebuildEdges(hasWater: boolean[][]): void {
    const needed = new Set<string>();
    for (let row = 0; row < GRID_HEIGHT; row++) {
      for (let col = 0; col < GRID_WIDTH; col++) {
        if (!hasWater[row][col]) {
          continue;
        }
        if (row === 0 || !hasWater[row - 1][col]) {
          needed.add(`${col}:${row}:top`);
        }
        if (row + 1 >= GRID_HEIGHT || !hasWater[row + 1][col]) {
          needed.add(`${col}:${row}:bottom`);
        }
        if (col === 0 || !hasWater[row][col - 1]) {
          needed.add(`${col}:${row}:left`);
        }
        if (col + 1 >= GRID_WIDTH || !hasWater[row][col + 1]) {
          needed.add(`${col}:${row}:right`);
        }
      }
    }
    for (const [key, actor] of this.edgeMap) {
      if (!needed.has(key)) {
        this.scene.remove(actor);
        this.edgeMap.delete(key);
      }
    }
    for (const key of needed) {
      if (!this.edgeMap.has(key)) {
        const [colStr, rowStr, pos] = key.split(':');
        const actor = this.spawnEdge(Number(colStr), Number(rowStr), pos as 'top' | 'bottom' | 'left' | 'right');
        this.edgeMap.set(key, actor);
      }
    }
  }

  private clearEdges(): void {
    for (const a of this.edgeMap.values()) {
      this.scene.remove(a);
    }
    this.edgeMap.clear();
  }

  private spawnEdge(col: number, row: number, position: 'top' | 'bottom' | 'left' | 'right'): Actor {
    const cx = GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2;
    const cy = GRID_TOP + row * TILE_SIZE + TILE_SIZE / 2;
    let x = cx;
    let y = cy;
    let w = TILE_SIZE - 1;
    let h = 2;
    if (position === 'top') {
      y = GRID_TOP + row * TILE_SIZE + 1;
    } else if (position === 'bottom') {
      y = GRID_TOP + row * TILE_SIZE + TILE_SIZE - 1;
    } else if (position === 'left') {
      x = GRID_LEFT + col * TILE_SIZE + 1;
      w = 2;
      h = TILE_SIZE - 1;
    } else {
      x = GRID_LEFT + col * TILE_SIZE + TILE_SIZE - 1;
      w = 2;
      h = TILE_SIZE - 1;
    }
    const actor = new Actor({
      pos: new Vector(x, y),
      width: w,
      height: h,
      color: Color.fromRGB(255, 255, 255, 0.9),
      z: 8,
    });
    this.scene.add(actor);
    return actor;
  }

  private spawnBlockFlash(col: number, row: number): void {
    const actor = new Actor({
      pos: new Vector(
        GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
        GRID_TOP + row * TILE_SIZE + TILE_SIZE / 2,
      ),
      width: TILE_SIZE - 1,
      height: TILE_SIZE - 1,
      color: Color.fromRGB(255, 255, 255, 0.85),
      z: 5,
    });
    this.scene.add(actor);
    actor.actions.fade(0, 120).callMethod(() => this.scene.remove(actor));
  }

  private spawnOvertopBar(col: number, row: number): void {
    const actor = new Actor({
      pos: new Vector(
        GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
        GRID_TOP + row * TILE_SIZE + 2,
      ),
      width: TILE_SIZE - 1,
      height: 3,
      color: Color.fromRGB(220, 245, 255, 0.75),
      z: 6,
    });
    this.scene.add(actor);
    actor.actions.fade(0, 90).callMethod(() => this.scene.remove(actor));
  }

  private spawnOverlay(col: number, row: number, waveHeight: number): Actor {
    const t = Math.min((waveHeight - 1) / 8, 1.0);
    const r = Math.round(180 * (1 - t));
    const g = Math.round(220 * (1 - t) + 10);
    const a = 0.25 + t * 0.65;
    const color = Color.fromRGB(r, g, 255, a);
    const actor = new Actor({
      pos: new Vector(
        GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
        GRID_TOP + row * TILE_SIZE + TILE_SIZE / 2,
      ),
      width: TILE_SIZE,
      height: TILE_SIZE,
      color,
    });
    this.scene.add(actor);
    return actor;
  }

  private spawnRecedeOverlay(col: number, row: number, waveHeight: number): Actor {
    const t = Math.min((waveHeight - 1) / 8, 1.0);
    const r = Math.round(140 * (1 - t));
    const g = Math.round(200 * (1 - t) + 40);
    const a = 0.20 + t * 0.55;
    const color = Color.fromRGB(r, g, 255, a);
    const actor = new Actor({
      pos: new Vector(
        GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
        GRID_TOP + row * TILE_SIZE + TILE_SIZE / 2,
      ),
      width: TILE_SIZE,
      height: TILE_SIZE,
      color,
    });
    this.scene.add(actor);
    actor.actions.fade(0, 180).callMethod(() => this.scene.remove(actor));
    return actor;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**Step 2: Update level.ts to use WaveRenderer + inline simulation invocation**

In `src/level.ts`, replace `WaveAnimator` import with `WaveRenderer`. Move the wave curve generation and `simulateWave()` call from `WaveAnimator.animate()` into `level.ts`'s `runWavePhase()` method. The `runWavePhase` loop now:
1. Generates wave curve (random peaks)
2. Calls `simulateWave()` with grid data
3. Passes the `WaveResult` to `waveRenderer.playWave(result)`

Key changes to `level.ts`:
- `import { WaveRenderer } from './view/wave-renderer'` instead of `WaveAnimator`
- `import { simulateWave, generateWaveCurve } from './wave'`
- Add wave curve generation + simulateWave call before `waveRenderer.playWave(result)`

**Step 3: Delete src/wave-animator.ts**

Remove the old file.

**Step 4: Run typecheck + unit tests**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS

**Step 5: Run Playwright visual regression tests**

Run: `npm test`
Expected: PASS (behavior unchanged, just code reorganization)

**Step 6: Commit**

```bash
git add src/view/wave-renderer.ts src/level.ts
git rm src/wave-animator.ts
git commit -m "refactor: split WaveAnimator into WaveRenderer (visual only) + inline simulation"
```

---

## Task 5: Move PlanningPhase and HUD rendering to src/view/

Relocate visual-layer files into `src/view/` and move tile.ts there too. This is mostly a file-move task but also extracts the banner/game-over/elevation-label UI from `level.ts` into a dedicated module.

**Files:**
- Move: `src/tile.ts` -> `src/view/tile.ts`
- Move: `src/planning-phase.ts` -> `src/view/planning-phase.ts`
- Move: `src/level-display.ts` -> `src/view/level-display.ts`
- Create: `src/view/screen-overlays.ts` (game-over screen, level-complete banner, wave banner, text banner, elevation labels)
- Modify: all files that import from moved modules (update paths)

**Step 1: Move files and update imports**

Move `tile.ts`, `planning-phase.ts`, `level-display.ts` into `src/view/`. Update all import paths across the codebase.

**Step 2: Extract screen overlay functions from level.ts**

Create `src/view/screen-overlays.ts` with the UI rendering currently in `level.ts`:

```ts
import { Scene, Actor, Color, Rectangle, Text, Font } from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_HEIGHT, GRID_WIDTH, TILE_SIZE, GRID_TOP } from '../config';
import type { TileGrid } from '../grid';

export function showWaveBanner(scene: Scene, k: number, total: number): Actor {
  const actor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT * 0.45, z: 50 });
  actor.graphics.use(new Text({
    text: `Wave ${k} of ${total}`,
    color: Color.fromRGB(100, 180, 255),
    font: new Font({ size: 28 }),
  }));
  scene.add(actor);
  return actor;
}

export function showTextBanner(scene: Scene, text: string, color: Color): Actor {
  const actor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT * 0.4, z: 50 });
  actor.graphics.use(new Text({ text, color, font: new Font({ size: 28 }) }));
  scene.add(actor);
  return actor;
}

export function showLevelComplete(scene: Scene, level: number): Promise<void> {
  return new Promise(resolve => {
    const actor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, z: 50 });
    actor.graphics.use(new Text({
      text: `Level ${level} complete!`,
      color: Color.White,
      font: new Font({ size: 32 }),
    }));
    scene.add(actor);
    setTimeout(() => {
      scene.remove(actor);
      resolve();
    }, 1500);
  });
}

export interface GameOverCallbacks {
  onRestart: () => void;
}

export function showGameOver(scene: Scene, level: number, callbacks: GameOverCallbacks): void {
  const bgActor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, z: 100 });
  bgActor.graphics.use(new Rectangle({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, color: Color.fromRGB(0, 0, 0, 0.75) }));

  const titleActor = new Actor({ x: 0, y: -40 });
  titleActor.graphics.use(new Text({ text: 'GAME OVER', color: Color.White, font: new Font({ size: 48 }) }));
  bgActor.addChild(titleActor);

  const subtitleActor = new Actor({ x: 0, y: 20 });
  subtitleActor.graphics.use(new Text({ text: `Level reached: ${level}`, color: Color.White, font: new Font({ size: 24 }) }));
  bgActor.addChild(subtitleActor);

  const restartActor = new Actor({ x: 0, y: 60 });
  restartActor.graphics.use(new Text({ text: 'Click anywhere to restart', color: Color.fromRGB(180, 180, 180), font: new Font({ size: 18 }) }));
  bgActor.addChild(restartActor);

  bgActor.on('pointerdown', () => {
    scene.remove(bgActor);
    callbacks.onRestart();
  });

  scene.add(bgActor);
}

export function showElevationLabels(scene: Scene, grid: TileGrid): Actor[] {
  const actors: Actor[] = [];
  for (let row = 0; row < GRID_HEIGHT; row++) {
    for (let col = 0; col < GRID_WIDTH; col++) {
      const tile = grid.getTile(col, row);
      if (!tile || tile.isCastle || tile.elevation === 0) {
        continue;
      }
      const fontSize = Math.max(8, Math.floor(TILE_SIZE * 0.45));
      const label = new Actor({ x: tile.pos.x, y: tile.pos.y, z: 20 });
      label.graphics.use(new Text({
        text: String(tile.elevation),
        color: Color.White,
        font: new Font({ size: fontSize }),
      }));
      scene.add(label);
      actors.push(label);
      if (tile.elevation < 0 && tile.puddleDepth > 0) {
        const smallFont = Math.max(6, Math.floor(fontSize * 0.7));
        const puddle = new Actor({ x: tile.pos.x, y: tile.pos.y + fontSize * 0.6, z: 20 });
        puddle.graphics.use(new Text({
          text: `(${Math.round(tile.puddleDepth)})`,
          color: Color.fromHex('#87CEFA'),
          font: new Font({ size: smallFont }),
        }));
        scene.add(puddle);
        actors.push(puddle);
      }
    }
  }
  return actors;
}

export function hideElevationLabels(scene: Scene, actors: Actor[]): void {
  for (const actor of actors) {
    scene.remove(actor);
  }
}
```

**Step 3: Update level.ts to use extracted functions**

Replace inline implementations in `level.ts` with calls to the new `screen-overlays.ts` functions. Remove the private methods that were extracted.

**Step 4: Run typecheck + all tests**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS

Run: `npm test`
Expected: PASS (visual regression)

**Step 5: Commit**

```bash
git add src/view/ src/grid.ts src/level.ts
git rm src/tile.ts src/planning-phase.ts src/level-display.ts
git commit -m "refactor: move visual-layer files to src/view/, extract screen overlays"
```

---

## Task 6: Create GameSession as the orchestrator

Replace `MyLevel` (the god class in `level.ts`) with `GameSession` that is a thin Excalibur Scene wiring together GridModel, GameMode, TileGrid, WaveRenderer, and PlanningPhase.

**Files:**
- Create: `src/game-session.ts`
- Modify: `src/main.ts` (register GameSession instead of MyLevel)
- Delete: `src/level.ts`

**Step 1: Create GameSession**

Create `src/game-session.ts`. This is a rewrite of `MyLevel` that:
- Creates `GridModel` and `TileGrid` (view)
- Creates `WaveRenderer`
- Reads parameters from `GameMode` (injected or constructed)
- Manages `GameState` as plain data
- Delegates all simulation to `simulateWave()` on model data
- Delegates all rendering to view-layer modules
- Delegates all progression decisions to `GameMode`

```ts
import { Engine, Scene, Actor, Color, Rectangle, Keys } from 'excalibur';
import { GridModel } from './model/grid-model';
import { TileGrid } from './grid';
import { WaveRenderer } from './view/wave-renderer';
import { PlanningPhase } from './view/planning-phase';
import { LevelDisplay } from './view/level-display';
import { LevelMode } from './modes/level-mode';
import { simulateWave, generateWaveCurve } from './wave';
import {
  showWaveBanner, showGameOver, showLevelComplete,
  showTextBanner, showElevationLabels, hideElevationLabels,
} from './view/screen-overlays';
import type { GameMode, GameState } from './modes/game-mode';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, GRID_WIDTH, GRID_HEIGHT,
  GRID_TOP, TERRAIN_SLOPE, WAVE_VALLEY_FRACTION, WAVE_PEAK_WEIGHTS,
  WAVE_HEIGHT_PER_WAVE_INC, CASTLE_ROW, CASTLE_COL, ENHANCED_SHOVEL_DELTA,
} from './config';
import type { Tile } from './view/tile';

export class GameSession extends Scene {
  private model!: GridModel;
  private gridView!: TileGrid;
  private waveRenderer!: WaveRenderer;
  private levelDisplay!: LevelDisplay;
  private gameMode: GameMode = new LevelMode();
  private elevationLabelActors: Actor[] = [];

  private state: GameState = {
    level: 1,
    wavesCompleted: 0,
    consecutiveCleanWaves: 0,
    hasEnhancedShovel: false,
  };

  override onInitialize(_engine: Engine): void {
    const oceanBg = new Actor({ x: CANVAS_WIDTH / 2, y: GRID_TOP / 2, z: -1 });
    oceanBg.graphics.use(new Rectangle({
      width: CANVAS_WIDTH,
      height: GRID_TOP,
      color: Color.fromRGB(30, 90, 160),
    }));
    this.add(oceanBg);

    this.model = new GridModel({
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      castleCol: CASTLE_COL,
      castleRow: CASTLE_ROW,
    });
    this.gridView = new TileGrid(this.model, this);
    this.waveRenderer = new WaveRenderer(this.gridView, this);
    this.levelDisplay = new LevelDisplay();
    this.levelDisplay.activate(this, this.state.level);
    this.updateElevationBounds();
    this.startPlanningPhase();

    _engine.input.keyboard.on('hold', (evt) => {
      if (evt.key === Keys.L && this.elevationLabelActors.length === 0) {
        this.elevationLabelActors = showElevationLabels(this, this.gridView);
      }
    });
    _engine.input.keyboard.on('release', (evt) => {
      if (evt.key === Keys.L) {
        hideElevationLabels(this, this.elevationLabelActors);
        this.elevationLabelActors = [];
      }
    });
  }

  private updateElevationBounds(): void {
    const bounds = this.gameMode.elevationBounds(this.state.level);
    this.model.setElevationBounds(bounds.min, bounds.max);
  }

  private startPlanningPhase(): void {
    const scoops = this.gameMode.scoopBudget(this.state);
    const waveParams = this.gameMode.nextWaveParams(this.state);
    const naturalReach = Math.min(Math.round(waveParams.peakHeight / TERRAIN_SLOPE), GRID_HEIGHT);
    const phase = new PlanningPhase(this.gridView, scoops, naturalReach, waveParams.peakHeight, waveParams.waveCount, this.state.hasEnhancedShovel, () => {
      phase.deactivate(this);
      void this.runWavePhase();
    });
    phase.activate(this);
  }

  private async runWavePhase(): Promise<void> {
    const waveParams = this.gameMode.nextWaveParams(this.state);
    const totalWaves = waveParams.waveCount;
    const baseHeight = waveParams.peakHeight;

    for (let k = 1; k <= totalWaves; k++) {
      const banner = showWaveBanner(this, k, totalWaves);
      await this.delay(500);
      this.remove(banner);

      const waveHeight = baseHeight + (k - 1) * WAVE_HEIGHT_PER_WAVE_INC;

      const peakPhase = (Math.random() - 0.5) * 0.4;
      const totalWeight = WAVE_PEAK_WEIGHTS.reduce((a, b) => a + b, 0);
      let r = Math.random() * totalWeight;
      let numPeaks = 1;
      for (let i = 0; i < WAVE_PEAK_WEIGHTS.length; i++) {
        r -= WAVE_PEAK_WEIGHTS[i];
        if (r <= 0) { numPeaks = i + 1; break; }
      }
      const columnHeights = generateWaveCurve(GRID_WIDTH, waveHeight, WAVE_VALLEY_FRACTION, peakPhase, numPeaks);

      const elevations = this.model.getElevations();
      const puddleDepths: number[][] = elevations.map((row, rowIdx) =>
        row.map((_, colIdx) => this.model.getPuddleDepth(colIdx, rowIdx)),
      );

      const result = simulateWave({
        elevations,
        puddleDepths,
        columnHeights,
        castleCol: CASTLE_COL,
        castleRow: CASTLE_ROW,
        maxRows: GRID_HEIGHT,
        terrainSlope: TERRAIN_SLOPE,
        poolMap: this.model.getPoolMap(),
      });

      await this.waveRenderer.playWave(result);

      const erodedTiles = this.model.applyErosion(result.advanceHeightMap, result.recedeHeightMap);
      this.gridView.refreshAllVisuals();
      if (erodedTiles.length > 0) {
        await this.waveRenderer.flashErodedTiles(erodedTiles);
      }

      const puddleDeltas: { col: number; row: number; depth: number }[] = [];
      for (let rowIdx = 0; rowIdx < result.puddleDelta.length; rowIdx++) {
        for (let colIdx = 0; colIdx < result.puddleDelta[rowIdx].length; colIdx++) {
          if (result.puddleDelta[rowIdx][colIdx] > 0) {
            puddleDeltas.push({ col: colIdx, row: rowIdx, depth: result.puddleDelta[rowIdx][colIdx] });
          }
        }
      }
      this.gridView.applyPuddleDeltas(puddleDeltas);
      this.model.applySandRedistribution(result.wallErosionEvents);
      this.gridView.refreshAllVisuals();
      await this.waveRenderer.flashSandRedistribution(result.wallErosionEvents);

      if (result.castleFlooded) {
        const transition = this.gameMode.resolveWave(this.state, { castleFlooded: true, allWavesComplete: false });
        if (transition.type === 'gameover') {
          showGameOver(this, this.state.level, { onRestart: () => this.resetGame() });
          return;
        }
      }

      await this.checkCleanWave(result.advanceHeightMap);

      this.waveRenderer.cleanup();
      if (k < totalWaves) {
        await this.delay(600);
      }
    }

    const transition = this.gameMode.resolveWave(this.state, { castleFlooded: false, allWavesComplete: true });
    if (transition.type === 'advance') {
      await showLevelComplete(this, this.state.level);
      this.advanceLevel();
    } else if (transition.type === 'plan') {
      this.startPlanningPhase();
    }
  }

  private advanceLevel(): void {
    this.state.level++;
    this.updateElevationBounds();
    this.levelDisplay.update(this.state.level);
    this.waveRenderer.cleanup();
    this.model.resetHitCounts();
    this.waveRenderer = new WaveRenderer(this.gridView, this);
    this.startPlanningPhase();
  }

  private resetGame(): void {
    this.state = { level: 1, wavesCompleted: 0, consecutiveCleanWaves: 0, hasEnhancedShovel: false };
    this.updateElevationBounds();
    this.levelDisplay.update(this.state.level);
    this.waveRenderer.cleanup();
    const tilesToRemove = this.entities.filter(e => 'col' in e && 'row' in e);
    for (const tile of tilesToRemove) {
      this.remove(tile);
    }
    this.model.reset();
    this.gridView = new TileGrid(this.model, this);
    this.waveRenderer = new WaveRenderer(this.gridView, this);
    this.startPlanningPhase();
  }

  private async checkCleanWave(waveHeightMap: number[][]): Promise<void> {
    let isClean = true;
    for (let r = CASTLE_ROW - 1; r <= CASTLE_ROW + 1; r++) {
      for (let c = CASTLE_COL - 1; c <= CASTLE_COL + 1; c++) {
        if (r === CASTLE_ROW && c === CASTLE_COL) {
          continue;
        }
        if (r < 0 || r >= GRID_HEIGHT || c < 0 || c >= GRID_WIDTH) {
          continue;
        }
        if (waveHeightMap[r][c] > 0) {
          isClean = false;
        }
      }
    }
    const earned = this.gameMode.checkCleanWaveReward(this.state, isClean);
    if (isClean) {
      this.state.consecutiveCleanWaves++;
    } else {
      this.state.consecutiveCleanWaves = 0;
    }
    if (earned) {
      this.state.hasEnhancedShovel = true;
      const banner = showTextBanner(this, 'Enhanced shovel earned!', Color.fromRGB(255, 220, 50));
      await this.delay(1500);
      this.remove(banner);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**Step 2: Update main.ts**

```ts
import { GameSession } from './game-session';
// Replace MyLevel with GameSession in scenes registration
scenes: { title: TitleScene, game: GameSession },
```

**Step 3: Delete src/level.ts**

**Step 4: Run typecheck + unit tests**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS

**Step 5: Run full test suite including visual regression**

Run: `npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add src/game-session.ts src/main.ts
git rm src/level.ts
git commit -m "refactor: replace MyLevel god class with GameSession orchestrator"
```

---

## Task 7: Move remaining simulation files to src/model/

Move `wave.ts`, `flow-field.ts`, and their tests into `src/model/` to complete the directory structure.

**Files:**
- Move: `src/wave.ts` -> `src/model/wave-simulation.ts`
- Move: `src/wave.test.ts` -> `src/model/wave-simulation.test.ts`
- Move: `src/flow-field.ts` -> `src/model/flow-field.ts`
- Move: `src/flow-field.test.ts` -> `src/model/flow-field.test.ts`
- Modify: all files that import from the moved modules (update paths)

**Step 1: Move files**

Move the four files and update all import paths across the codebase.

**Step 2: Run typecheck + all tests**

Run: `npx tsc --noEmit && npm run test:unit && npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/model/ src/view/ src/game-session.ts src/grid.ts
git rm src/wave.ts src/wave.test.ts src/flow-field.ts src/flow-field.test.ts
git commit -m "refactor: move simulation files to src/model/"
```

---

## Task 8: Move TileGrid into src/view/ and rename

The last structural move: `grid.ts` is now purely a view-layer adapter. Move it to `src/view/grid-view.ts`.

**Files:**
- Move: `src/grid.ts` -> `src/view/grid-view.ts` (rename class `TileGrid` to `GridView`)
- Move: `src/grid.test.ts` -> `src/view/grid-view.test.ts`
- Modify: all files that import `TileGrid` (update to `GridView`)

**Step 1: Move and rename**

Move files. Rename `TileGrid` class to `GridView` and update all references across the codebase.

**Step 2: Run typecheck + all tests**

Run: `npx tsc --noEmit && npm run test:unit && npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/view/grid-view.ts src/view/grid-view.test.ts src/game-session.ts src/view/wave-renderer.ts src/view/planning-phase.ts src/view/screen-overlays.ts
git rm src/grid.ts src/grid.test.ts
git commit -m "refactor: rename TileGrid to GridView, move to src/view/"
```

---

## Task 9: Final cleanup and verification

Remove any dead code, verify the clean directory structure, run all tests.

**Step 1: Verify final directory structure**

```
src/
  config.ts
  main.ts
  game-session.ts
  resources.ts
  title-scene.ts
  player.ts
  style.css
  vite-env.d.ts
  files.d.ts

  model/
    grid-model.ts
    grid-model.test.ts
    wave-simulation.ts
    wave-simulation.test.ts
    flow-field.ts
    flow-field.test.ts

  view/
    grid-view.ts
    grid-view.test.ts
    tile.ts
    wave-renderer.ts
    planning-phase.ts
    level-display.ts
    screen-overlays.ts

  modes/
    game-mode.ts
    level-mode.ts
    level-mode.test.ts
```

**Step 2: Verify no Excalibur imports in src/model/**

Run: `grep -r "from 'excalibur'" src/model/`
Expected: no results

**Step 3: Run full test suite**

Run: `npm run test:unit && npx tsc --noEmit && npm test`
Expected: ALL PASS

**Step 4: Commit any cleanup**

```bash
git add -A
git commit -m "chore: final cleanup after architecture refactor"
```

---

## Summary of architectural boundaries after refactor

| Layer | Directory | Imports from | Never imports |
|-------|-----------|-------------|---------------|
| Model (simulation) | `src/model/` | `src/config.ts` only | Excalibur, `src/view/` |
| View (rendering) | `src/view/` | `src/model/`, `src/config.ts`, Excalibur | `src/modes/` |
| Modes (progression) | `src/modes/` | `src/config.ts` only | Excalibur, `src/model/`, `src/view/` |
| Orchestration | `src/game-session.ts` | All layers | (nothing restricted) |

**Future changes enabled:**
- **Wave physics tweaks**: edit `src/model/flow-field.ts` or `src/model/wave-simulation.ts`. No rendering code touched.
- **Visual treatment / isometric**: swap `src/view/grid-view.ts` with an isometric implementation. GridModel unchanged.
- **Continuous mode**: implement a new `ContinuousMode` in `src/modes/`. Pass it to `GameSession` instead of `LevelMode`.
