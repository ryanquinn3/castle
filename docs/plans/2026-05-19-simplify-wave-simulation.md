# Simplify Wave Simulation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the complex flow-field wave simulation (momentum, pressure, equalization) with a simple column-based model that has basic lateral redistribution when water is blocked by walls.

**Architecture:** Water advances row-by-row. Each column carries a height that interacts independently with terrain (walls block/reduce, holes absorb). When a wall fully blocks a column, the blocked water splits evenly to adjacent unblocked columns. One advance pass (top-to-bottom), one recede pass (bottom-to-top). Each pass emits one snapshot per row for animation compatibility with the existing `WaveRenderer`.

**Tech Stack:** TypeScript, Vitest, Excalibur.js

---

### Task 1: Replace flow-field.ts with simple column-based simulation

Delete all flow-field complexity (FlowCell, momentum, pressure, equalization) and replace with a straightforward column-based simulation with lateral redistribution.

**Files:**
- Rewrite: `src/model/flow-field.ts`
- Rewrite: `src/model/flow-field.test.ts`

**Step 1: Write the new tests**

Replace `src/model/flow-field.test.ts` with tests for the new simple API. The new module exports two functions: `simulateAdvance` and `simulateRecede`.

```typescript
import { describe, expect, test } from 'vitest';
import { simulateAdvance, simulateRecede } from './flow-field';

function flatGrid(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

describe('simulateAdvance', () => {
  test('flat grid: water reaches every row', () => {
    const result = simulateAdvance({
      elevations: flatGrid(4, 3),
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: flatGrid(4, 3),
      castleCol: 1,
      castleRow: 3,
    });
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        expect(result.maxWaterMap[r][c]).toBeGreaterThan(0);
      }
    }
  });

  test('produces one snapshot per row', () => {
    const result = simulateAdvance({
      elevations: flatGrid(5, 3),
      columnHeights: [1, 1, 1],
      terrainSlope: 0,
      effectiveHoleDepths: flatGrid(5, 3),
      castleCol: 1,
      castleRow: 4,
    });
    expect(result.snapshots.length).toBe(5);
  });

  test('wall taller than wave blocks column', () => {
    const elevations = flatGrid(3, 3);
    elevations[0][1] = 5;
    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 3, 0],
      terrainSlope: 0,
      effectiveHoleDepths: flatGrid(3, 3),
      castleCol: 1,
      castleRow: 2,
    });
    expect(result.wallEvents[0][1]).toBe('blocked');
    expect(result.maxWaterMap[1][1]).toBe(0);
  });

  test('blocked water redistributes to neighbors', () => {
    const elevations = flatGrid(3, 3);
    elevations[0][1] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 6, 0],
      terrainSlope: 0,
      effectiveHoleDepths: flatGrid(3, 3),
      castleCol: 1,
      castleRow: 2,
    });
    // Blocked water from col 1 should spill to cols 0 and 2
    expect(result.maxWaterMap[0][0]).toBeGreaterThan(0);
    expect(result.maxWaterMap[0][2]).toBeGreaterThan(0);
  });

  test('blocked water only goes to unblocked neighbors', () => {
    const elevations = flatGrid(3, 3);
    elevations[0][0] = 10;
    elevations[0][1] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 6, 0],
      terrainSlope: 0,
      effectiveHoleDepths: flatGrid(3, 3),
      castleCol: 1,
      castleRow: 2,
    });
    // Col 0 also blocked, so all spillover goes to col 2
    expect(result.maxWaterMap[0][0]).toBe(0);
    expect(result.maxWaterMap[0][2]).toBeGreaterThan(0);
  });

  test('wall shorter than wave reduces water and records overtopped', () => {
    const elevations = flatGrid(3, 3);
    elevations[0][1] = 2;
    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 5, 0],
      terrainSlope: 0,
      effectiveHoleDepths: flatGrid(3, 3),
      castleCol: 1,
      castleRow: 2,
    });
    expect(result.wallEvents[0][1]).toBe('overtopped');
    expect(result.maxWaterMap[1][1]).toBeGreaterThan(0);
    expect(result.maxWaterMap[1][1]).toBeLessThan(5);
  });

  test('hole absorbs water up to effective depth', () => {
    const elevations = flatGrid(3, 3);
    elevations[1][1] = -4;
    const holeDepths = flatGrid(3, 3);
    holeDepths[1][1] = 3;
    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 2, 0],
      terrainSlope: 0,
      effectiveHoleDepths: holeDepths,
      castleCol: 1,
      castleRow: 2,
    });
    expect(result.puddleDelta[1][1]).toBe(2);
    expect(result.maxWaterMap[2][1]).toBe(0);
  });

  test('hole shallower than wave absorbs partial water', () => {
    const elevations = flatGrid(3, 3);
    elevations[1][1] = -2;
    const holeDepths = flatGrid(3, 3);
    holeDepths[1][1] = 1;
    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 3, 0],
      terrainSlope: 0,
      effectiveHoleDepths: holeDepths,
      castleCol: 1,
      castleRow: 2,
    });
    expect(result.puddleDelta[1][1]).toBe(1);
    expect(result.maxWaterMap[2][1]).toBeGreaterThan(0);
  });

  test('terrain slope reduces wave per row', () => {
    const result = simulateAdvance({
      elevations: flatGrid(4, 1),
      columnHeights: [3],
      terrainSlope: 1,
      effectiveHoleDepths: flatGrid(4, 1),
      castleCol: 0,
      castleRow: 3,
    });
    // At slope=1, wave loses 1 per row: row0=2, row1=1, row2=0
    expect(result.maxWaterMap[0][0]).toBe(2);
    expect(result.maxWaterMap[1][0]).toBe(1);
    expect(result.maxWaterMap[2][0]).toBe(0);
  });

  test('detects castle flooding', () => {
    const result = simulateAdvance({
      elevations: flatGrid(3, 3),
      columnHeights: [0, 5, 0],
      terrainSlope: 0,
      effectiveHoleDepths: flatGrid(3, 3),
      castleCol: 1,
      castleRow: 2,
    });
    expect(result.castleFlooded).toBe(true);
  });

  test('all columns blocked means no water anywhere', () => {
    const elevations = flatGrid(3, 3);
    elevations[0][0] = 10;
    elevations[0][1] = 10;
    elevations[0][2] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [3, 3, 3],
      terrainSlope: 0,
      effectiveHoleDepths: flatGrid(3, 3),
      castleCol: 1,
      castleRow: 2,
    });
    expect(result.castleFlooded).toBe(false);
    for (let r = 1; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(result.maxWaterMap[r][c]).toBe(0);
      }
    }
  });
});

describe('simulateRecede', () => {
  test('produces one snapshot per row', () => {
    const advanceResult = simulateAdvance({
      elevations: flatGrid(4, 3),
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: flatGrid(4, 3),
      castleCol: 1,
      castleRow: 3,
    });
    const result = simulateRecede({
      elevations: flatGrid(4, 3),
      advanceWaterMap: advanceResult.maxWaterMap,
      terrainSlope: 0,
      effectiveHoleDepths: flatGrid(4, 3),
      castleCol: 1,
      castleRow: 3,
    });
    expect(result.snapshots.length).toBe(4);
  });

  test('recede water appears in top rows', () => {
    const advanceResult = simulateAdvance({
      elevations: flatGrid(4, 3),
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: flatGrid(4, 3),
      castleCol: 1,
      castleRow: 3,
    });
    const result = simulateRecede({
      elevations: flatGrid(4, 3),
      advanceWaterMap: advanceResult.maxWaterMap,
      terrainSlope: 0,
      effectiveHoleDepths: flatGrid(4, 3),
      castleCol: 1,
      castleRow: 3,
    });
    const topRowMax = result.maxWaterMap[0].reduce((a, b) => a + b, 0);
    expect(topRowMax).toBeGreaterThan(0);
  });

  test('hole absorbs receding water', () => {
    const elevations = flatGrid(3, 3);
    elevations[0][1] = -3;
    const holeDepths = flatGrid(3, 3);
    holeDepths[0][1] = 3;
    // Fake an advance result with water in rows 1 and 2
    const advanceWaterMap = flatGrid(3, 3);
    advanceWaterMap[1][1] = 2;
    advanceWaterMap[2][1] = 2;
    const result = simulateRecede({
      elevations,
      advanceWaterMap,
      terrainSlope: 0,
      effectiveHoleDepths: holeDepths,
      castleCol: 1,
      castleRow: 2,
    });
    expect(result.puddleDelta[0][1]).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `rtk npx vitest run src/model/flow-field.test.ts`
Expected: FAIL (old exports don't match new imports).

**Step 3: Write the new implementation**

Replace `src/model/flow-field.ts` entirely:

```typescript
export type WallEvent = 'overtopped' | 'blocked' | null;

export interface AdvanceInput {
  elevations: number[][];
  columnHeights: number[];
  terrainSlope: number;
  effectiveHoleDepths: number[][];
  castleCol: number;
  castleRow: number;
}

export interface AdvanceResult {
  snapshots: number[][][];
  maxWaterMap: number[][];
  puddleDelta: number[][];
  wallEvents: WallEvent[][];
  castleFlooded: boolean;
}

export function simulateAdvance(input: AdvanceInput): AdvanceResult {
  const { elevations, columnHeights, terrainSlope, castleCol, castleRow } = input;
  const numRows = elevations.length;
  const numCols = elevations[0].length;
  const holeDepths = input.effectiveHoleDepths.map(row => row.slice());

  const maxWaterMap: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const puddleDelta: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const wallEvents: WallEvent[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(null));
  const snapshots: number[][][] = [];
  let castleFlooded = false;

  const heights = columnHeights.slice();

  for (let row = 0; row < numRows; row++) {
    const rowWater = new Array(numCols).fill(0);
    const blocked: boolean[] = new Array(numCols).fill(false);
    const blockedWater: number[] = new Array(numCols).fill(0);

    for (let col = 0; col < numCols; col++) {
      let incoming = heights[col];
      if (incoming <= 0) {
        continue;
      }

      const elev = terrainSlope + elevations[row][col];

      if (elev >= incoming) {
        blocked[col] = true;
        blockedWater[col] = incoming;
        if (elevations[row][col] > 0) {
          wallEvents[row][col] = 'blocked';
        }
        heights[col] = 0;
        continue;
      }

      if (elev > 0) {
        incoming -= elev;
        if (elevations[row][col] > 0) {
          wallEvents[row][col] = 'overtopped';
        }
      }

      const holeCapacity = holeDepths[row][col];
      if (holeCapacity > 0 && elevations[row][col] < 0) {
        const absorbed = Math.min(incoming, holeCapacity);
        puddleDelta[row][col] += absorbed;
        holeDepths[row][col] -= absorbed;
        incoming -= absorbed;
      }

      rowWater[col] = incoming;
      heights[col] = incoming;
    }

    // Lateral redistribution: blocked water spills to adjacent unblocked columns
    for (let col = 0; col < numCols; col++) {
      if (!blocked[col] || blockedWater[col] <= 0) {
        continue;
      }
      const neighbors: number[] = [];
      if (col > 0 && !blocked[col - 1]) {
        neighbors.push(col - 1);
      }
      if (col < numCols - 1 && !blocked[col + 1]) {
        neighbors.push(col + 1);
      }
      if (neighbors.length === 0) {
        continue;
      }
      const share = blockedWater[col] / neighbors.length;
      for (const n of neighbors) {
        rowWater[n] += share;
        heights[n] += share;
      }
    }

    // Record snapshot and max water
    const snapshot: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
    for (let c = 0; c < numCols; c++) {
      snapshot[row][c] = rowWater[c];
      if (rowWater[c] > maxWaterMap[row][c]) {
        maxWaterMap[row][c] = rowWater[c];
      }
    }
    snapshots.push(snapshot);

    if (rowWater[castleCol] > 0 && row === castleRow) {
      castleFlooded = true;
    }
  }

  return { snapshots, maxWaterMap, puddleDelta, wallEvents, castleFlooded };
}

export interface RecedeInput {
  elevations: number[][];
  advanceWaterMap: number[][];
  terrainSlope: number;
  effectiveHoleDepths: number[][];
  castleCol: number;
  castleRow: number;
}

export interface RecedeResult {
  snapshots: number[][][];
  maxWaterMap: number[][];
  puddleDelta: number[][];
  castleFlooded: boolean;
}

export function simulateRecede(input: RecedeInput): RecedeResult {
  const { elevations, advanceWaterMap, terrainSlope, castleCol, castleRow } = input;
  const numRows = elevations.length;
  const numCols = elevations[0].length;
  const holeDepths = input.effectiveHoleDepths.map(row => row.slice());

  const maxWaterMap: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const puddleDelta: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const snapshots: number[][][] = [];
  let castleFlooded = false;

  // Build per-column recede heights from bottom row of advance
  const heights = new Array(numCols).fill(0);
  for (let col = 0; col < numCols; col++) {
    heights[col] = advanceWaterMap[numRows - 1][col];
  }

  for (let row = numRows - 1; row >= 0; row--) {
    const rowWater = new Array(numCols).fill(0);

    for (let col = 0; col < numCols; col++) {
      let incoming = heights[col];
      if (incoming <= 0) {
        continue;
      }

      const elev = terrainSlope + elevations[row][col];

      if (elev >= incoming) {
        heights[col] = 0;
        continue;
      }

      if (elev > 0) {
        incoming -= elev;
      }

      const holeCapacity = holeDepths[row][col];
      if (holeCapacity > 0 && elevations[row][col] < 0) {
        const absorbed = Math.min(incoming, holeCapacity);
        puddleDelta[row][col] += absorbed;
        holeDepths[row][col] -= absorbed;
        incoming -= absorbed;
      }

      rowWater[col] = incoming;
      heights[col] = incoming;
    }

    const snapshot: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
    for (let c = 0; c < numCols; c++) {
      snapshot[row][c] = rowWater[c];
      if (rowWater[c] > maxWaterMap[row][c]) {
        maxWaterMap[row][c] = rowWater[c];
      }
    }
    snapshots.unshift(snapshot);

    if (rowWater[castleCol] > 0 && row === castleRow) {
      castleFlooded = true;
    }
  }

  return { snapshots, maxWaterMap, puddleDelta, castleFlooded };
}
```

**Step 4: Run tests**

Run: `rtk npx vitest run src/model/flow-field.test.ts`
Expected: PASS.

**Step 5: Build and typecheck**

Run: `rtk npm run build`
Expected: Build will FAIL because `wave-simulation.ts` imports old flow-field exports. That's expected, fixed in Task 2.

**Step 6: Commit**

```bash
rtk git add src/model/flow-field.ts src/model/flow-field.test.ts && rtk git commit -m "feat: replace flow field with simple column-based wave simulation"
```

---

### Task 2: Update wave-simulation.ts to use new flow-field API

The `simulateWave` function needs to call the new `simulateAdvance`/`simulateRecede` and map the results to `WaveResult`.

**Files:**
- Modify: `src/model/wave-simulation.ts`

**Step 1: Update the imports and implementation**

```typescript
import { simulateAdvance, simulateRecede } from './flow-field';

export interface PoolInfo {
  members: { col: number; row: number }[];
}

export type WallErosionEvent = 'overtopped' | 'blocked' | null;

export function generateWaveCurve(
  numCols: number,
  peakHeight: number,
  valleyFraction: number,
  peakPhase: number,
  numPeaks: number,
): number[] {
  return Array.from({ length: numCols }, (_, col) => {
    const x = col / (numCols - 1) * numPeaks + peakPhase;
    const wFactor = Math.abs(Math.sin(Math.PI * x));
    return peakHeight * valleyFraction + (peakHeight - peakHeight * valleyFraction) * wFactor;
  });
}

export interface SimulateWaveInput {
  elevations: number[][];
  puddleDepths: number[][];
  columnHeights: number[];
  castleCol: number;
  castleRow: number;
  maxRows: number;
  terrainSlope: number;
  poolMap: Map<string, PoolInfo>;
}

export interface WaveResult {
  advanceHeightMap: number[][];
  recedeHeightMap: number[][];
  advanceFrames: number[][][];
  recedeFrames: number[][][];
  puddleDelta: number[][];
  wallErosionEvents: WallErosionEvent[][];
  castleFlooded: boolean;
}

export function simulateWave(input: SimulateWaveInput): WaveResult {
  const { elevations, puddleDepths, columnHeights, castleCol, castleRow, terrainSlope } = input;
  const numRows = elevations.length;
  const numCols = numRows > 0 ? elevations[0].length : 0;

  const effectiveHoleDepths: number[][] = Array.from({ length: numRows }, (_, r) =>
    Array.from({ length: numCols }, (_, c) => {
      const e = elevations[r][c];
      if (e >= 0) {
        return 0;
      }
      return Math.max(0, (-e) - puddleDepths[r][c]);
    }),
  );

  const advance = simulateAdvance({
    elevations,
    columnHeights,
    terrainSlope,
    effectiveHoleDepths,
    castleCol,
    castleRow,
  });

  const effectiveAfterAdvance = effectiveHoleDepths.map((row, r) =>
    row.map((d, c) => Math.max(0, d - advance.puddleDelta[r][c])),
  );

  const recede = simulateRecede({
    elevations,
    advanceWaterMap: advance.maxWaterMap,
    terrainSlope,
    effectiveHoleDepths: effectiveAfterAdvance,
    castleCol,
    castleRow,
  });

  const puddleDelta: number[][] = advance.puddleDelta.map((row, r) =>
    row.map((v, c) => v + recede.puddleDelta[r][c]),
  );

  return {
    advanceHeightMap: advance.maxWaterMap,
    recedeHeightMap: recede.maxWaterMap,
    advanceFrames: advance.snapshots,
    recedeFrames: recede.snapshots,
    puddleDelta,
    wallErosionEvents: advance.wallEvents,
    castleFlooded: advance.castleFlooded || recede.castleFlooded,
  };
}
```

**Step 2: Run wave-simulation tests**

Run: `rtk npx vitest run src/model/wave-simulation.test.ts`
Expected: PASS.

**Step 3: Build and typecheck**

Run: `rtk npm run build`
Expected: PASS.

**Step 4: Commit**

```bash
rtk git add src/model/wave-simulation.ts && rtk git commit -m "refactor: wire simple column simulation into simulateWave"
```

---

### Task 3: Remove flow-field config constants

Remove the momentum, pressure, and equalization constants from `config.ts`. Keep `WATER_RENDER_THRESHOLD` since the wave renderer still uses it.

**Files:**
- Modify: `src/config.ts`

**Step 1: Remove the constants**

Delete these lines from `src/config.ts`:
- `FLOW_EQUALIZATION_STEPS`
- `FLOW_RATE`
- `MOMENTUM_DECAY`
- `MOMENTUM_REDIRECT_FACTOR`
- `PRESSURE_BUILDUP_RATE`
- `PRESSURE_OVERTOP_FACTOR`
- `FLOW_MIN_WATER`

Keep `WATER_RENDER_THRESHOLD` (used by `wave-renderer.ts`).

**Step 2: Verify no remaining references**

Run: `rtk grep -rn "FLOW_EQUALIZATION\|FLOW_RATE\|MOMENTUM_DECAY\|MOMENTUM_REDIRECT\|PRESSURE_BUILDUP\|PRESSURE_OVERTOP\|FLOW_MIN_WATER" --include="*.ts" | grep -v node_modules | grep -v ".test.ts" | grep -v "plans/"`
Expected: No matches.

**Step 3: Run all tests**

Run: `rtk npx vitest run`
Expected: PASS.

**Step 4: Build and typecheck**

Run: `rtk npm run build`
Expected: PASS.

**Step 5: Commit**

```bash
rtk git add src/config.ts && rtk git commit -m "refactor: remove flow-field config constants"
```

---

### Task 4: Run full test suite and verify

**Step 1: Run all vitest tests**

Run: `rtk npx vitest run`
Expected: PASS.

**Step 2: Build**

Run: `rtk npm run build`
Expected: PASS.

**Step 3: Manual smoke test**

Run: `npm run dev`
- Play a level with no defenses. Verify wave advances row by row and recedes.
- Build a wall. Verify water is blocked and spills to adjacent columns.
- Dig a hole. Verify water gets absorbed.
- Verify castle flooding triggers game over.

**Step 4: Update Playwright baselines if needed**

Run: `npm run test:integration-update`
Then: `rtk npm test`
Expected: PASS.

**Step 5: Commit baselines**

```bash
rtk git add tests/ && rtk git commit -m "test: update baselines for simplified wave simulation"
```
