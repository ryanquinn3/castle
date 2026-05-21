# Flow Field Wave Simulation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the column-based wave simulation with a hybrid cell-based flow field that models water momentum, lateral flow around obstacles, and pressure buildup in enclosed spaces.

**Architecture:** New `src/flow-field.ts` module owns the cell-based simulation. Each cell tracks water level, momentum vector, and pressure. The simulation runs in three phases: row-by-row injection (preserving current wave feel), per-row equalization passes (lateral flow driven by height differentials + momentum + pressure), and reverse recede. `src/wave.ts` orchestrates by calling the flow field and packaging results into the existing `WaveResult` interface (extended with per-frame snapshots for animation). The wave animator iterates frames instead of single height maps.

**Tech Stack:** TypeScript, Vitest, Excalibur.js

---

### Task 1: Add flow field config constants

**Files:**
- Modify: `src/config.ts`

**Step 1: Add the constants**

Add after the existing `WAVE_SPREAD_FACTOR` line:

```typescript
/** Number of equalization steps to run after each row injection. More steps = more lateral spread per row. */
export const FLOW_EQUALIZATION_STEPS = 4;
/** Fraction of water level differential that flows to a neighbor per equalization step. */
export const FLOW_RATE = 0.25;
/** Momentum decays by this factor each equalization step. 0 = instant stop, 1 = no decay. */
export const MOMENTUM_DECAY = 0.8;
/** Fraction of momentum that transfers to perpendicular axes when water hits a wall. */
export const MOMENTUM_REDIRECT_FACTOR = 0.6;
/** Pressure increments by this amount per equalization step when a cell has no outflow. */
export const PRESSURE_BUILDUP_RATE = 0.3;
/** Pressure is added to effective water level when checking if water can overtop a wall. */
export const PRESSURE_OVERTOP_FACTOR = 0.5;
/** Minimum water level to consider a cell "wet" (avoids float dust). */
export const FLOW_MIN_WATER = 0.01;
```

**Step 2: Build and typecheck**

Run: `rtk npm run build`
Expected: Clean build.

**Step 3: Commit**

```bash
rtk git add src/config.ts && rtk git commit -m "feat: add flow field tuning constants"
```

---

### Task 2: Flow cell types and grid initialization

**Files:**
- Create: `src/flow-field.ts`
- Create: `src/flow-field.test.ts`

**Step 1: Write test for grid initialization**

```typescript
import { describe, it, expect } from 'vitest';
import { createFlowGrid, FlowCell } from './flow-field';

describe('createFlowGrid', () => {
  it('creates a grid of cells matching input dimensions', () => {
    const grid = createFlowGrid(3, 4);
    expect(grid.length).toBe(4);
    expect(grid[0].length).toBe(3);
  });

  it('initializes all cells with zero water, momentum, and pressure', () => {
    const grid = createFlowGrid(2, 2);
    for (const row of grid) {
      for (const cell of row) {
        expect(cell.waterLevel).toBe(0);
        expect(cell.momentum).toEqual({ dx: 0, dy: 0 });
        expect(cell.pressure).toBe(0);
      }
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: FAIL -- module not found.

**Step 3: Write implementation**

```typescript
export interface FlowCell {
  waterLevel: number;
  momentum: { dx: number; dy: number };
  pressure: number;
}

export function createFlowGrid(cols: number, rows: number): FlowCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      waterLevel: 0,
      momentum: { dx: 0, dy: 0 },
      pressure: 0,
    })),
  );
}
```

**Step 4: Run test to verify it passes**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: PASS.

**Step 5: Build and typecheck**

Run: `rtk npm run build`
Expected: Clean build.

**Step 6: Commit**

```bash
rtk git add src/flow-field.ts src/flow-field.test.ts && rtk git commit -m "feat: flow cell types and grid factory"
```

---

### Task 3: Row injection

Deposit water from the wave curve into a single row of the flow grid. Each cell gets the column's wave height as `waterLevel` and initial downward momentum.

**Files:**
- Modify: `src/flow-field.ts`
- Modify: `src/flow-field.test.ts`

**Step 1: Write test for injection**

```typescript
import { injectRow } from './flow-field';

describe('injectRow', () => {
  it('deposits column heights as water into the specified row', () => {
    const grid = createFlowGrid(3, 3);
    const elevations = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    injectRow({
      grid,
      row: 0,
      columnHeights: [2, 3, 1],
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    });
    expect(grid[0][0].waterLevel).toBe(2);
    expect(grid[0][1].waterLevel).toBe(3);
    expect(grid[0][2].waterLevel).toBe(1);
  });

  it('sets downward momentum proportional to water level', () => {
    const grid = createFlowGrid(3, 3);
    const elevations = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    injectRow({
      grid,
      row: 0,
      columnHeights: [2, 0, 1],
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    });
    expect(grid[0][0].momentum.dy).toBeGreaterThan(0);
    expect(grid[0][0].momentum.dx).toBe(0);
    expect(grid[0][1].momentum.dy).toBe(0);
  });

  it('wall taller than incoming water blocks injection', () => {
    const grid = createFlowGrid(3, 3);
    const elevations = [[0, 5, 0], [0, 0, 0], [0, 0, 0]];
    injectRow({
      grid,
      row: 0,
      columnHeights: [0, 3, 0],
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    });
    expect(grid[0][1].waterLevel).toBe(0);
  });

  it('wall shorter than incoming water reduces water level', () => {
    const grid = createFlowGrid(3, 3);
    const elevations = [[0, 2, 0], [0, 0, 0], [0, 0, 0]];
    injectRow({
      grid,
      row: 0,
      columnHeights: [0, 5, 0],
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    });
    expect(grid[0][1].waterLevel).toBe(3);
  });

  it('hole absorbs water up to effective depth', () => {
    const grid = createFlowGrid(3, 3);
    const elevations = [[0, -4, 0], [0, 0, 0], [0, 0, 0]];
    injectRow({
      grid,
      row: 0,
      columnHeights: [0, 3, 0],
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 3, 0], [0, 0, 0], [0, 0, 0]],
    });
    expect(grid[0][1].waterLevel).toBe(0);
  });

  it('hole shallower than wave absorbs partial water', () => {
    const grid = createFlowGrid(3, 3);
    const elevations = [[0, -1, 0], [0, 0, 0], [0, 0, 0]];
    injectRow({
      grid,
      row: 0,
      columnHeights: [0, 3, 0],
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 1, 0], [0, 0, 0], [0, 0, 0]],
    });
    expect(grid[0][1].waterLevel).toBe(2);
  });

  it('terrain slope reduces incoming water', () => {
    const grid = createFlowGrid(3, 3);
    const elevations = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    injectRow({
      grid,
      row: 0,
      columnHeights: [0, 3, 0],
      elevations,
      terrainSlope: 0.5,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    });
    expect(grid[0][1].waterLevel).toBe(2.5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: FAIL -- `injectRow` not found.

**Step 3: Write implementation**

Add to `src/flow-field.ts`:

```typescript
import { FLOW_MIN_WATER } from './config';

export interface InjectRowInput {
  grid: FlowCell[][];
  row: number;
  columnHeights: number[];
  elevations: number[][];
  terrainSlope: number;
  effectiveHoleDepths: number[][];
}

export interface InjectRowResult {
  puddleDelta: number[];
  wallEvents: WallEvent[];
  blocked: boolean[];
}

export type WallEvent = 'overtopped' | 'blocked' | null;

export function injectRow(input: InjectRowInput): InjectRowResult {
  const { grid, row, columnHeights, elevations, terrainSlope, effectiveHoleDepths } = input;
  const numCols = grid[0].length;
  const puddleDelta = new Array(numCols).fill(0);
  const wallEvents: WallEvent[] = new Array(numCols).fill(null);
  const blocked = new Array(numCols).fill(false);

  for (let col = 0; col < numCols; col++) {
    let incoming = columnHeights[col];
    if (incoming <= 0) {
      continue;
    }

    const elev = terrainSlope + elevations[row][col];

    if (elev >= incoming) {
      blocked[col] = true;
      if (elevations[row][col] > 0) {
        wallEvents[col] = 'blocked';
      }
      continue;
    }

    if (elev > 0) {
      incoming -= elev;
      if (elevations[row][col] > 0) {
        wallEvents[col] = 'overtopped';
      }
    } else if (elev < 0) {
      const depth = effectiveHoleDepths[row][col];
      if (depth >= incoming) {
        puddleDelta[col] = incoming;
        incoming = 0;
      } else if (depth > 0) {
        puddleDelta[col] = depth;
        incoming -= depth;
      }
    }

    if (incoming < FLOW_MIN_WATER) {
      continue;
    }

    grid[row][col].waterLevel += incoming;
    grid[row][col].momentum.dy = incoming;
    grid[row][col].momentum.dx = 0;
  }

  return { puddleDelta, wallEvents, blocked };
}
```

**Step 4: Run test to verify it passes**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: PASS.

**Step 5: Build and typecheck**

Run: `rtk npm run build`

**Step 6: Commit**

```bash
rtk git add src/flow-field.ts src/flow-field.test.ts && rtk git commit -m "feat: row injection for flow field"
```

---

### Task 4: Height-differential equalization

One equalization step: water flows from cells with higher surface level (`elevation + waterLevel`) to cardinal neighbors with lower surface level. Flow rate is proportional to the differential.

**Files:**
- Modify: `src/flow-field.ts`
- Modify: `src/flow-field.test.ts`

**Step 1: Write tests**

```typescript
import { equalizeStep } from './flow-field';

describe('equalizeStep', () => {
  it('water flows from high surface to low surface neighbor', () => {
    const grid = createFlowGrid(3, 1);
    grid[0][0].waterLevel = 4;
    const elevations = [[0, 0, 0]];
    equalizeStep({ grid, elevations, terrainSlope: 0, effectiveHoleDepths: [[0, 0, 0]] });
    expect(grid[0][0].waterLevel).toBeLessThan(4);
    expect(grid[0][1].waterLevel).toBeGreaterThan(0);
  });

  it('water does not flow uphill past a wall', () => {
    const grid = createFlowGrid(3, 1);
    grid[0][0].waterLevel = 2;
    const elevations = [[0, 5, 0]];
    equalizeStep({ grid, elevations, terrainSlope: 0, effectiveHoleDepths: [[0, 0, 0]] });
    expect(grid[0][1].waterLevel).toBe(0);
    expect(grid[0][2].waterLevel).toBe(0);
  });

  it('water flows into a hole and gets absorbed', () => {
    const grid = createFlowGrid(3, 1);
    grid[0][0].waterLevel = 3;
    const elevations = [[0, -2, 0]];
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 2, 0]],
    });
    expect(grid[0][1].waterLevel).toBe(0);
  });

  it('conserves total water (no holes)', () => {
    const grid = createFlowGrid(3, 3);
    grid[1][1].waterLevel = 9;
    const elevations = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const totalBefore = 9;
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    });
    let totalAfter = 0;
    for (const row of grid) {
      for (const cell of row) {
        totalAfter += cell.waterLevel;
      }
    }
    expect(totalAfter).toBeCloseTo(totalBefore, 5);
  });

  it('does nothing when all surfaces are equal', () => {
    const grid = createFlowGrid(3, 1);
    grid[0][0].waterLevel = 2;
    grid[0][1].waterLevel = 2;
    grid[0][2].waterLevel = 2;
    const elevations = [[0, 0, 0]];
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0]],
    });
    expect(grid[0][0].waterLevel).toBeCloseTo(2, 5);
    expect(grid[0][1].waterLevel).toBeCloseTo(2, 5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: FAIL -- `equalizeStep` not found.

**Step 3: Write implementation**

Add to `src/flow-field.ts`:

```typescript
import { FLOW_RATE, FLOW_MIN_WATER } from './config';

export interface EqualizeInput {
  grid: FlowCell[][];
  elevations: number[][];
  terrainSlope: number;
  effectiveHoleDepths: number[][];
}

export interface EqualizeResult {
  puddleDelta: number[][];
}

const CARDINAL_DIRS = [
  { dc: 0, dr: -1 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: 1, dr: 0 },
];

export function equalizeStep(input: EqualizeInput): EqualizeResult {
  const { grid, elevations, terrainSlope, effectiveHoleDepths } = input;
  const numRows = grid.length;
  const numCols = grid[0].length;
  const puddleDelta: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));

  // Compute outflows first, apply after (to avoid order-dependent artifacts)
  const outflow: { fromR: number; fromC: number; toR: number; toC: number; amount: number }[] = [];

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const cell = grid[row][col];
      if (cell.waterLevel < FLOW_MIN_WATER) {
        continue;
      }

      const surfaceHere = terrainSlope + elevations[row][col] + cell.waterLevel;

      for (const { dc, dr } of CARDINAL_DIRS) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= numRows || nc < 0 || nc >= numCols) {
          continue;
        }

        const nElev = terrainSlope + elevations[nr][nc];
        const nSurface = nElev + grid[nr][nc].waterLevel;

        if (surfaceHere <= nSurface) {
          continue;
        }

        // Wall check: if neighbor elevation alone blocks the flow
        if (nElev >= surfaceHere) {
          continue;
        }

        const diff = surfaceHere - nSurface;
        const flow = diff * FLOW_RATE;
        const maxFlow = cell.waterLevel / 4; // don't drain more than 1/4 per direction
        outflow.push({
          fromR: row, fromC: col,
          toR: nr, toC: nc,
          amount: Math.min(flow, maxFlow),
        });
      }
    }
  }

  // Apply outflows
  for (const { fromR, fromC, toR, toC, amount } of outflow) {
    const actualAmount = Math.min(amount, grid[fromR][fromC].waterLevel);
    if (actualAmount < FLOW_MIN_WATER) {
      continue;
    }
    grid[fromR][fromC].waterLevel -= actualAmount;

    // Check if destination is a hole with remaining capacity
    const holeDepth = effectiveHoleDepths[toR][toC];
    if (holeDepth > 0 && elevations[toR][toC] < 0) {
      const absorbed = Math.min(actualAmount, holeDepth);
      puddleDelta[toR][toC] += absorbed;
      effectiveHoleDepths[toR][toC] -= absorbed;
      const remainder = actualAmount - absorbed;
      if (remainder > FLOW_MIN_WATER) {
        grid[toR][toC].waterLevel += remainder;
      }
    } else {
      grid[toR][toC].waterLevel += actualAmount;
    }
  }

  return { puddleDelta };
}
```

**Step 4: Run test to verify it passes**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: PASS.

**Step 5: Build and typecheck**

Run: `rtk npm run build`

**Step 6: Commit**

```bash
rtk git add src/flow-field.ts src/flow-field.test.ts && rtk git commit -m "feat: height-differential equalization step"
```

---

### Task 5: Momentum transfer during equalization

When water flows, it carries momentum. When water hits a wall, blocked momentum redirects to perpendicular axes.

**Files:**
- Modify: `src/flow-field.ts`
- Modify: `src/flow-field.test.ts`

**Step 1: Write tests**

```typescript
describe('momentum in equalization', () => {
  it('flowing water transfers momentum to destination cell', () => {
    const grid = createFlowGrid(3, 1);
    grid[0][0].waterLevel = 4;
    grid[0][0].momentum = { dx: 1, dy: 0 };
    const elevations = [[0, 0, 0]];
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0]],
    });
    // Water flowed right, so col 1 should have rightward momentum
    expect(grid[0][1].momentum.dx).toBeGreaterThan(0);
  });

  it('momentum biases flow direction', () => {
    // Water in center cell with rightward momentum should flow
    // more to the right than to the left, all else equal
    const grid = createFlowGrid(3, 1);
    grid[0][1].waterLevel = 4;
    grid[0][1].momentum = { dx: 2, dy: 0 };
    const elevations = [[0, 0, 0]];
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0]],
    });
    expect(grid[0][2].waterLevel).toBeGreaterThan(grid[0][0].waterLevel);
  });

  it('wall hit redirects momentum to perpendicular axes', () => {
    // Water moving down hits a wall, should gain lateral momentum
    const grid = createFlowGrid(3, 3);
    grid[0][1].waterLevel = 4;
    grid[0][1].momentum = { dx: 0, dy: 4 };
    const elevations = [[0, 0, 0], [0, 10, 0], [0, 0, 0]];
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    });
    // Cell should have gained lateral momentum from the redirect
    expect(Math.abs(grid[0][1].momentum.dx)).toBeGreaterThan(0);
  });

  it('momentum decays each step', () => {
    const grid = createFlowGrid(1, 1);
    grid[0][0].waterLevel = 2;
    grid[0][0].momentum = { dx: 5, dy: 5 };
    const elevations = [[0]];
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0]],
    });
    // Momentum should have decayed
    expect(grid[0][0].momentum.dx).toBeLessThan(5);
    expect(grid[0][0].momentum.dy).toBeLessThan(5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: FAIL -- momentum not yet integrated into equalization.

**Step 3: Update `equalizeStep` to incorporate momentum**

Modify the outflow calculation in `equalizeStep`:

1. **Momentum bias**: When computing flow amount, add a momentum-aligned bonus. If the cell's momentum vector aligns with the direction to the neighbor (dot product > 0), increase the flow by a factor of `1 + momentum_magnitude * alignment`.

2. **Momentum transfer**: When water flows from A to B, transfer proportional momentum. The destination cell's momentum becomes a weighted average of its existing momentum and the incoming water's momentum.

3. **Wall redirect**: After computing all outflows, check for cells that had momentum toward a wall but couldn't flow. Redirect the blocked component to perpendicular axes using `MOMENTUM_REDIRECT_FACTOR`.

4. **Decay**: At the end of the step, multiply all cell momentums by `MOMENTUM_DECAY`.

The exact implementation should follow this pseudocode per cell:

```
for each wet cell:
  for each cardinal direction:
    alignment = dot(cell.momentum, direction) / |cell.momentum|
    momentumBonus = max(0, alignment) * |cell.momentum| * 0.1
    effectiveFlow = heightDiffFlow + momentumBonus
    ... (rest of flow calc)

  for each blocked direction (wall too tall):
    blocked_component = cell.momentum projected onto blocked direction
    redirect perpendicular components by MOMENTUM_REDIRECT_FACTOR * blocked_component

  cell.momentum *= MOMENTUM_DECAY
```

**Step 4: Run tests to verify they pass**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: PASS.

**Step 5: Build and typecheck**

Run: `rtk npm run build`

**Step 6: Commit**

```bash
rtk git add src/flow-field.ts src/flow-field.test.ts && rtk git commit -m "feat: momentum transfer and wall redirection in equalization"
```

---

### Task 6: Pressure buildup and release

When a cell has water but all cardinal neighbors are walls or higher surfaces, pressure accumulates. Pressure adds to effective water level for wall-overtopping checks.

**Files:**
- Modify: `src/flow-field.ts`
- Modify: `src/flow-field.test.ts`

**Step 1: Write tests**

```typescript
describe('pressure', () => {
  it('pressure builds when water has no outflow', () => {
    // Water surrounded by walls on all sides
    const grid = createFlowGrid(3, 3);
    grid[1][1].waterLevel = 3;
    const elevations = [
      [0, 5, 0],
      [5, 0, 5],
      [0, 5, 0],
    ];
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    });
    expect(grid[1][1].pressure).toBeGreaterThan(0);
  });

  it('pressure does not build when water has outflow', () => {
    const grid = createFlowGrid(3, 1);
    grid[0][1].waterLevel = 3;
    const elevations = [[0, 0, 0]];
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0]],
    });
    expect(grid[0][1].pressure).toBe(0);
  });

  it('pressure allows water to overtop a wall it normally cannot', () => {
    // Wall of height 4, water of height 3 normally blocked.
    // After several steps of pressure buildup, water should overtop.
    const grid = createFlowGrid(3, 3);
    grid[1][1].waterLevel = 3;
    const elevations = [
      [0, 4, 0],
      [4, 0, 4],
      [0, 4, 0],
    ];
    const depths = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    // Run several equalization steps to build pressure
    for (let i = 0; i < 10; i++) {
      equalizeStep({ grid, elevations, terrainSlope: 0, effectiveHoleDepths: depths });
    }
    // Pressure should have built up enough to push water over the wall
    expect(grid[1][1].pressure).toBeGreaterThan(0);
    // Some water should have escaped
    const totalWaterOutside =
      grid[0][1].waterLevel + grid[1][0].waterLevel +
      grid[1][2].waterLevel + grid[2][1].waterLevel;
    expect(totalWaterOutside).toBeGreaterThan(0);
  });

  it('pressure resets when water finds an outflow', () => {
    const grid = createFlowGrid(3, 1);
    grid[0][1].waterLevel = 3;
    grid[0][1].pressure = 5;
    const elevations = [[0, 0, 0]];
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0]],
    });
    expect(grid[0][1].pressure).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: FAIL -- pressure not yet implemented.

**Step 3: Update `equalizeStep` for pressure**

Add pressure logic to `equalizeStep`:

1. **Track outflow per cell**: After computing outflows, flag which cells had zero total outflow.
2. **Build pressure**: For zero-outflow cells with water, increment `cell.pressure += PRESSURE_BUILDUP_RATE`.
3. **Pressure-enhanced overtopping**: In the wall check, use `surfaceHere + cell.pressure * PRESSURE_OVERTOP_FACTOR` instead of just `surfaceHere`. This lets pressurized water flow over walls it normally couldn't.
4. **Release pressure**: If a cell had any outflow this step, set `cell.pressure = 0`.

**Step 4: Run tests to verify they pass**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: PASS.

**Step 5: Build and typecheck**

Run: `rtk npm run build`

**Step 6: Commit**

```bash
rtk git add src/flow-field.ts src/flow-field.test.ts && rtk git commit -m "feat: pressure buildup and release in equalization"
```

---

### Task 7: Full advance phase

Compose injection + equalization into the full advance pass. Row-by-row from top to bottom, injecting water then running K equalization steps. Capture a snapshot of water levels after each row for animation.

**Files:**
- Modify: `src/flow-field.ts`
- Modify: `src/flow-field.test.ts`

**Step 1: Write tests**

```typescript
import { simulateFlowAdvance, FlowAdvanceResult } from './flow-field';

describe('simulateFlowAdvance', () => {
  it('flat grid: water reaches every row', () => {
    const result = simulateFlowAdvance({
      elevations: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      poolMap: new Map(),
      castleCol: 1,
      castleRow: 2,
    });
    // Every cell should have had water at some point
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        expect(result.maxWaterMap[row][col]).toBeGreaterThan(0);
      }
    }
  });

  it('produces one snapshot per row', () => {
    const result = simulateFlowAdvance({
      elevations: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      poolMap: new Map(),
      castleCol: 1,
      castleRow: 2,
    });
    expect(result.snapshots.length).toBe(3);
  });

  it('wall blocks water and water diverts laterally', () => {
    // Wall in center column. Water should flow around it.
    const elevations = [
      [0, 0, 0],
      [0, 10, 0],
      [0, 0, 0],
    ];
    const result = simulateFlowAdvance({
      elevations,
      columnHeights: [0, 5, 0],
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      poolMap: new Map(),
      castleCol: 1,
      castleRow: 2,
    });
    // Water should have diverted to col 0 and/or col 2
    const lateralWater = result.maxWaterMap[1][0] + result.maxWaterMap[1][2];
    expect(lateralWater).toBeGreaterThan(0);
    // Water should NOT be on the wall
    expect(result.maxWaterMap[1][1]).toBe(0);
  });

  it('detects castle flooding', () => {
    const result = simulateFlowAdvance({
      elevations: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      poolMap: new Map(),
      castleCol: 1,
      castleRow: 2,
    });
    expect(result.castleFlooded).toBe(true);
  });

  it('records puddle deltas from holes', () => {
    const elevations = [
      [0, 0, 0],
      [0, -3, 0],
      [0, 0, 0],
    ];
    const result = simulateFlowAdvance({
      elevations,
      columnHeights: [0, 2, 0],
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 3, 0], [0, 0, 0]],
      poolMap: new Map(),
      castleCol: 1,
      castleRow: 2,
    });
    expect(result.puddleDelta[1][1]).toBeGreaterThanOrEqual(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: FAIL.

**Step 3: Write implementation**

```typescript
import { FLOW_EQUALIZATION_STEPS, FLOW_MIN_WATER } from './config';
import { PoolInfo } from './wave';

export interface FlowAdvanceInput {
  elevations: number[][];
  columnHeights: number[];
  terrainSlope: number;
  effectiveHoleDepths: number[][];
  poolMap: Map<string, PoolInfo>;
  castleCol: number;
  castleRow: number;
}

export interface FlowAdvanceResult {
  snapshots: number[][][];
  maxWaterMap: number[][];
  puddleDelta: number[][];
  wallErosionEvents: WallEvent[][];
  castleFlooded: boolean;
  grid: FlowCell[][];
}

export function simulateFlowAdvance(input: FlowAdvanceInput): FlowAdvanceResult {
  const { elevations, columnHeights, terrainSlope, effectiveHoleDepths, castleCol, castleRow } = input;
  const numRows = elevations.length;
  const numCols = elevations[0].length;

  const grid = createFlowGrid(numCols, numRows);
  const effDepths = effectiveHoleDepths.map(row => row.slice());
  const puddleDelta: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const wallErosionEvents: WallEvent[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(null));
  const maxWaterMap: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const snapshots: number[][][] = [];
  let castleFlooded = false;

  // For each row, compute what "column heights" carry forward.
  // On row 0, it's the initial columnHeights.
  // On subsequent rows, it's the water level in each cell of the previous row
  // (water flowing downward = the advance front).
  let currentHeights = columnHeights.slice();

  for (let row = 0; row < numRows; row++) {
    // Inject: deposit water from the advancing front into this row
    const injectResult = injectRow({
      grid,
      row,
      columnHeights: currentHeights,
      elevations,
      terrainSlope,
      effectiveHoleDepths: effDepths,
    });

    // Accumulate puddle deltas and wall events from injection
    for (let col = 0; col < numCols; col++) {
      puddleDelta[row][col] += injectResult.puddleDelta[col];
      if (injectResult.wallEvents[col] !== null) {
        wallErosionEvents[row][col] = injectResult.wallEvents[col];
      }
    }

    // Run equalization passes
    for (let step = 0; step < FLOW_EQUALIZATION_STEPS; step++) {
      const eqResult = equalizeStep({
        grid,
        elevations,
        terrainSlope,
        effectiveHoleDepths: effDepths,
      });
      // Accumulate equalization puddle deltas
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          puddleDelta[r][c] += eqResult.puddleDelta[r][c];
        }
      }
    }

    // Snapshot after equalization
    snapshots.push(grid.map(r => r.map(cell => cell.waterLevel)));

    // Track max water for erosion
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        maxWaterMap[r][c] = Math.max(maxWaterMap[r][c], grid[r][c].waterLevel);
      }
    }

    // Check castle flooding
    if (grid[castleRow]?.[castleCol]?.waterLevel > FLOW_MIN_WATER) {
      castleFlooded = true;
    }

    // Prepare carry-forward heights for next row:
    // Water in each cell of this row that has downward momentum continues.
    // The injection consumed the water from currentHeights, so for the next row
    // we use the grid's current water levels in this row (which now have lateral
    // spread applied). This naturally handles water wrapping around walls.
    currentHeights = new Array(numCols).fill(0);
    for (let col = 0; col < numCols; col++) {
      if (grid[row][col].waterLevel > FLOW_MIN_WATER && grid[row][col].momentum.dy > 0) {
        currentHeights[col] = grid[row][col].waterLevel;
        // Drain the cell as it moves to the next row
        grid[row][col].waterLevel = 0;
      }
    }
  }

  return { snapshots, maxWaterMap, puddleDelta, wallErosionEvents, castleFlooded, grid };
}
```

**Step 4: Run tests to verify they pass**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: PASS.

**Step 5: Build and typecheck**

Run: `rtk npm run build`

**Step 6: Commit**

```bash
rtk git add src/flow-field.ts src/flow-field.test.ts && rtk git commit -m "feat: full advance phase with injection + equalization loop"
```

---

### Task 8: Recede phase

Reverse of advance: drain water from bottom to top. Water that survived at the bottom row plus any bounce-back from walls flows upward.

**Files:**
- Modify: `src/flow-field.ts`
- Modify: `src/flow-field.test.ts`

**Step 1: Write tests**

```typescript
import { simulateFlowRecede } from './flow-field';

describe('simulateFlowRecede', () => {
  it('flat grid: recede produces snapshots moving upward', () => {
    const advanceResult = simulateFlowAdvance({
      elevations: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      poolMap: new Map(),
      castleCol: 1,
      castleRow: 2,
    });
    const recedeResult = simulateFlowRecede({
      elevations: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      advanceGrid: advanceResult.grid,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      poolMap: new Map(),
      castleCol: 1,
      castleRow: 2,
    });
    expect(recedeResult.snapshots.length).toBe(3);
  });

  it('returns combined maxWaterMap from recede', () => {
    const advanceResult = simulateFlowAdvance({
      elevations: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      poolMap: new Map(),
      castleCol: 1,
      castleRow: 2,
    });
    const recedeResult = simulateFlowRecede({
      elevations: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      advanceGrid: advanceResult.grid,
      terrainSlope: 0,
      effectiveHoleDepths: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      poolMap: new Map(),
      castleCol: 1,
      castleRow: 2,
    });
    // Row 0 should have recede water
    for (let col = 0; col < 3; col++) {
      expect(recedeResult.maxWaterMap[0][col]).toBeGreaterThan(0);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: FAIL.

**Step 3: Write implementation**

```typescript
export interface FlowRecedeInput {
  elevations: number[][];
  advanceGrid: FlowCell[][];
  terrainSlope: number;
  effectiveHoleDepths: number[][];
  poolMap: Map<string, PoolInfo>;
  castleCol: number;
  castleRow: number;
}

export interface FlowRecedeResult {
  snapshots: number[][][];
  maxWaterMap: number[][];
  puddleDelta: number[][];
  castleFlooded: boolean;
}

export function simulateFlowRecede(input: FlowRecedeInput): FlowRecedeResult {
  const { elevations, advanceGrid, terrainSlope, effectiveHoleDepths, castleCol, castleRow } = input;
  const numRows = elevations.length;
  const numCols = elevations[0].length;

  // Start the recede grid from whatever water remains after advance
  const grid = advanceGrid.map(row => row.map(cell => ({
    waterLevel: cell.waterLevel,
    momentum: { dx: -cell.momentum.dx, dy: -cell.momentum.dy },
    pressure: 0,
  })));
  const effDepths = effectiveHoleDepths.map(row => row.slice());
  const puddleDelta: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const maxWaterMap: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const snapshots: number[][][] = [];
  let castleFlooded = false;

  // Recede: pull water upward row by row from bottom
  for (let row = numRows - 1; row >= 0; row--) {
    // Collect water from this row that has upward momentum
    const recedeHeights = new Array(numCols).fill(0);
    for (let col = 0; col < numCols; col++) {
      if (grid[row][col].waterLevel > FLOW_MIN_WATER) {
        recedeHeights[col] = grid[row][col].waterLevel;
        grid[row][col].waterLevel = 0;
        grid[row][col].momentum = { dx: 0, dy: -recedeHeights[col] };
      }
    }

    // Inject upward into the row above (if exists)
    if (row > 0) {
      for (let col = 0; col < numCols; col++) {
        if (recedeHeights[col] > FLOW_MIN_WATER) {
          const elev = terrainSlope + elevations[row - 1][col];
          let incoming = recedeHeights[col];
          if (elev >= incoming) {
            continue;
          }
          if (elev > 0) {
            incoming -= elev;
          }
          // Hole absorption
          if (elevations[row - 1][col] < 0 && effDepths[row - 1][col] > 0) {
            const absorbed = Math.min(incoming, effDepths[row - 1][col]);
            puddleDelta[row - 1][col] += absorbed;
            effDepths[row - 1][col] -= absorbed;
            incoming -= absorbed;
          }
          if (incoming > FLOW_MIN_WATER) {
            grid[row - 1][col].waterLevel += incoming;
            grid[row - 1][col].momentum.dy = -incoming;
          }
        }
      }

      // Equalize
      for (let step = 0; step < FLOW_EQUALIZATION_STEPS; step++) {
        const eqResult = equalizeStep({
          grid,
          elevations,
          terrainSlope,
          effectiveHoleDepths: effDepths,
        });
        for (let r = 0; r < numRows; r++) {
          for (let c = 0; c < numCols; c++) {
            puddleDelta[r][c] += eqResult.puddleDelta[r][c];
          }
        }
      }
    }

    snapshots.unshift(grid.map(r => r.map(cell => cell.waterLevel)));

    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        maxWaterMap[r][c] = Math.max(maxWaterMap[r][c], grid[r][c].waterLevel);
      }
    }

    if (grid[castleRow]?.[castleCol]?.waterLevel > FLOW_MIN_WATER) {
      castleFlooded = true;
    }
  }

  return { snapshots, maxWaterMap, puddleDelta, castleFlooded };
}
```

**Step 4: Run tests**

Run: `rtk npx vitest run src/flow-field.test.ts`
Expected: PASS.

**Step 5: Build and typecheck**

Run: `rtk npm run build`

**Step 6: Commit**

```bash
rtk git add src/flow-field.ts src/flow-field.test.ts && rtk git commit -m "feat: recede phase for flow field"
```

---

### Task 9: Wire into `simulateWave` and extend `WaveResult`

Replace the internals of `simulateWave` with the flow field simulation. Extend `WaveResult` with frame data for animation. Keep the existing interface fields populated for backward compatibility (erosion, clean wave check, etc.).

**Files:**
- Modify: `src/wave.ts`
- Modify: `src/wave.test.ts`

**Step 1: Extend `WaveResult` interface**

Add to the existing `WaveResult`:

```typescript
export interface WaveResult {
  advanceHeightMap: number[][];
  recedeHeightMap: number[][];
  advanceFrames: number[][][];
  recedeFrames: number[][][];
  puddleDelta: number[][];
  wallErosionEvents: WallErosionEvent[][];
  castleFlooded: boolean;
}
```

**Step 2: Update `simulateWave` to use flow field**

Replace the body of `simulateWave` to call `simulateFlowAdvance` and `simulateFlowRecede`, then map results into `WaveResult`:

```typescript
import { simulateFlowAdvance, simulateFlowRecede } from './flow-field';

export function simulateWave(input: SimulateWaveInput): WaveResult {
  const { elevations, puddleDepths, columnHeights, castleCol, castleRow, maxRows, terrainSlope, poolMap } = input;
  const numRows = elevations.length;
  const numCols = numRows > 0 ? elevations[0].length : 0;

  const effectiveHoleDepths: number[][] = Array.from({ length: numRows }, (_, r) =>
    Array.from({ length: numCols }, (_, c) => {
      const e = elevations[r][c];
      if (e >= 0) { return 0; }
      return Math.max(0, (-e) - puddleDepths[r][c]);
    }),
  );

  const advance = simulateFlowAdvance({
    elevations,
    columnHeights,
    terrainSlope,
    effectiveHoleDepths,
    poolMap,
    castleCol,
    castleRow,
  });

  const effectiveAfterAdvance = effectiveHoleDepths.map((row, r) =>
    row.map((d, c) => Math.max(0, d - advance.puddleDelta[r][c])),
  );

  const recede = simulateFlowRecede({
    elevations,
    advanceGrid: advance.grid,
    terrainSlope,
    effectiveHoleDepths: effectiveAfterAdvance,
    poolMap,
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
    wallErosionEvents: advance.wallErosionEvents,
    castleFlooded: advance.castleFlooded || recede.castleFlooded,
  };
}
```

**Step 3: Update existing tests**

The existing wave tests assert specific numeric values based on the old column model. These need to change to reflect flow field behavior. Key behavioral changes:

- Water now spreads laterally more aggressively (momentum + equalization)
- Wall blocking is the same but water diverts around walls
- Hole absorption is the same during injection but also happens during equalization
- Exact numeric values will differ; update assertions to test behavior rather than exact values

For each existing test, update assertions:
- `flat grid: wave passes every row at full height` -- still true, check `advanceHeightMap > 0` for all cells
- `wall taller than wave: column blocked` -- wall blocks center, but water may divert laterally
- `hole deeper than wave: column absorbed` -- still absorbed, but lateral behavior differs
- etc.

**Step 4: Remove old `simulateAdvance`/`simulateRecede`**

These are no longer called by `simulateWave`. Remove the functions and their direct tests. Keep `waveHeightForLevel`, `wavesForLevel`, and `generateWaveCurve` which are still used.

Note: `simulateAdvance` and `simulateRecede` are only used in tests and in `simulateWave`. Removing them is safe.

**Step 5: Run all tests**

Run: `rtk npx vitest run`
Expected: All tests pass.

**Step 6: Build and typecheck**

Run: `rtk npm run build`

**Step 7: Commit**

```bash
rtk git add src/wave.ts src/wave.test.ts src/flow-field.ts && rtk git commit -m "feat: wire flow field into simulateWave, extend WaveResult with frames"
```

---

### Task 10: Update wave animator for frame-based animation

The animator currently iterates row-by-row using `advanceHeightMap`. Update it to iterate through `advanceFrames` and `recedeFrames`, showing water spreading laterally between frames.

**Files:**
- Modify: `src/wave-animator.ts`

**Step 1: Update the `animate` method**

Replace the advance animation loop:

```typescript
// OLD: row-by-row from advanceHeightMap
// NEW: frame-by-frame from advanceFrames

const prevFrame: boolean[][] = Array.from({ length: GRID_HEIGHT }, () =>
  Array.from({ length: GRID_WIDTH }, () => false),
);

for (let frameIdx = 0; frameIdx < result.advanceFrames.length; frameIdx++) {
  await this.delay(WAVE_ROW_DELAY_MS);
  const frame = result.advanceFrames[frameIdx];

  for (let row = 0; row < GRID_HEIGHT; row++) {
    for (let col = 0; col < GRID_WIDTH; col++) {
      const hasWaterNow = frame[row][col] > FLOW_MIN_WATER;
      const hadWaterBefore = prevFrame[row][col];

      if (hasWaterNow && !hadWaterBefore) {
        // New water: spawn overlay
        hasWater[row][col] = true;
        const overlay = this.spawnOverlay(col, row, frame[row][col]);
        advanceOverlaysByRow[row].push(overlay);
      } else if (!hasWaterNow && hadWaterBefore) {
        // Water receded from this cell during equalization
        hasWater[row][col] = false;
      } else if (hasWaterNow) {
        hasWater[row][col] = true;
      }

      prevFrame[row][col] = hasWaterNow;
    }
  }
  this.rebuildEdges(hasWater);
}
```

Do the same for recede frames (iterate in order since recede snapshots are already ordered top-to-bottom after the reverse in `simulateFlowRecede`).

**Step 2: Import `FLOW_MIN_WATER` from config**

Add to imports at top of file.

**Step 3: Keep existing wall flash and overtop bar effects**

The `getHillEvent` helper uses `advanceHeightMap` which is now `maxWaterMap`. It still works because we're checking if a wall cell had water entering it and the cell behind it didn't. Adjust to use frame data if needed, or keep using `advanceHeightMap` which already captures this.

**Step 4: Build and typecheck**

Run: `rtk npm run build`

**Step 5: Visual test**

Run: `npm run dev`
- Build a wall and send a wave. Verify water visually flows around the wall.
- Dig a hole. Verify water gets absorbed.
- Build a U-shaped enclosure. Verify water builds pressure and eventually overtops.
- Verify the recede animation plays correctly in reverse.

**Step 6: Commit**

```bash
rtk git add src/wave-animator.ts && rtk git commit -m "feat: frame-based wave animation showing lateral flow"
```

---

### Task 11: Remove old simulation functions

Clean up `src/wave.ts` by removing `simulateAdvance`, `simulateRecede`, and their associated interfaces (`AdvanceInput`, `AdvanceResult`, `RecedeInput`, `RecedeResult`) that are no longer used. Also remove `WAVE_SPREAD_FACTOR` from config if no longer referenced.

**Files:**
- Modify: `src/wave.ts`
- Modify: `src/config.ts`

**Step 1: Remove unused functions and interfaces**

Delete `simulateAdvance`, `simulateRecede`, `AdvanceInput`, `AdvanceResult`, `RecedeInput`, `RecedeResult`, and the `redistributePoolWater` helper from `src/wave.ts`.

Keep: `simulateWave`, `WaveResult`, `SimulateWaveInput`, `generateWaveCurve`, `waveHeightForLevel`, `wavesForLevel`, `PoolInfo`, `WallErosionEvent`.

**Step 2: Remove `WAVE_SPREAD_FACTOR` from config**

Check if it's still referenced anywhere. If not, remove it.

**Step 3: Run all tests**

Run: `rtk npx vitest run`
Expected: PASS.

**Step 4: Build and typecheck**

Run: `rtk npm run build`

**Step 5: Commit**

```bash
rtk git add src/wave.ts src/config.ts && rtk git commit -m "refactor: remove old column-based simulation functions"
```

---

### Task 12: Update Playwright visual regression baselines

**Files:**
- Modify: `tests/main.spec.ts-snapshots/*`

**Step 1: Rebuild baselines**

Run: `npm run test:integration-update`

**Step 2: Run tests against new baselines**

Run: `rtk npm test`
Expected: All tests pass.

**Step 3: Commit**

```bash
rtk git add tests/ && rtk git commit -m "test: update baselines for flow field wave animation"
```

---

### Task 13: Gameplay tuning pass

After everything is wired up, play several levels and tune the config constants. This is iterative and manual.

**Files:**
- Modify: `src/config.ts`

**Tuning targets:**

- `FLOW_EQUALIZATION_STEPS`: Too few = water barely spreads laterally. Too many = water spreads instantly like a puddle. Start at 4, adjust based on feel.
- `FLOW_RATE`: Controls how fast water equalizes. 0.25 is a good starting point. Lower = more viscous, higher = more fluid.
- `MOMENTUM_DECAY`: 0.8 means momentum drops to ~33% after 5 steps. If water stalls too fast, increase. If it feels like it never stops, decrease.
- `MOMENTUM_REDIRECT_FACTOR`: 0.6 means 60% of blocked momentum redirects sideways. If walls don't divert enough, increase.
- `PRESSURE_BUILDUP_RATE` and `PRESSURE_OVERTOP_FACTOR`: If enclosed water never breaches, increase. If it breaches too easily, decrease.
- `TERRAIN_SLOPE`: May need adjustment since the flow field handles height differently than the old column model.

**Process:**
1. Run `npm run dev`
2. Play through levels 1-5 with no defenses. Verify wave reach feels similar to before.
3. Build basic wall. Verify water diverts around it.
4. Build U-shaped enclosure. Verify pressure breach.
5. Build channel with hole at end. Verify water funnels and gets absorbed.
6. Adjust constants, rebuild, repeat.

**Step 1: Commit tuning changes**

```bash
rtk git add src/config.ts && rtk git commit -m "tune: adjust flow field constants after playtesting"
```
