import { describe, expect, test } from 'vitest';
import { createFlowGrid, equalizeStep, injectRow, simulateFlowAdvance, simulateFlowRecede } from './flow-field';
import { FLOW_MIN_WATER, PRESSURE_BUILDUP_RATE } from './config';

describe('createFlowGrid', () => {
  test('creates grid matching input dimensions', () => {
    const grid = createFlowGrid(5, 3);
    expect(grid.length).toBe(3);
    for (const row of grid) {
      expect(row.length).toBe(5);
    }
  });

  test('initializes all cells with zero water, momentum, and pressure', () => {
    const grid = createFlowGrid(4, 2);
    for (const row of grid) {
      for (const cell of row) {
        expect(cell.waterLevel).toBe(0);
        expect(cell.momentum).toEqual({ dx: 0, dy: 0 });
        expect(cell.pressure).toBe(0);
      }
    }
  });
});

describe('injectRow', () => {
  function flatElevations(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => new Array(cols).fill(0));
  }

  function zeroHoleDepths(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => new Array(cols).fill(0));
  }

  test('deposits column heights as water into specified row', () => {
    const grid = createFlowGrid(3, 2);
    const result = injectRow({
      grid,
      row: 0,
      columnHeights: [2, 3, 1],
      elevations: flatElevations(2, 3),
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(2, 3),
    });
    expect(grid[0][0].waterLevel).toBe(2);
    expect(grid[0][1].waterLevel).toBe(3);
    expect(grid[0][2].waterLevel).toBe(1);
    expect(result.blocked).toEqual([false, false, false]);
  });

  test('sets downward momentum proportional to water level', () => {
    const grid = createFlowGrid(3, 2);
    injectRow({
      grid,
      row: 0,
      columnHeights: [2, 3, 1],
      elevations: flatElevations(2, 3),
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(2, 3),
    });
    expect(grid[0][0].momentum).toEqual({ dx: 0, dy: 2 });
    expect(grid[0][1].momentum).toEqual({ dx: 0, dy: 3 });
    expect(grid[0][2].momentum).toEqual({ dx: 0, dy: 1 });
  });

  test('wall taller than incoming blocks injection', () => {
    const grid = createFlowGrid(3, 2);
    const elevations = flatElevations(2, 3);
    elevations[0][1] = 5;
    const result = injectRow({
      grid,
      row: 0,
      columnHeights: [2, 3, 2],
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(2, 3),
    });
    expect(grid[0][1].waterLevel).toBe(0);
    expect(result.blocked[1]).toBe(true);
    expect(result.wallEvents[1]).toBe('blocked');
  });

  test('wall shorter than incoming reduces water level', () => {
    const grid = createFlowGrid(3, 2);
    const elevations = flatElevations(2, 3);
    elevations[0][1] = 2;
    const result = injectRow({
      grid,
      row: 0,
      columnHeights: [0, 5, 0],
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(2, 3),
    });
    expect(grid[0][1].waterLevel).toBe(3);
    expect(result.wallEvents[1]).toBe('overtopped');
    expect(result.blocked[1]).toBe(false);
  });

  test('hole absorbs water up to effective depth', () => {
    const grid = createFlowGrid(3, 2);
    const elevations = flatElevations(2, 3);
    elevations[0][1] = -4;
    const holeDepths = zeroHoleDepths(2, 3);
    holeDepths[0][1] = 4;
    const result = injectRow({
      grid,
      row: 0,
      columnHeights: [0, 3, 0],
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: holeDepths,
    });
    // Hole depth (4) >= incoming (3), fully absorbed
    expect(grid[0][1].waterLevel).toBe(0);
    expect(result.puddleDelta[1]).toBe(3);
  });

  test('hole shallower than wave absorbs partial water', () => {
    const grid = createFlowGrid(3, 2);
    const elevations = flatElevations(2, 3);
    elevations[0][1] = -2;
    const holeDepths = zeroHoleDepths(2, 3);
    holeDepths[0][1] = 2;
    const result = injectRow({
      grid,
      row: 0,
      columnHeights: [0, 5, 0],
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: holeDepths,
    });
    // Absorbs 2, remaining 3 deposited as water
    expect(grid[0][1].waterLevel).toBe(3);
    expect(result.puddleDelta[1]).toBe(2);
  });

  test('terrain slope reduces incoming water', () => {
    const grid = createFlowGrid(3, 2);
    injectRow({
      grid,
      row: 0,
      columnHeights: [0, 3, 0],
      elevations: flatElevations(2, 3),
      terrainSlope: 1,
      effectiveHoleDepths: zeroHoleDepths(2, 3),
    });
    // terrainSlope=1 + elevation=0 = effective 1, reduces incoming 3 to 2
    expect(grid[0][1].waterLevel).toBe(2);
  });

  test('skips columns with zero or negative incoming height', () => {
    const grid = createFlowGrid(3, 2);
    injectRow({
      grid,
      row: 0,
      columnHeights: [0, -1, 0],
      elevations: flatElevations(2, 3),
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(2, 3),
    });
    for (const cell of grid[0]) {
      expect(cell.waterLevel).toBe(0);
    }
  });

  test('does not deposit water below FLOW_MIN_WATER threshold', () => {
    const grid = createFlowGrid(3, 2);
    const elevations = flatElevations(2, 3);
    elevations[0][0] = 1;
    injectRow({
      grid,
      row: 0,
      columnHeights: [1 + FLOW_MIN_WATER * 0.5, 0, 0],
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(2, 3),
    });
    // After wall reduction, remaining is FLOW_MIN_WATER * 0.5, below threshold
    expect(grid[0][0].waterLevel).toBe(0);
  });
});

describe('equalizeStep', () => {
  function flatElevations(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => new Array(cols).fill(0));
  }

  function zeroHoleDepths(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => new Array(cols).fill(0));
  }

  function totalWater(grid: ReturnType<typeof createFlowGrid>): number {
    let sum = 0;
    for (const row of grid) {
      for (const cell of row) {
        sum += cell.waterLevel;
      }
    }
    return sum;
  }

  test('water flows from high surface to low surface neighbor', () => {
    const grid = createFlowGrid(3, 3);
    grid[1][1].waterLevel = 4;
    const result = equalizeStep({
      grid,
      elevations: flatElevations(3, 3),
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(3, 3),
    });
    // Center cell should have lost water
    expect(grid[1][1].waterLevel).toBeLessThan(4);
    // Neighbors should have gained water
    expect(grid[0][1].waterLevel).toBeGreaterThan(0);
    expect(grid[1][0].waterLevel).toBeGreaterThan(0);
    expect(grid[1][2].waterLevel).toBeGreaterThan(0);
    expect(grid[2][1].waterLevel).toBeGreaterThan(0);
    // No holes, so puddleDelta should be all zeros
    for (const row of result.puddleDelta) {
      for (const val of row) {
        expect(val).toBe(0);
      }
    }
  });

  test('water does not flow past a wall', () => {
    const grid = createFlowGrid(3, 1);
    grid[0][1].waterLevel = 2;
    const elevations = flatElevations(1, 3);
    // Wall to the right with elevation >= source surface
    elevations[0][2] = 3;
    equalizeStep({
      grid: [grid[0]].map(r => r) as unknown as ReturnType<typeof createFlowGrid>,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(1, 3),
    });
    // Wall cell should have no water
    expect(grid[0][2].waterLevel).toBe(0);
  });

  test('water does not flow past a wall (proper grid)', () => {
    const grid = createFlowGrid(3, 3);
    grid[1][1].waterLevel = 2;
    const elevations = flatElevations(3, 3);
    // Wall to the right: raw elevation >= source surface (terrainSlope + elev >= surface)
    elevations[1][2] = 3;
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(3, 3),
    });
    expect(grid[1][2].waterLevel).toBe(0);
  });

  test('water flows into a hole and gets absorbed', () => {
    const grid = createFlowGrid(3, 3);
    grid[1][1].waterLevel = 4;
    const elevations = flatElevations(3, 3);
    elevations[1][2] = -2;
    const holeDepths = zeroHoleDepths(3, 3);
    holeDepths[1][2] = 2;
    const result = equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: holeDepths,
    });
    // Some water should have been absorbed into the hole
    expect(result.puddleDelta[1][2]).toBeGreaterThan(0);
  });

  test('conserves total water when no holes present', () => {
    const grid = createFlowGrid(5, 5);
    grid[2][2].waterLevel = 10;
    const before = totalWater(grid);
    equalizeStep({
      grid,
      elevations: flatElevations(5, 5),
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(5, 5),
    });
    const after = totalWater(grid);
    expect(after).toBeCloseTo(before, 10);
  });

  test('does nothing when all surfaces are equal', () => {
    const grid = createFlowGrid(3, 3);
    // All cells have equal water
    for (const row of grid) {
      for (const cell of row) {
        cell.waterLevel = 2;
      }
    }
    const snapshot = grid.map(r => r.map(c => c.waterLevel));
    equalizeStep({
      grid,
      elevations: flatElevations(3, 3),
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(3, 3),
    });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(grid[r][c].waterLevel).toBeCloseTo(snapshot[r][c], 10);
      }
    }
  });

  test('flowing water transfers momentum to destination cell', () => {
    const grid = createFlowGrid(5, 5);
    grid[2][2].waterLevel = 4;
    grid[2][2].momentum = { dx: 0, dy: 2 };
    equalizeStep({
      grid,
      elevations: flatElevations(5, 5),
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(5, 5),
    });
    // Downstream neighbor should have gained some dy momentum
    expect(grid[3][2].momentum.dy).toBeGreaterThan(0);
  });

  test('momentum biases flow direction', () => {
    // Neighbors have some water so base flow is below cap, letting momentum bonus show
    const grid = createFlowGrid(5, 1);
    grid[0][2].waterLevel = 8;
    grid[0][1].waterLevel = 6;
    grid[0][3].waterLevel = 6;
    grid[0][2].momentum = { dx: 4, dy: 0 };
    equalizeStep({
      grid,
      elevations: flatElevations(1, 5),
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(1, 5),
    });
    // Right neighbor should get more water than left due to momentum bias
    expect(grid[0][3].waterLevel).toBeGreaterThan(grid[0][1].waterLevel);
  });

  test('wall hit redirects momentum to perpendicular axes', () => {
    const grid = createFlowGrid(3, 3);
    grid[1][1].waterLevel = 2;
    // Downward momentum
    grid[1][1].momentum = { dx: 0, dy: 2 };
    const elevations = flatElevations(3, 3);
    // Wall below
    elevations[2][1] = 5;
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(3, 3),
    });
    // Momentum should have been redirected to dx
    expect(Math.abs(grid[1][1].momentum.dx)).toBeGreaterThan(0);
  });

  test('momentum decays each step', () => {
    const grid = createFlowGrid(3, 3);
    grid[1][1].waterLevel = 4;
    grid[1][1].momentum = { dx: 1, dy: 1 };
    equalizeStep({
      grid,
      elevations: flatElevations(3, 3),
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(3, 3),
    });
    // After transfer + decay, the center cell's remaining momentum should be less than original * MOMENTUM_DECAY
    // (it lost water + momentum was decayed)
    const m = grid[1][1].momentum;
    expect(Math.abs(m.dx)).toBeLessThan(1);
    expect(Math.abs(m.dy)).toBeLessThan(1);
  });

  test('pressure builds when water has no outflow', () => {
    // Water surrounded by walls on all sides
    const grid = createFlowGrid(3, 3);
    grid[1][1].waterLevel = 2;
    const elevations = flatElevations(3, 3);
    elevations[0][1] = 5;
    elevations[2][1] = 5;
    elevations[1][0] = 5;
    elevations[1][2] = 5;
    equalizeStep({
      grid,
      elevations,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(3, 3),
    });
    expect(grid[1][1].pressure).toBeCloseTo(PRESSURE_BUILDUP_RATE);
  });

  test('pressure does not build when water has outflow', () => {
    const grid = createFlowGrid(3, 3);
    grid[1][1].waterLevel = 4;
    equalizeStep({
      grid,
      elevations: flatElevations(3, 3),
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(3, 3),
    });
    expect(grid[1][1].pressure).toBe(0);
  });

  test('pressure allows water to overtop a wall it normally cannot', () => {
    // Wall height = water level + small margin, so normally blocked.
    // After several steps of pressure buildup, water should overtop.
    const grid = createFlowGrid(3, 3);
    const elevations = flatElevations(3, 3);
    // Surround with walls on 3 sides, one side has a wall just barely too tall
    elevations[0][1] = 10;
    elevations[1][0] = 10;
    elevations[1][2] = 10;
    // Wall below is just barely taller than water surface
    const wallHeight = 3;
    elevations[2][1] = wallHeight;
    grid[1][1].waterLevel = 2.5;

    // Without pressure, wall blocks (elev 3 >= surface 2.5)
    // Run several steps to build pressure
    for (let i = 0; i < 20; i++) {
      equalizeStep({
        grid,
        elevations,
        terrainSlope: 0,
        effectiveHoleDepths: zeroHoleDepths(3, 3),
      });
    }
    // After enough pressure, water should have overtopped the wall
    expect(grid[2][1].waterLevel).toBeGreaterThan(0);
  });

  test('pressure resets when water finds an outflow', () => {
    const grid = createFlowGrid(3, 3);
    grid[1][1].waterLevel = 2;
    grid[1][1].pressure = 2;
    // Open flat terrain allows outflow
    equalizeStep({
      grid,
      elevations: flatElevations(3, 3),
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(3, 3),
    });
    expect(grid[1][1].pressure).toBe(0);
  });
});

describe('simulateFlowAdvance', () => {
  function flatElevations(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => new Array(cols).fill(0));
  }

  function zeroHoleDepths(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => new Array(cols).fill(0));
  }

  test('flat grid: water reaches every row', () => {
    const rows = 4;
    const cols = 3;
    const result = simulateFlowAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      poolMap: new Map(),
      castleCol: 1,
      castleRow: rows - 1,
    });
    // maxWaterMap should have > 0 water for every cell
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        expect(result.maxWaterMap[r][c]).toBeGreaterThan(0);
      }
    }
  });

  test('produces one snapshot per row', () => {
    const rows = 5;
    const cols = 3;
    const result = simulateFlowAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [1, 1, 1],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      poolMap: new Map(),
      castleCol: 1,
      castleRow: rows - 1,
    });
    expect(result.snapshots.length).toBe(rows);
  });

  test('wall blocks water and water diverts laterally', () => {
    const rows = 4;
    const cols = 5;
    const elevations = flatElevations(rows, cols);
    // Tall wall across the entire row except edges to force diversion
    elevations[0][2] = 10;
    const result = simulateFlowAdvance({
      elevations,
      columnHeights: [0, 0, 3, 0, 0],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      poolMap: new Map(),
      castleCol: 2,
      castleRow: rows - 1,
    });
    // Wall at row 0 col 2 should block the injection
    expect(result.wallErosionEvents[0][2]).toBe('blocked');
    // Water should not reach the castle behind the wall in center column
    // (wall is too tall to overtop)
    expect(result.maxWaterMap[0][2]).toBe(0);
  });

  test('detects castle flooding', () => {
    const rows = 3;
    const cols = 3;
    const castleRow = 2;
    const castleCol = 1;
    const result = simulateFlowAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [0, 5, 0],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      poolMap: new Map(),
      castleCol,
      castleRow,
    });
    expect(result.castleFlooded).toBe(true);
  });

  test('records puddle deltas from holes', () => {
    const rows = 3;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[1][1] = -3;
    const holeDepths = zeroHoleDepths(rows, cols);
    holeDepths[1][1] = 3;
    const result = simulateFlowAdvance({
      elevations,
      columnHeights: [0, 5, 0],
      terrainSlope: 0,
      effectiveHoleDepths: holeDepths,
      poolMap: new Map(),
      castleCol: 1,
      castleRow: rows - 1,
    });
    expect(result.puddleDelta[1][1]).toBeGreaterThan(0);
  });

  test('returns final grid state', () => {
    const rows = 3;
    const cols = 3;
    const result = simulateFlowAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [1, 1, 1],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      poolMap: new Map(),
      castleCol: 1,
      castleRow: rows - 1,
    });
    expect(result.grid.length).toBe(rows);
    expect(result.grid[0].length).toBe(cols);
  });
});

describe('simulateFlowRecede', () => {
  function flatElevations(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => new Array(cols).fill(0));
  }

  function zeroHoleDepths(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => new Array(cols).fill(0));
  }

  test('flat grid: recede produces snapshots moving upward', () => {
    const rows = 4;
    const cols = 3;
    // First advance to get a grid state
    const advanceResult = simulateFlowAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      poolMap: new Map(),
      castleCol: 1,
      castleRow: rows - 1,
    });
    const recedeResult = simulateFlowRecede({
      elevations: flatElevations(rows, cols),
      advanceGrid: advanceResult.grid,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      poolMap: new Map(),
      castleCol: 1,
      castleRow: rows - 1,
    });
    expect(recedeResult.snapshots.length).toBe(rows);
    // Snapshots should be ordered top-to-bottom (row 0 first)
    // Water should concentrate in top rows as it recedes
    const lastSnapshot = recedeResult.snapshots[recedeResult.snapshots.length - 1];
    // Bottom row should have less water than top in the final snapshot
    const topRowSum = lastSnapshot[0].reduce((a, b) => a + b, 0);
    const bottomRowSum = lastSnapshot[rows - 1].reduce((a, b) => a + b, 0);
    expect(topRowSum).toBeGreaterThanOrEqual(bottomRowSum);
  });

  test('returns maxWaterMap from recede with water in top rows', () => {
    const rows = 4;
    const cols = 3;
    const advanceResult = simulateFlowAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      poolMap: new Map(),
      castleCol: 1,
      castleRow: rows - 1,
    });
    const recedeResult = simulateFlowRecede({
      elevations: flatElevations(rows, cols),
      advanceGrid: advanceResult.grid,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      poolMap: new Map(),
      castleCol: 1,
      castleRow: rows - 1,
    });
    // Top row should have water in maxWaterMap (water receded upward through it)
    const topRowMax = recedeResult.maxWaterMap[0].reduce((a, b) => a + b, 0);
    expect(topRowMax).toBeGreaterThan(0);
  });
});
