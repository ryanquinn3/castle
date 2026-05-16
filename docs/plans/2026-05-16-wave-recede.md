# Wave Recede Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-pass wave simulation with a two-pass advance-then-recede cycle. The recede pass introduces three new gameplay mechanics: trapped water (persistent puddles in holes), sand redistribution (overtopped walls lose elevation, sand deposits upstream), and second-pass erosion (recede-flow tiles also accrue hit counters).

**Architecture:**
- `wave.ts` becomes a pure 3-function module: `simulateAdvance`, `simulateRecede`, and a top-level `simulateWave` orchestrator that runs both and returns a combined result. The advance pass emits side-effect descriptors (bounce-back, surviving-water-at-max-row, puddle deltas, wall events) that the recede pass consumes.
- `Tile` gains a persistent `puddleDepth` field. `TileGrid` gains methods to apply puddle deltas and sand redistribution as batched post-wave operations.
- `WaveAnimator` adds a recede animation pass after the existing advance pass. Visuals: persistent puddle overlay on holes, sand-puff effect on wall erosion events.
- Castle flood check becomes `advance.castleFlooded || recede.castleFlooded`.

**Tech Stack:** TypeScript, Excalibur 0.32, Vitest 4 (unit), Playwright (visual regression). Test files colocated as `src/*.test.ts`.

**Conventions:**
- TDD: every task starts with a failing test.
- Commits are per-task. Use Conventional Commits style (`feat:`, `refactor:`, `test:`).
- Code style: see `~/.claude/rules/codestyle.md` (curly braces always, `for..of`, object args for >2 params, YAGNI, return early).
- Verify each task with `npm run test:unit && npx tsc --noEmit` before committing.

---

## Task 1: Lock in current `simulateWave` behavior with tests

**Files:**
- Create: `src/wave.test.ts` (extend existing)

**Why first:** Before refactoring `simulateWave` into two passes, we want characterization tests that capture today's behavior. Any future regression in advance semantics will fail loudly.

**Step 1: Add tests for `simulateWave` baseline behavior**

Add to `src/wave.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { simulateWave } from './wave';

describe('simulateWave (current behavior)', () => {
  // 3x3 grid, castle at (1, 2), wave height 1, terrain slope 0 for simplicity
  const flat3x3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  it('flat grid: wave passes every row at full height', () => {
    const result = simulateWave(flat3x3, [1, 1, 1], 1, 2, 3, 0);
    expect(result.waveHeightMap[0]).toEqual([1, 1, 1]);
    expect(result.waveHeightMap[2]).toEqual([1, 1, 1]);
  });

  it('flat grid: wave at castle column floods castle', () => {
    const result = simulateWave(flat3x3, [1, 1, 1], 1, 2, 3, 0);
    expect(result.castleFlooded).toBe(true);
  });

  it('wall taller than wave: column blocked, no flood', () => {
    const grid = [
      [0, 2, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const result = simulateWave(grid, [0, 1, 0], 1, 2, 3, 0);
    expect(result.waveHeightMap[2][1]).toBe(0);
    expect(result.castleFlooded).toBe(false);
  });

  it('hole deeper than wave: column absorbed, no flood', () => {
    const grid = [
      [0, 0, 0],
      [0, -2, 0],
      [0, 0, 0],
    ];
    const result = simulateWave(grid, [0, 1, 0], 1, 2, 3, 0);
    expect(result.waveHeightMap[2][1]).toBe(0);
    expect(result.castleFlooded).toBe(false);
  });

  it('partial wall: wave continues at reduced height', () => {
    const grid = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    const result = simulateWave(grid, [0, 3, 0], 3, 2, 3, 0);
    // Row 0 enters at 3, hits wall +1 at row 1 → continues at 2
    expect(result.waveHeightMap[2][1]).toBe(2);
  });
});
```

**Step 2: Run tests — they should pass against the existing implementation**

Run: `npm run test:unit`
Expected: all green, 4 new test cases passing.

**Step 3: Commit**

```bash
git add src/wave.test.ts
git commit -m "test: lock in simulateWave baseline behavior before recede refactor"
```

---

## Task 2: Add `puddleDepth` field to Tile and TileGrid helpers

**Files:**
- Modify: `src/tile.ts` (add field)
- Modify: `src/grid.ts` (add accessors, reset, application method)
- Create: `src/grid.test.ts`

**Goal:** Pure state plumbing. No sim integration yet. After this task, `Tile.puddleDepth` exists, defaults to 0, and `TileGrid` exposes the minimal API the sim will use next.

**Step 1: Write failing tests for puddle accessors**

Create `src/grid.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TileGrid } from './grid';
import { Scene } from 'excalibur';

// Minimal Scene stub — TileGrid only calls scene.add(tile) in the constructor.
function makeScene(): Scene {
  return { add: () => {} } as unknown as Scene;
}

describe('TileGrid puddle state', () => {
  let grid: TileGrid;

  beforeEach(() => {
    grid = new TileGrid(makeScene());
  });

  it('defaults puddleDepth to 0 on all tiles', () => {
    expect(grid.getPuddleDepth(0, 0)).toBe(0);
    expect(grid.getPuddleDepth(5, 5)).toBe(0);
  });

  it('applyPuddleDeltas accumulates per tile, clamped to -elevation', () => {
    // Dig a hole at (0, 0) to elevation -3
    grid.setElevation(0, 0, -3);
    grid.applyPuddleDeltas([
      { col: 0, row: 0, depth: 2 },
    ]);
    expect(grid.getPuddleDepth(0, 0)).toBe(2);

    // Second wave deposits 5 more — should clamp to hole depth (3)
    grid.applyPuddleDeltas([
      { col: 0, row: 0, depth: 5 },
    ]);
    expect(grid.getPuddleDepth(0, 0)).toBe(3);
  });

  it('applyPuddleDeltas ignores tiles with non-negative elevation', () => {
    // Tile at (1, 1) is flat (elevation 0)
    grid.applyPuddleDeltas([
      { col: 1, row: 1, depth: 2 },
    ]);
    expect(grid.getPuddleDepth(1, 1)).toBe(0);
  });

  it('effectiveHoleDepth returns hole depth minus puddle', () => {
    grid.setElevation(2, 2, -4);
    grid.applyPuddleDeltas([{ col: 2, row: 2, depth: 1 }]);
    expect(grid.effectiveHoleDepth(2, 2)).toBe(3);
  });

  it('effectiveHoleDepth returns 0 for flat or wall tiles', () => {
    expect(grid.effectiveHoleDepth(0, 0)).toBe(0);
    grid.setElevation(1, 1, +2);
    expect(grid.effectiveHoleDepth(1, 1)).toBe(0);
  });
});
```

**Step 2: Run tests — verify they fail**

Run: `npm run test:unit`
Expected: failures with "getPuddleDepth is not a function" or similar.

**Step 3: Add `puddleDepth` field to Tile**

Edit `src/tile.ts`, in the `Tile` class declaration:

```typescript
export class Tile extends Actor {
  elevation: number = 0;
  puddleDepth: number = 0;
  waveHitCount: number = 0;
  // ...rest unchanged
```

**Step 4: Add TileGrid methods**

Edit `src/grid.ts`. Add this type at the top of the file (co-located with the class that uses it, per codestyle):

```typescript
export interface PuddleDelta {
  col: number;
  row: number;
  depth: number;
}
```

Add these methods to `TileGrid`:

```typescript
getPuddleDepth(col: number, row: number): number {
  return this.getTile(col, row)?.puddleDepth ?? 0;
}

effectiveHoleDepth(col: number, row: number): number {
  const tile = this.getTile(col, row);
  if (!tile) {
    return 0;
  }
  if (tile.elevation >= 0) {
    return 0;
  }
  return Math.max(0, (-tile.elevation) - tile.puddleDepth);
}

applyPuddleDeltas(deltas: PuddleDelta[]): void {
  for (const delta of deltas) {
    const tile = this.getTile(delta.col, delta.row);
    if (!tile) {
      continue;
    }
    if (tile.elevation >= 0) {
      continue;
    }
    const maxDepth = -tile.elevation;
    tile.puddleDepth = Math.min(maxDepth, tile.puddleDepth + delta.depth);
  }
}
```

**Step 5: Run tests — verify they pass**

Run: `npm run test:unit`
Expected: all green, including the new 5 tests.

**Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

**Step 7: Commit**

```bash
git add src/tile.ts src/grid.ts src/grid.test.ts
git commit -m "feat: add puddleDepth state and effectiveHoleDepth on TileGrid"
```

---

## Task 3: Refactor `simulateWave` → `simulateAdvance` with extended outputs

**Files:**
- Modify: `src/wave.ts` (rename + extend outputs)
- Modify: `src/wave.test.ts` (update imports + add tests)

**Goal:** Split today's `simulateWave` into a clearly-named `simulateAdvance` that emits the bookkeeping the recede pass will need. Behavior is unchanged on the existing output fields (`waveHeightMap`, `castleFlooded`); new fields are additive.

**Step 1: Define the new result interface as failing tests**

Add to `src/wave.test.ts`:

```typescript
import { simulateAdvance } from './wave';

describe('simulateAdvance new outputs', () => {
  it('records survivedAtMaxRow per column for unblocked flow', () => {
    const flat3x3 = [[0,0,0],[0,0,0],[0,0,0]];
    const result = simulateAdvance({
      elevations: flat3x3,
      columnHeights: [1, 1, 1],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
    });
    // All three columns still have full height when wave reaches row 2 (bottom)
    expect(result.survivedAtMaxRow).toEqual([1, 1, 1]);
  });

  it('records bounceBack when a wall fully blocks a column', () => {
    const grid = [
      [0, 0, 0],
      [0, 2, 0],
      [0, 0, 0],
    ];
    const result = simulateAdvance({
      elevations: grid,
      columnHeights: [0, 1, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
    });
    // Column 1's wave (height 1) hits wall +2 at row 1 → blocked → bouncesBack at row 1
    expect(result.bounceBack[1][1]).toBe(1);
    expect(result.survivedAtMaxRow[1]).toBe(0);
  });

  it('records puddleDelta when a hole absorbs wave water', () => {
    const grid = [
      [0, 0, 0],
      [0, -3, 0],
      [0, 0, 0],
    ];
    const result = simulateAdvance({
      elevations: grid,
      columnHeights: [0, 2, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,3,0],[0,0,0]],
    });
    // Hole at (1,1) absorbs wave height 2 (capped at hole depth 3)
    expect(result.puddleDelta[1][1]).toBe(2);
  });

  it('records wallErosionEvents: overtopped vs blocked', () => {
    const grid = [
      [0, 0, 0],
      [2, 5, 0],  // col 0 has wall +2 (overtopped by wave 3), col 1 has wall +5 (blocks wave 3)
      [0, 0, 0],
    ];
    const result = simulateAdvance({
      elevations: grid,
      columnHeights: [3, 3, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
    });
    expect(result.wallErosionEvents[1][0]).toBe('overtopped');
    expect(result.wallErosionEvents[1][1]).toBe('blocked');
  });
});
```

**Step 2: Run tests — verify they fail**

Run: `npm run test:unit`
Expected: failures — `simulateAdvance` doesn't exist yet.

**Step 3: Implement `simulateAdvance`**

Edit `src/wave.ts`. Replace the existing `simulateWave` signature with `simulateAdvance` taking an object argument. Keep helpers (`generateWaveCurve`, `waveHeightForLevel`, `wavesForLevel`) untouched.

Add at top of file, near the existing `WaveResult` interface:

```typescript
export type WallErosionEvent = 'overtopped' | 'blocked' | null;

export interface AdvanceInput {
  elevations: number[][];
  columnHeights: number[];
  castleCol: number;
  castleRow: number;
  maxRows: number;
  terrainSlope: number;
  /** Pre-computed effective hole depth (raw depth minus existing puddle) per tile. */
  effectiveHoleDepths: number[][];
}

export interface AdvanceResult {
  /** Wave height entering each cell before tile interaction. */
  waveHeightMap: number[][];
  /** Water bounced back upstream by a fully-blocking wall, indexed by [row][col]. */
  bounceBack: number[][];
  /** Per-column water still flowing at the deepest row the wave reached. */
  survivedAtMaxRow: number[];
  /** Water absorbed into holes this pass; will be added to puddleDepth post-wave. */
  puddleDelta: number[][];
  /** Wall interaction per tile this pass. */
  wallErosionEvents: WallErosionEvent[][];
  castleFlooded: boolean;
}
```

Replace `simulateWave` with:

```typescript
export function simulateAdvance(input: AdvanceInput): AdvanceResult {
  const { elevations, columnHeights, castleCol, castleRow, maxRows, terrainSlope, effectiveHoleDepths } = input;
  const numRows = elevations.length;
  const numCols = numRows > 0 ? elevations[0].length : 0;

  const columnWaveHeights: number[] = columnHeights.length === numCols
    ? columnHeights.slice()
    : new Array(numCols).fill(0);

  const waveHeightMap: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const bounceBack: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const puddleDelta: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const wallErosionEvents: WallErosionEvent[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(null));
  const survivedAtMaxRow: number[] = new Array(numCols).fill(0);

  let castleFlooded = false;
  let lastRowAnyActive = -1;

  const rowsToRun = Math.min(numRows, maxRows);
  for (let row = 0; row < rowsToRun; row++) {
    let anyActiveThisRow = false;
    for (let col = 0; col < numCols; col++) {
      waveHeightMap[row][col] = columnWaveHeights[col];
      if (columnWaveHeights[col] === 0) {
        continue;
      }
      anyActiveThisRow = true;

      const elev = terrainSlope + elevations[row][col];

      if (elev >= columnWaveHeights[col]) {
        // Fully blocked: water bounces back upstream as recede flow.
        bounceBack[row][col] = columnWaveHeights[col];
        if (elevations[row][col] > 0) {
          wallErosionEvents[row][col] = 'blocked';
        }
        columnWaveHeights[col] = 0;
      } else if (elev > 0) {
        // Overtopped: wall reduces wave height.
        columnWaveHeights[col] -= elev;
        if (elevations[row][col] > 0) {
          wallErosionEvents[row][col] = 'overtopped';
        }
      } else if (elev < 0) {
        const effDepth = effectiveHoleDepths[row][col];
        if (effDepth <= 0) {
          // Hole is saturated — water passes over puddle as if flat.
        } else if (effDepth >= columnWaveHeights[col]) {
          puddleDelta[row][col] = columnWaveHeights[col];
          columnWaveHeights[col] = 0;
        } else {
          puddleDelta[row][col] = effDepth;
          columnWaveHeights[col] -= effDepth;
        }
      }

      if (col === castleCol && row === castleRow && waveHeightMap[row][col] > 0) {
        castleFlooded = true;
      }
    }

    // Lateral spread (unchanged from existing logic).
    const spread = columnWaveHeights.slice();
    for (let col = 0; col < numCols; col++) {
      const h = columnWaveHeights[col];
      if (h <= 0) {
        continue;
      }
      for (const n of [col - 1, col + 1]) {
        if (n < 0 || n >= numCols) {
          continue;
        }
        if (columnWaveHeights[n] < h) {
          const spreadAmount = h * WAVE_SPREAD_FACTOR;
          const nElev = terrainSlope + elevations[row][n];
          if (nElev >= spreadAmount) {
            continue;
          }
          spread[n] = Math.max(spread[n], spreadAmount);
        }
      }
    }
    for (let col = 0; col < numCols; col++) {
      columnWaveHeights[col] = spread[col];
    }

    if (anyActiveThisRow) {
      lastRowAnyActive = row;
    }
  }

  // Capture survivedAtMaxRow as the column heights at the deepest active row.
  // If a column reached lastRowAnyActive but got blocked exactly there, survival = 0 (handled by bounceBack at that row).
  if (lastRowAnyActive >= 0) {
    for (let col = 0; col < numCols; col++) {
      survivedAtMaxRow[col] = columnWaveHeights[col];
    }
  }

  return { waveHeightMap, bounceBack, survivedAtMaxRow, puddleDelta, wallErosionEvents, castleFlooded };
}
```

**Step 4: Provide a thin compatibility shim for callers still using the old name**

Below `simulateAdvance` in `src/wave.ts`:

```typescript
/**
 * @deprecated Use simulateAdvance directly. Retained briefly so wave-animator
 * compiles during the multi-task refactor. Removed in Task 5.
 */
export function simulateWave(
  elevations: number[][],
  columnHeights: number[],
  castleCol: number,
  castleRow: number,
  maxRows: number,
  terrainSlope: number,
): WaveResult {
  const numRows = elevations.length;
  const numCols = numRows > 0 ? elevations[0].length : 0;
  const effectiveHoleDepths: number[][] = Array.from({ length: numRows }, (_, r) =>
    Array.from({ length: numCols }, (_, c) => elevations[r][c] < 0 ? -elevations[r][c] : 0),
  );
  const result = simulateAdvance({ elevations, columnHeights, castleCol, castleRow, maxRows, terrainSlope, effectiveHoleDepths });
  return { waveHeightMap: result.waveHeightMap, castleFlooded: result.castleFlooded };
}
```

**Step 5: Run all tests**

Run: `npm run test:unit`
Expected: all green — old `simulateWave` tests still pass via shim, new `simulateAdvance` tests pass.

**Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

**Step 7: Commit**

```bash
git add src/wave.ts src/wave.test.ts
git commit -m "refactor: extract simulateAdvance with extended outputs for recede pass"
```

---

## Task 4: Implement `simulateRecede`

**Files:**
- Modify: `src/wave.ts`
- Modify: `src/wave.test.ts`

**Goal:** A pure function that takes the advance result and replays the wave in reverse, producing a recede height map and any castle floods caused by lateral recede flow.

**Step 1: Write failing tests**

Add to `src/wave.test.ts`:

```typescript
import { simulateRecede } from './wave';

describe('simulateRecede', () => {
  const flat3x3 = [[0,0,0],[0,0,0],[0,0,0]];

  it('flat grid: water flows back through every row at full height', () => {
    const advance = simulateAdvance({
      elevations: flat3x3,
      columnHeights: [1, 1, 1],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
    });
    const recede = simulateRecede({
      elevations: flat3x3,
      survivedAtMaxRow: advance.survivedAtMaxRow,
      bounceBack: advance.bounceBack,
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
    });
    // Recede pass should mirror advance for a flat grid.
    expect(recede.recedeHeightMap[0]).toEqual([1, 1, 1]);
    expect(recede.recedeHeightMap[2]).toEqual([1, 1, 1]);
  });

  it('wall fully blocks advance: bounce-back recedes from wall row', () => {
    const grid = [
      [0, 0, 0],
      [0, 2, 0],
      [0, 0, 0],
    ];
    const advance = simulateAdvance({
      elevations: grid,
      columnHeights: [0, 1, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
    });
    const recede = simulateRecede({
      elevations: grid,
      survivedAtMaxRow: advance.survivedAtMaxRow,
      bounceBack: advance.bounceBack,
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
    });
    // Bounce-back at row 1 col 1 should appear in recede map at row 0 col 1
    expect(recede.recedeHeightMap[0][1]).toBe(1);
    // Row below the wall should be 0 (water never got there on advance)
    expect(recede.recedeHeightMap[2][1]).toBe(0);
  });

  it('hole absorbs full wave: nothing to recede in that column', () => {
    const grid = [
      [0, 0, 0],
      [0, -3, 0],
      [0, 0, 0],
    ];
    const advance = simulateAdvance({
      elevations: grid,
      columnHeights: [0, 2, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,3,0],[0,0,0]],
    });
    const recede = simulateRecede({
      elevations: grid,
      survivedAtMaxRow: advance.survivedAtMaxRow,
      bounceBack: advance.bounceBack,
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,3,0],[0,0,0]],
    });
    expect(recede.recedeHeightMap[0][1]).toBe(0);
    expect(recede.castleFloodedOnRecede).toBe(false);
  });

  it('castle bypassed on advance can flood via lateral recede spread', () => {
    // Castle at (1, 1). Hole at (1, 0) absorbs the wave in castle column on advance.
    // Adjacent col 0 passes through and recedes; lateral spread on recede pushes water into col 1.
    const grid = [
      [0, -2, 0],
      [0,  0, 0],
      [0,  0, 0],
    ];
    const effective = [
      [0, 2, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const advance = simulateAdvance({
      elevations: grid,
      columnHeights: [2, 2, 2],
      castleCol: 1,
      castleRow: 1,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: effective,
    });
    expect(advance.castleFlooded).toBe(false);
    const recede = simulateRecede({
      elevations: grid,
      survivedAtMaxRow: advance.survivedAtMaxRow,
      bounceBack: advance.bounceBack,
      castleCol: 1,
      castleRow: 1,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: effective,
    });
    expect(recede.castleFloodedOnRecede).toBe(true);
  });
});
```

**Step 2: Run tests — verify they fail**

Run: `npm run test:unit`
Expected: failures — `simulateRecede` doesn't exist.

**Step 3: Implement `simulateRecede`**

Append to `src/wave.ts`:

```typescript
export interface RecedeInput {
  elevations: number[][];
  survivedAtMaxRow: number[];
  bounceBack: number[][];
  castleCol: number;
  castleRow: number;
  maxRows: number;
  terrainSlope: number;
  effectiveHoleDepths: number[][];
}

export interface RecedeResult {
  /** Wave height passing through each cell during the recede pass. */
  recedeHeightMap: number[][];
  /** Additional puddle deltas accrued during recede (lateral flow into holes). */
  puddleDelta: number[][];
  castleFloodedOnRecede: boolean;
}

export function simulateRecede(input: RecedeInput): RecedeResult {
  const { elevations, survivedAtMaxRow, bounceBack, castleCol, castleRow, maxRows, terrainSlope, effectiveHoleDepths } = input;
  const numRows = elevations.length;
  const numCols = numRows > 0 ? elevations[0].length : 0;

  const columnWaveHeights: number[] = survivedAtMaxRow.slice();
  const recedeHeightMap: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const puddleDelta: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const effectiveHoleDepthsLocal = effectiveHoleDepths.map(row => row.slice());

  let castleFloodedOnRecede = false;
  const startRow = Math.min(numRows, maxRows) - 1;

  for (let row = startRow; row >= 0; row--) {
    // Inject water that bounced back from a wall at this row during advance.
    for (let col = 0; col < numCols; col++) {
      columnWaveHeights[col] += bounceBack[row][col];
    }

    for (let col = 0; col < numCols; col++) {
      recedeHeightMap[row][col] = columnWaveHeights[col];
      if (columnWaveHeights[col] === 0) {
        continue;
      }

      const elev = terrainSlope + elevations[row][col];

      if (elev >= columnWaveHeights[col]) {
        // Wall blocks recede — water is lost (no second bounce, by design).
        columnWaveHeights[col] = 0;
      } else if (elev > 0) {
        columnWaveHeights[col] -= elev;
      } else if (elev < 0) {
        const effDepth = effectiveHoleDepthsLocal[row][col];
        if (effDepth <= 0) {
          // Saturated hole — recede flows over puddle.
        } else if (effDepth >= columnWaveHeights[col]) {
          puddleDelta[row][col] += columnWaveHeights[col];
          effectiveHoleDepthsLocal[row][col] -= columnWaveHeights[col];
          columnWaveHeights[col] = 0;
        } else {
          puddleDelta[row][col] += effDepth;
          columnWaveHeights[col] -= effDepth;
          effectiveHoleDepthsLocal[row][col] = 0;
        }
      }

      if (col === castleCol && row === castleRow && recedeHeightMap[row][col] > 0) {
        castleFloodedOnRecede = true;
      }
    }

    // Lateral spread, same model as advance.
    const spread = columnWaveHeights.slice();
    for (let col = 0; col < numCols; col++) {
      const h = columnWaveHeights[col];
      if (h <= 0) {
        continue;
      }
      for (const n of [col - 1, col + 1]) {
        if (n < 0 || n >= numCols) {
          continue;
        }
        if (columnWaveHeights[n] < h) {
          const spreadAmount = h * WAVE_SPREAD_FACTOR;
          const nElev = terrainSlope + elevations[row][n];
          if (nElev >= spreadAmount) {
            continue;
          }
          spread[n] = Math.max(spread[n], spreadAmount);
        }
      }
    }
    for (let col = 0; col < numCols; col++) {
      columnWaveHeights[col] = spread[col];
    }
  }

  return { recedeHeightMap, puddleDelta, castleFloodedOnRecede };
}
```

**Step 4: Run tests**

Run: `npm run test:unit`
Expected: all green (including the 4 new recede tests).

**Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

**Step 6: Commit**

```bash
git add src/wave.ts src/wave.test.ts
git commit -m "feat: implement simulateRecede with lateral spread and castle flood detection"
```

---

## Task 5: Add orchestrator `simulateWave` (advance + recede combined)

**Files:**
- Modify: `src/wave.ts`
- Modify: `src/wave.test.ts`
- Modify: `src/wave-animator.ts` (update import — no behavior change yet)

**Goal:** Replace the deprecated `simulateWave` shim with a real orchestrator that runs advance, computes effective hole depths, runs recede, and returns a combined result containing both height maps and a unified `castleFlooded`.

**Step 1: Write failing tests for the combined result**

Add to `src/wave.test.ts`:

```typescript
describe('simulateWave orchestrator', () => {
  it('returns advance and recede maps plus combined castleFlooded', () => {
    const flat3x3 = [[0,0,0],[0,0,0],[0,0,0]];
    const result = simulateWave({
      elevations: flat3x3,
      puddleDepths: [[0,0,0],[0,0,0],[0,0,0]],
      columnHeights: [1, 1, 1],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
    });
    expect(result.advanceHeightMap[0]).toEqual([1, 1, 1]);
    expect(result.recedeHeightMap[0]).toEqual([1, 1, 1]);
    expect(result.castleFlooded).toBe(true);
  });

  it('sums advance + recede puddle deltas per tile', () => {
    const grid = [
      [0, 0, 0],
      [0, -3, 0],
      [0, 0, 0],
    ];
    const result = simulateWave({
      elevations: grid,
      puddleDepths: [[0,0,0],[0,0,0],[0,0,0]],
      columnHeights: [0, 2, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
    });
    // Advance absorbs 2 into the hole; recede has no source in that column.
    expect(result.puddleDelta[1][1]).toBe(2);
  });
});
```

**Step 2: Run tests — verify they fail**

Run: `npm run test:unit`
Expected: failures — new `simulateWave` signature doesn't exist.

**Step 3: Replace the deprecated shim with the orchestrator**

Edit `src/wave.ts`. Delete the deprecated `simulateWave` shim from Task 3 and the old `WaveResult` interface. Replace with:

```typescript
export interface SimulateWaveInput {
  elevations: number[][];
  /** Current puddleDepth on each tile, used to derive effective hole depth. */
  puddleDepths: number[][];
  columnHeights: number[];
  castleCol: number;
  castleRow: number;
  maxRows: number;
  terrainSlope: number;
}

export interface WaveResult {
  advanceHeightMap: number[][];
  recedeHeightMap: number[][];
  /** Combined puddle deltas from both passes; apply to grid post-wave. */
  puddleDelta: number[][];
  wallErosionEvents: WallErosionEvent[][];
  castleFlooded: boolean;
}

export function simulateWave(input: SimulateWaveInput): WaveResult {
  const { elevations, puddleDepths, columnHeights, castleCol, castleRow, maxRows, terrainSlope } = input;
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
    castleCol,
    castleRow,
    maxRows,
    terrainSlope,
    effectiveHoleDepths,
  });

  // Subtract advance puddle deltas from effective hole depths before recede.
  const effectiveAfterAdvance = effectiveHoleDepths.map((row, r) =>
    row.map((d, c) => Math.max(0, d - advance.puddleDelta[r][c])),
  );

  const recede = simulateRecede({
    elevations,
    survivedAtMaxRow: advance.survivedAtMaxRow,
    bounceBack: advance.bounceBack,
    castleCol,
    castleRow,
    maxRows,
    terrainSlope,
    effectiveHoleDepths: effectiveAfterAdvance,
  });

  const puddleDelta: number[][] = advance.puddleDelta.map((row, r) =>
    row.map((v, c) => v + recede.puddleDelta[r][c]),
  );

  return {
    advanceHeightMap: advance.waveHeightMap,
    recedeHeightMap: recede.recedeHeightMap,
    puddleDelta,
    wallErosionEvents: advance.wallErosionEvents,
    castleFlooded: advance.castleFlooded || recede.castleFloodedOnRecede,
  };
}
```

**Step 4: Update existing baseline tests to use the new shape**

In `src/wave.test.ts`, the old `describe('simulateWave (current behavior)')` block calls `simulateWave(elevations, columnHeights, ...)` positional-arg style. Update them to use the new object-arg shape and `result.advanceHeightMap` (instead of `result.waveHeightMap`). Example:

```typescript
const result = simulateWave({
  elevations: flat3x3,
  puddleDepths: [[0,0,0],[0,0,0],[0,0,0]],
  columnHeights: [1, 1, 1],
  castleCol: 1,
  castleRow: 2,
  maxRows: 3,
  terrainSlope: 0,
});
expect(result.advanceHeightMap[0]).toEqual([1, 1, 1]);
```

Apply this change to all 5 existing baseline tests.

**Step 5: Update `wave-animator.ts` to the new API**

In `src/wave-animator.ts`:

- The import `import { simulateWave, WaveResult, generateWaveCurve } from './wave';` stays.
- Replace the call `simulateWave(elevations, columnHeights, CASTLE_COL, CASTLE_ROW, GRID_HEIGHT, TERRAIN_SLOPE)` with:

```typescript
const puddleDepths: number[][] = elevations.map((row, r) =>
  row.map((_, c) => this.grid.getPuddleDepth(c, r)),
);
const result = simulateWave({
  elevations,
  puddleDepths,
  columnHeights,
  castleCol: CASTLE_COL,
  castleRow: CASTLE_ROW,
  maxRows: GRID_HEIGHT,
  terrainSlope: TERRAIN_SLOPE,
});
```

- Replace all references to `result.waveHeightMap` with `result.advanceHeightMap` (animator still only animates advance in this task — recede animation is Task 9).

**Step 6: Update `level.ts` to the new `castleFlooded` API**

`level.ts` already uses `result.castleFlooded` directly — keep as is. But `applyErosion(result.waveHeightMap)` must become `applyErosion(result.advanceHeightMap)` for now. (Task 7 will extend erosion to recede.)

**Step 7: Run all checks**

Run: `npm run test:unit && npx tsc --noEmit && npm run build`
Expected: green build, all tests pass.

**Step 8: Commit**

```bash
git add src/wave.ts src/wave.test.ts src/wave-animator.ts src/level.ts
git commit -m "feat: simulateWave runs advance and recede; combined result with both height maps"
```

---

## Task 6: Apply puddle deltas to grid after wave

**Files:**
- Modify: `src/wave-animator.ts` OR `src/level.ts` (whichever owns post-wave application)
- Modify: `src/grid.test.ts` (extend)

**Goal:** Wire `result.puddleDelta` into the grid via `TileGrid.applyPuddleDeltas`. After this task, holes that absorb water keep that water permanently across waves and levels.

**Step 1: Write failing integration test in grid.test.ts**

Add to `src/grid.test.ts`:

```typescript
import { simulateWave } from './wave';

describe('puddle persistence across waves', () => {
  it('second wave sees reduced hole capacity from first wave puddle', () => {
    const grid = new TileGrid(makeScene());
    grid.setElevation(1, 1, -3);
    // Wave 1: small wave should be absorbed and leave puddle
    const wave1 = simulateWave({
      elevations: grid.getElevations(),
      puddleDepths: gridToPuddleArray(grid),
      columnHeights: [0, 2, 0],
      castleCol: 1, castleRow: 2, maxRows: 3, terrainSlope: 0,
    });
    grid.applyPuddleDeltas(deltasFromMap(wave1.puddleDelta));
    expect(grid.getPuddleDepth(1, 1)).toBe(2);

    // Wave 2: same shape — hole has effective depth 1 now
    const wave2 = simulateWave({
      elevations: grid.getElevations(),
      puddleDepths: gridToPuddleArray(grid),
      columnHeights: [0, 2, 0],
      castleCol: 1, castleRow: 2, maxRows: 3, terrainSlope: 0,
    });
    // Wave continues onward with height 1 (2 - effective depth 1)
    expect(wave2.advanceHeightMap[2][1]).toBe(1);
  });
});

function gridToPuddleArray(grid: TileGrid): number[][] {
  const elevs = grid.getElevations();
  return elevs.map((row, r) => row.map((_, c) => grid.getPuddleDepth(c, r)));
}

function deltasFromMap(map: number[][]): { col: number; row: number; depth: number }[] {
  const out: { col: number; row: number; depth: number }[] = [];
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      if (map[r][c] > 0) {
        out.push({ col: c, row: r, depth: map[r][c] });
      }
    }
  }
  return out;
}
```

Note: this test uses the real `TileGrid` with the default 16×16 dimensions (no Excalibur scene rendering). The 3-column example targets only tiles in the upper-left corner; the rest of the grid stays flat. Test assertions only inspect the cells they care about.

**Step 2: Run tests — verify they fail**

Run: `npm run test:unit`
Expected: wave 2 fails its assertion — puddle isn't being applied yet.

**Step 3: Apply puddle deltas in `level.ts` after each wave**

Edit `src/level.ts` `runWavePhase`, after `applyErosion`:

```typescript
const puddleDeltas: { col: number; row: number; depth: number }[] = [];
for (let r = 0; r < result.puddleDelta.length; r++) {
  for (let c = 0; c < result.puddleDelta[r].length; c++) {
    if (result.puddleDelta[r][c] > 0) {
      puddleDeltas.push({ col: c, row: r, depth: result.puddleDelta[r][c] });
    }
  }
}
this.grid.applyPuddleDeltas(puddleDeltas);
```

**Step 4: Run tests**

Run: `npm run test:unit && npx tsc --noEmit`
Expected: all green.

**Step 5: Build & manual smoke**

Run: `npm run build`
Expected: clean build.

**Step 6: Commit**

```bash
git add src/grid.test.ts src/level.ts
git commit -m "feat: persist puddle deltas to grid after each wave"
```

---

## Task 7: Extend erosion to recede pass

**Files:**
- Modify: `src/grid.ts` (extend `applyErosion`)
- Modify: `src/grid.test.ts`
- Modify: `src/level.ts`

**Goal:** A tile that has water > 0 on advance OR recede accrues a hit. Tiles hit on both passes count twice.

**Step 1: Write failing tests**

Add to `src/grid.test.ts`:

```typescript
describe('applyErosion both passes', () => {
  it('increments hit count for advance-only tiles, recede-only tiles, and both', () => {
    const grid = new TileGrid(makeScene());
    grid.setElevation(0, 0, 2);  // wall, needs hits
    grid.setElevation(1, 0, 2);
    grid.setElevation(2, 0, 2);

    const advance = [
      [3, 0, 3],  // (0,0) and (2,0) hit on advance, (1,0) not
      [0, 0, 0],
    ];
    const recede = [
      [0, 3, 3],  // (1,0) and (2,0) hit on recede, (0,0) not
      [0, 0, 0],
    ];

    grid.applyErosion(advance, recede);
    expect(grid.getTile(0, 0)!.waveHitCount).toBe(1);
    expect(grid.getTile(1, 0)!.waveHitCount).toBe(1);
    expect(grid.getTile(2, 0)!.waveHitCount).toBe(2);
  });
});
```

**Step 2: Run tests — verify they fail**

Run: `npm run test:unit`
Expected: `applyErosion` signature mismatch.

**Step 3: Extend `applyErosion`**

In `src/grid.ts`, change the signature:

```typescript
applyErosion(advanceMap: number[][], recedeMap: number[][]): Tile[] {
  const erodedTiles: Tile[] = [];
  for (let row = 0; row < advanceMap.length; row++) {
    for (let col = 0; col < advanceMap[row].length; col++) {
      const tile = this.getTile(col, row);
      if (!tile) {
        continue;
      }
      if (tile.isCastle) {
        continue;
      }
      let hits = 0;
      if (advanceMap[row][col] - tile.elevation >= 2) {
        hits++;
      }
      if (recedeMap[row][col] - tile.elevation >= 2) {
        hits++;
      }
      if (hits === 0) {
        continue;
      }
      tile.waveHitCount += hits;
      while (tile.waveHitCount >= 3) {
        if (tile.elevation > 0) {
          this.setElevation(col, row, -1);
          erodedTiles.push(tile);
        } else if (tile.elevation < 0) {
          this.setElevation(col, row, +1);
          erodedTiles.push(tile);
        } else {
          break;
        }
        tile.waveHitCount -= 3;
      }
    }
  }
  return erodedTiles;
}
```

**Step 4: Update caller**

In `src/level.ts` `runWavePhase`, change:

```typescript
const erodedTiles = this.grid.applyErosion(result.advanceHeightMap, result.recedeHeightMap);
```

**Step 5: Run tests + typecheck**

Run: `npm run test:unit && npx tsc --noEmit`
Expected: all green.

**Step 6: Commit**

```bash
git add src/grid.ts src/grid.test.ts src/level.ts
git commit -m "feat: applyErosion accepts advance and recede maps; tiles hit on both count twice"
```

---

## Task 8: Sand redistribution from wallErosionEvents

**Files:**
- Modify: `src/grid.ts` (new method `applySandRedistribution`)
- Modify: `src/grid.test.ts`
- Modify: `src/level.ts`
- Modify: `src/config.ts` (new flag, see below)

**Goal:** For every `'overtopped'` or `'blocked'` wall event, drop the wall by 1 and raise the tile directly above (row - 1) by 1. Sand falls off the top of the grid if no upstream tile exists. Sand is also lost if the upstream tile is already at `MAX_ELEVATION`.

**Step 1: Write failing tests**

Add to `src/grid.test.ts`:

```typescript
describe('applySandRedistribution', () => {
  it('moves sand from overtopped wall to upstream tile', () => {
    const grid = new TileGrid(makeScene());
    grid.setElevation(5, 3, +2);  // wall
    const events: import('./wave').WallErosionEvent[][] = Array.from({ length: 16 }, () => new Array(16).fill(null));
    events[3][5] = 'overtopped';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 3)).toBe(1);  // wall dropped
    expect(grid.getElevation(5, 2)).toBe(1);  // upstream raised
  });

  it('also redistributes from blocked walls', () => {
    const grid = new TileGrid(makeScene());
    grid.setElevation(5, 3, +3);
    const events: import('./wave').WallErosionEvent[][] = Array.from({ length: 16 }, () => new Array(16).fill(null));
    events[3][5] = 'blocked';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 3)).toBe(2);
    expect(grid.getElevation(5, 2)).toBe(1);
  });

  it('drops sand off top edge when wall is in row 0', () => {
    const grid = new TileGrid(makeScene());
    grid.setElevation(5, 0, +2);
    const events: import('./wave').WallErosionEvent[][] = Array.from({ length: 16 }, () => new Array(16).fill(null));
    events[0][5] = 'overtopped';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 0)).toBe(1);
    // No row -1 to raise. Sand is lost.
  });

  it('drops sand into existing hole upstream (fills by 1)', () => {
    const grid = new TileGrid(makeScene());
    grid.setElevation(5, 3, +2);
    grid.setElevation(5, 2, -1);
    const events: import('./wave').WallErosionEvent[][] = Array.from({ length: 16 }, () => new Array(16).fill(null));
    events[3][5] = 'overtopped';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 3)).toBe(1);
    expect(grid.getElevation(5, 2)).toBe(0);
  });

  it('skips castle tile', () => {
    const grid = new TileGrid(makeScene());
    // Castle is at CASTLE_COL=8, CASTLE_ROW=10. Place a wall there in events; should be ignored.
    const events: import('./wave').WallErosionEvent[][] = Array.from({ length: 16 }, () => new Array(16).fill(null));
    events[10][8] = 'overtopped';
    grid.applySandRedistribution(events);
    // Castle elevation untouched
    expect(grid.getTile(8, 10)!.elevation).toBe(0);
  });
});
```

**Step 2: Run tests — verify they fail**

Run: `npm run test:unit`
Expected: `applySandRedistribution` does not exist.

**Step 3: Implement method**

Add to `TileGrid` in `src/grid.ts`. Import `WallErosionEvent` from `./wave`:

```typescript
import { WallErosionEvent } from './wave';
```

Method:

```typescript
applySandRedistribution(events: WallErosionEvent[][]): void {
  for (let row = 0; row < events.length; row++) {
    for (let col = 0; col < events[row].length; col++) {
      if (events[row][col] === null) {
        continue;
      }
      const wall = this.getTile(col, row);
      if (!wall || wall.isCastle) {
        continue;
      }
      // Drop wall by 1.
      this.setElevation(col, row, -1);

      // Raise tile directly upstream (row - 1) if it exists and isn't at the cap.
      const upstream = this.getTile(col, row - 1);
      if (!upstream || upstream.isCastle) {
        continue;
      }
      if (upstream.elevation >= MAX_ELEVATION) {
        continue;
      }
      this.setElevation(col, row - 1, +1);
    }
  }
}
```

(`MAX_ELEVATION` is already imported in `grid.ts`.)

**Step 4: Call from `level.ts`**

In `runWavePhase`, after `applyPuddleDeltas`:

```typescript
this.grid.applySandRedistribution(result.wallErosionEvents);
```

**Step 5: Run tests + typecheck + build**

Run: `npm run test:unit && npx tsc --noEmit && npm run build`
Expected: all green.

**Step 6: Commit**

```bash
git add src/grid.ts src/grid.test.ts src/level.ts
git commit -m "feat: sand redistribution drops wall and raises upstream tile per wave"
```

---

## Task 9: Animate the recede pass in WaveAnimator

**Files:**
- Modify: `src/wave-animator.ts`
- Modify: `src/config.ts` (add `WAVE_RECEDE_ROW_DELAY_MS`)

**Goal:** After the advance animation completes (existing), play a row-by-row recede animation using `result.recedeHeightMap`. Recede plays bottom-up. Clear advance overlays in front of the receding wave so the trailing edge looks like it's draining.

**Step 1: Add config constant**

Edit `src/config.ts`:

```typescript
/** Milliseconds of delay between each row of the recede animation. Slightly faster than advance for drain feel. */
export const WAVE_RECEDE_ROW_DELAY_MS = 90;
```

**Step 2: Update WaveAnimator animate() to play recede**

Edit `src/wave-animator.ts`:

1. Import the new constant.
2. After the existing advance row loop (the `for (let row = 0; row < animRows; row++)` loop) and before the column-top labels block, add a recede animation block.
3. Track overlays per row so we can fade them as the recede passes through.

Sketch of the new structure inside `animate(waveHeight)`:

```typescript
// Track advance overlays per row for trailing-edge fade.
const advanceOverlaysByRow: Actor[][] = Array.from({ length: GRID_HEIGHT }, () => []);

// 1. Advance: same as today, but capture overlay per row.
for (let row = 0; row < animRows; row++) {
  await this.delay(WAVE_ROW_DELAY_MS);
  for (let col = 0; col < GRID_WIDTH; col++) {
    if (result.advanceHeightMap[row][col] <= 0) {
      continue;
    }
    const hillEvent = getHillEvent(row, col, elevations, result.advanceHeightMap, animRows);
    if (hillEvent === 'blocked') {
      this.spawnBlockFlash(col, row);
    } else {
      const overlay = this.spawnOverlay(col, row, result.advanceHeightMap[row][col]);
      advanceOverlaysByRow[row].push(overlay);
      if (hillEvent === 'overtopped') {
        this.spawnOvertopBar(col, row);
      }
    }
  }
}

// 1b. Recede: bottom-up. Fade advance overlays in row as recede passes.
for (let row = animRows - 1; row >= 0; row--) {
  await this.delay(WAVE_RECEDE_ROW_DELAY_MS);
  for (const a of advanceOverlaysByRow[row]) {
    a.actions.fade(0, 120);
  }
  for (let col = 0; col < GRID_WIDTH; col++) {
    if (result.recedeHeightMap[row][col] <= 0) {
      continue;
    }
    this.spawnRecedeOverlay(col, row, result.recedeHeightMap[row][col]);
  }
}
```

Required tweak: `spawnOverlay` currently returns void. Change its return type to `Actor` and return the actor (so it can be pushed into the row tracker). Add a new `spawnRecedeOverlay` method that mirrors `spawnOverlay` but uses a slightly different color (e.g. greener tint) to indicate "draining":

```typescript
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
    width: TILE_SIZE - 1,
    height: TILE_SIZE - 1,
    color,
  });
  this.scene.add(actor);
  this.overlayActors.push(actor);
  actor.actions.fade(0, 180);
  return actor;
}
```

**Step 3: Verify build + typecheck**

Run: `npm run test:unit && npx tsc --noEmit && npm run build`
Expected: clean.

**Step 4: Manual smoke (dev server)**

Run: `npm run dev` in a separate terminal. Click play. Trigger a wave. Verify:
- Wave advances top-down as before.
- After advance completes, water recedes bottom-up with a noticeably different tint.
- Existing column-top height labels still appear.
- Castle flash still works when flooded.

Note: this is a visual change. Playwright baselines will fail and need updating in Task 11.

**Step 5: Commit**

```bash
git add src/wave-animator.ts src/config.ts
git commit -m "feat: animate the recede pass after advance with distinct tint"
```

---

## Task 10: Visual — persistent puddle overlay + sand-puff effect

**Files:**
- Modify: `src/tile.ts` (puddle overlay)
- Modify: `src/wave-animator.ts` (sand-puff)

**Goal:**
- Holes with `puddleDepth > 0` show a persistent translucent blue fill matching depth (deeper puddle = more opaque blue).
- When sand is redistributed, briefly flash both the eroded wall tile and the upstream-deposit tile with a sandy color to make the effect legible.

**Step 1: Puddle overlay in Tile.updateVisual()**

In `src/tile.ts`, at the end of `updateVisual()` (after the existing canvas/rectangle is assigned), if the tile has `puddleDepth > 0`, layer a translucent blue rect on top. The simplest path is to extend the existing `Canvas` draw function to also draw the puddle when relevant.

Edit the `else` branch (hole rendering) inside the `Canvas` `draw` callback. After the existing diffuse-edge fills, before the closing brace of `else`, add:

```typescript
// Persistent puddle overlay
if (puddleDepth > 0 && elevation < 0) {
  const puddleAlpha = 0.25 + (puddleDepth / -elevation) * 0.45;  // up to ~0.7
  ctx.fillStyle = `rgba(60, 130, 200, ${puddleAlpha})`;
  ctx.fillRect(2, 2, size - 5, size - 5);
}
```

Capture `puddleDepth` from `this.puddleDepth` into a local variable before the `Canvas` definition so it's in closure scope (mirror the existing `elevation` pattern at the top of `updateVisual`).

Also: `setElevation` in `TileGrid` already calls `updateVisual`. Extend `applyPuddleDeltas` in `grid.ts` to also call `tile.updateVisual()` after mutating `puddleDepth`:

```typescript
applyPuddleDeltas(deltas: PuddleDelta[]): void {
  for (const delta of deltas) {
    const tile = this.getTile(delta.col, delta.row);
    if (!tile) { continue; }
    if (tile.elevation >= 0) { continue; }
    const maxDepth = -tile.elevation;
    tile.puddleDepth = Math.min(maxDepth, tile.puddleDepth + delta.depth);
    tile.updateVisual();
  }
}
```

**Step 2: Verify puddle test still passes**

Run: `npm run test:unit`
Expected: all green. (The grid.test cases call `updateVisual` indirectly — the stub Scene's `add` is a no-op, but `updateVisual` reaches into `Canvas`/`Resources`. If this fails, we may need to mock `Resources.Castle.toSprite()`. Try the simple change first; fall back to mocking only if needed.)

Note: if running these tests in node breaks because of Canvas/Resources, scope updateVisual calls to grid.test scenarios that don't construct castle tiles, or add a guard `if (typeof window !== 'undefined' && this.graphics)` in `Tile.updateVisual`. Keep this lightweight — the goal is to enable rendering, not perfect headless support.

**Step 3: Sand-puff effect**

In `src/wave-animator.ts`, add a public method:

```typescript
async flashSandRedistribution(events: import('./wave').WallErosionEvent[][]): Promise<void> {
  const actors: Actor[] = [];
  for (let row = 0; row < events.length; row++) {
    for (let col = 0; col < events[row].length; col++) {
      if (events[row][col] === null) {
        continue;
      }
      // Flash the wall tile and the upstream tile briefly with a sandy color.
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
```

**Step 4: Call from level.ts after applySandRedistribution**

In `runWavePhase`:

```typescript
this.grid.applySandRedistribution(result.wallErosionEvents);
await this.waveAnimator.flashSandRedistribution(result.wallErosionEvents);
```

**Step 5: Build + manual smoke**

Run: `npm run build && npm run dev`
Verify:
- Dig a hole, let a small wave hit it → after the wave, the hole shows a blue puddle that persists across waves and levels.
- Build a wall, let a wave overtop it → after the wave, the wall tile shows a sandy flash, and the tile above is raised by 1.

**Step 6: Commit**

```bash
git add src/tile.ts src/grid.ts src/wave-animator.ts src/level.ts
git commit -m "feat: persistent puddle overlay and sand-puff effect on redistribution"
```

---

## Task 11: Update Playwright baselines and final validation

**Files:**
- Modify: `tests/main.spec.ts-snapshots/*` (regenerate)
- Run full test pipeline

**Step 1: Regenerate Playwright snapshots**

Run: `npm run test:integration-update`
Expected: snapshots update successfully against the new visuals.

**Step 2: Full test pipeline**

Run: `npm test`
Expected: unit tests pass, build clean, Playwright tests pass against new baselines.

**Step 3: Manual playthrough sanity check**

Run: `npm run dev`. Play 5 levels manually:
- Verify puddles persist across levels.
- Verify walls migrate upstream over time (sand redistribution).
- Verify erosion is roughly twice as aggressive as before.
- Verify no crashes when castle floods on advance or recede.

**Step 4: Commit baselines**

```bash
git add tests/main.spec.ts-snapshots/
git commit -m "test: update Playwright baselines for wave recede animation"
```

---

## Out of scope (deferred follow-ups)

- **Scoop interaction with puddle tiles** — for now, scooping a puddle tile works normally (lowers elevation, increases max puddle capacity). Player can dump sand on a puddle tile to raise it; the puddle stays capped at `-elevation` so raising the floor automatically reduces puddle depth via the clamp in `applyPuddleDeltas`. Worth revisiting if it feels off.
- **Recede water vanishing at blocking walls** — current model drops water that hits a wall on the way back. Alternative would be re-pooling, which needs a "standing water on flat tile" concept. Defer.
- **MAX_ELEVATION cap on sand-deposit tile** — sand is silently lost when upstream tile is capped. Acceptable for now.
- **Conservation invariant test** — left as a manual sanity check during development, not enforced in code.
