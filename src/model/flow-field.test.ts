import { describe, expect, test } from 'vitest';
import { EqualizingRowSolver, LegacyRowSolver, simulateAdvance, simulateRecede } from './flow-field.ts';
import { WaterColumn } from './water-column.ts';

describe('EqualizingRowSolver', () => {
  const solver = new EqualizingRowSolver(8);

  test('flat water stays flat', () => {
    const result = solver.settle({
      rowWater: [3, 3, 3],
      elevations: [0, 0, 0],
      holeDepths: [0, 0, 0],
      terrainSlope: 0,
    });
    expect(result.waterLevels).toEqual([3, 3, 3]);
  });

  test('water flows into adjacent hole', () => {
    const result = solver.settle({
      rowWater: [4, 0, 0],
      elevations: [0, -3, 0],
      holeDepths: [0, 0, 0],
      terrainSlope: 0,
    });
    // Hole at col 1 has effective surface 0 + waterLevel, flat col 0 has 0 + 4 = 4
    // Water should flow toward the low-surface hole
    expect(result.waterLevels[0]).toBeLessThan(4);
    expect(result.waterLevels[1]).toBeGreaterThan(0);
  });

  test('water flows away from wall', () => {
    const result = solver.settle({
      rowWater: [0, 3, 0],
      elevations: [5, 0, 0],
      holeDepths: [0, 0, 0],
      terrainSlope: 0,
    });
    // Col 0 has high effective surface (wall=5), water should not flow there
    // Water should flow toward col 2 instead
    expect(result.waterLevels[0]).toBe(0);
    expect(result.waterLevels[2]).toBeGreaterThan(0);
  });

  test('wall acts as barrier during equalization', () => {
    const result = solver.settle({
      rowWater: [3, 0, 0, 3],
      elevations: [0, 5, 0, 0],
      holeDepths: [0, 0, 0, 0],
      terrainSlope: 0,
    });
    expect(result.waterLevels[0]).toBe(3);
    expect(result.waterLevels[1]).toBe(0);
    expect(result.waterLevels[2]).toBeLessThan(3);
    expect(result.waterLevels[3]).toBeGreaterThan(0);
  });

  test('convergence within step limit', () => {
    const result = solver.settle({
      rowWater: [10, 0, 0, 0, 0],
      elevations: [0, 0, 0, 0, 0],
      holeDepths: [0, 0, 0, 0, 0],
      terrainSlope: 0,
    });
    for (let col = 0; col < 4; col++) {
      const surfaceA = result.waterLevels[col];
      const surfaceB = result.waterLevels[col + 1];
      expect(Math.abs(surfaceA - surfaceB)).toBeLessThanOrEqual(1);
    }
  });

  test('no transfer when all surfaces within 1', () => {
    const result = solver.settle({
      rowWater: [2, 2, 2],
      elevations: [0, 0, 0],
      holeDepths: [0, 0, 0],
      terrainSlope: 0,
    });
    expect(result.waterLevels).toEqual([2, 2, 2]);
  });

  test('hole absorption', () => {
    const result = solver.settle({
      rowWater: [0, 5, 0],
      elevations: [0, -3, 0],
      holeDepths: [0, 2, 0],
      terrainSlope: 0,
    });
    expect(result.absorbed[1]).toBe(2);
    // Water level reduced by absorbed amount (before absorption, equalization may have moved water)
    const totalWater = result.waterLevels.reduce((a, b) => a + b, 0);
    expect(totalWater).toBeCloseTo(5 - 2);
  });
});

describe('EqualizingRowSolver.settleColumns', () => {
  const solver = new EqualizingRowSolver(8);

  test('flat water stays flat', () => {
    const columns = [
      new WaterColumn(0, 3),
      new WaterColumn(0, 3),
      new WaterColumn(0, 3),
    ];
    const result = solver.settleColumns(columns, [0, 0, 0]);
    for (const col of result) {
      expect(col.surfaceLevel).toBe(3);
    }
  });

  test('water flows toward lower surface', () => {
    const columns = [
      new WaterColumn(0, 6),
      new WaterColumn(0, 0),
      new WaterColumn(0, 0),
    ];
    const result = solver.settleColumns(columns, [0, 0, 0]);
    expect(result[0].surfaceLevel).toBeLessThan(6);
    expect(result[1].surfaceLevel).toBeGreaterThan(0);
  });

  test('positive-elevation cells are skipped during equalization', () => {
    const columns = [
      new WaterColumn(0, 4),
      new WaterColumn(0, 0),
      new WaterColumn(0, 4),
    ];
    const result = solver.settleColumns(columns, [0, 5, 0]);
    expect(result[0].surfaceLevel).toBe(4);
    expect(result[1].surfaceLevel).toBe(0);
    expect(result[2].surfaceLevel).toBe(4);
  });

  test('transfer adjusts surfaceLevel while preserving floorLevel', () => {
    const columns = [
      new WaterColumn(-3, 5),
      new WaterColumn(0, 0),
    ];
    const result = solver.settleColumns(columns, [-3, 0]);
    expect(result[0].floorLevel).toBe(-3);
    expect(result[1].floorLevel).toBe(0);
    expect(result[0].surfaceLevel).toBeLessThan(5);
    expect(result[1].surfaceLevel).toBeGreaterThan(0);
  });

  test('does not modify original columns', () => {
    const columns = [
      new WaterColumn(0, 6),
      new WaterColumn(0, 0),
    ];
    solver.settleColumns(columns, [0, 0]);
    expect(columns[0].surfaceLevel).toBe(6);
    expect(columns[1].surfaceLevel).toBe(0);
  });

  test('empty columns after applyTerrain on positive elevation are blocked', () => {
    const col0 = new WaterColumn(0, 3);
    const col1 = new WaterColumn(0, 3);
    col1.applyTerrain(10);
    const col2 = new WaterColumn(0, 3);
    const columns = [col0, col1, col2];
    const result = solver.settleColumns(columns, [0, 10, 0]);
    expect(result[1].isEmpty()).toBe(true);
    expect(result[0].surfaceLevel).toBe(3);
    expect(result[2].surfaceLevel).toBe(3);
  });

  test('no zeroing loop - water on overtopped hills stays put', () => {
    const col = new WaterColumn(2, 5);
    const columns = [
      new WaterColumn(0, 0),
      col,
      new WaterColumn(0, 0),
    ];
    const result = solver.settleColumns(columns, [0, 2, 0]);
    expect(result[1].surfaceLevel).toBe(5);
    expect(result[1].depth).toBe(3);
  });

  test('convergence within step limit', () => {
    const columns = [
      new WaterColumn(0, 10),
      new WaterColumn(0, 0),
      new WaterColumn(0, 0),
      new WaterColumn(0, 0),
      new WaterColumn(0, 0),
    ];
    const result = solver.settleColumns(columns, [0, 0, 0, 0, 0]);
    for (let i = 0; i < result.length - 1; i++) {
      expect(
        Math.abs(result[i].surfaceLevel - result[i + 1].surfaceLevel),
      ).toBeLessThanOrEqual(1);
    }
  });
});

function flatElevations(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => Array.from<number>({ length: cols }).fill(0));
}

function zeroHoleDepths(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => Array.from<number>({ length: cols }).fill(0));
}

describe('simulateAdvance', () => {
  test('flat grid: water reaches every row', () => {
    const rows = 4;
    const cols = 3;
    const result = simulateAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        expect(result.maxWaterMap[r][c]).toBeGreaterThan(0);
      }
    }
  });

  test('one snapshot per row', () => {
    const rows = 5;
    const cols = 3;
    const result = simulateAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [1, 1, 1],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    expect(result.snapshots.length).toBe(rows);
  });

  test('wall taller than wave blocks column', () => {
    const rows = 4;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[1][1] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [3, 3, 3],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    expect(result.wallEvents[1][1]).toBe('blocked');
    expect(result.maxWaterMap[1][1]).toBe(0);
  });

  test('blocked water redistributes to neighbors (legacy)', () => {
    const rows = 3;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[0][1] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 6, 0],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
      rowSolver: new LegacyRowSolver(0, 1),
    });
    // Col 1 blocked at row 0, its 6 units split to cols 0 and 2
    expect(result.maxWaterMap[0][0]).toBe(3);
    expect(result.maxWaterMap[0][2]).toBe(3);
    expect(result.maxWaterMap[0][1]).toBe(0);
  });

  test('blocked water only goes to unblocked neighbors (legacy)', () => {
    const rows = 3;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    // Two adjacent walls: col 0 and col 1 both have walls
    elevations[0][0] = 10;
    elevations[0][1] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [3, 6, 0],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
      rowSolver: new LegacyRowSolver(0, 1),
    });
    // Col 0: blocked by wall (incoming 3 < wall 10), neighbor col 1 also blocked
    // Col 1: blocked by wall (incoming 6 < wall 10), left neighbor blocked, right neighbor open
    // Col 1's water goes entirely to col 2
    expect(result.maxWaterMap[0][2]).toBe(6);
    expect(result.maxWaterMap[0][0]).toBe(0);
    expect(result.maxWaterMap[0][1]).toBe(0);
  });

  test('all columns blocked means no water anywhere', () => {
    const rows = 3;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[0][0] = 10;
    elevations[0][1] = 10;
    elevations[0][2] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        expect(result.maxWaterMap[r][c]).toBe(0);
      }
    }
  });

  test('wall shorter than wave reduces and records overtopped', () => {
    const rows = 3;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[0][1] = 2;
    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 5, 0],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    expect(result.wallEvents[0][1]).toBe('overtopped');
    // Total water in row 0 is 3 (5 - 2 wall), spread across columns by equalizer
    const totalRow0 = result.maxWaterMap[0].reduce((a, b) => a + b, 0);
    expect(totalRow0).toBe(3);
  });

  test('hole absorbs water up to effective depth', () => {
    const rows = 3;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[1][1] = -4;
    const holeDepths = zeroHoleDepths(rows, cols);
    holeDepths[1][1] = 4;
    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 3, 0],
      terrainSlope: 0,
      effectiveHoleDepths: holeDepths,
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    // Water spreads laterally before reaching hole; hole absorbs what arrives
    expect(result.puddleDelta[1][1]).toBeGreaterThan(0);
    // Total water absorbed should not exceed what entered the system
    const totalAbsorbed = result.puddleDelta.flat().reduce((a, b) => a + b, 0);
    expect(totalAbsorbed).toBeLessThanOrEqual(3);
  });

  test('hole shallower than wave absorbs partial', () => {
    const rows = 3;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[1][1] = -2;
    const holeDepths = zeroHoleDepths(rows, cols);
    holeDepths[1][1] = 2;
    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 5, 0],
      terrainSlope: 0,
      effectiveHoleDepths: holeDepths,
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    // Hole absorbs up to its capacity; equalizer may reduce water at hole col
    expect(result.puddleDelta[1][1]).toBeGreaterThan(0);
    expect(result.puddleDelta[1][1]).toBeLessThanOrEqual(2);
  });

  test('terrain slope reduces wave per row', () => {
    const rows = 4;
    const cols = 1;
    const result = simulateAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [4],
      terrainSlope: 1,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 0,
      castleRow: rows - 1,
      castleWidth: 1,
      castleHeight: 1,
    });
    // Row 0: slope 1 reduces 4 to 3
    // Row 1: slope 1 reduces 3 to 2
    // Row 2: slope 1 reduces 2 to 1
    // Row 3: slope 1 reduces 1 to 0 (blocked)
    expect(result.maxWaterMap[0][0]).toBe(3);
    expect(result.maxWaterMap[1][0]).toBe(2);
    expect(result.maxWaterMap[2][0]).toBe(1);
    expect(result.maxWaterMap[3][0]).toBe(0);
  });

  test('snapshots are cumulative (each includes all prior rows)', () => {
    const rows = 3;
    const cols = 3;
    const result = simulateAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    // Snapshot 0: water in row 0 only
    expect(result.snapshots[0][0][1]).toBeGreaterThan(0);
    expect(result.snapshots[0][1][1]).toBe(0);
    // Snapshot 1: water in rows 0 and 1
    expect(result.snapshots[1][0][1]).toBeGreaterThan(0);
    expect(result.snapshots[1][1][1]).toBeGreaterThan(0);
    // Snapshot 2: water in all rows
    expect(result.snapshots[2][0][1]).toBeGreaterThan(0);
    expect(result.snapshots[2][2][1]).toBeGreaterThan(0);
  });

  test('castle flooding detection', () => {
    const rows = 3;
    const cols = 3;
    const result = simulateAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [0, 5, 0],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: 2,
      castleWidth: 2,
      castleHeight: 2,
    });
    expect(result.castleFlooded).toBe(true);
  });

  test('castle not flooded when wall blocks (legacy solver)', () => {
    const rows = 3;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[0][1] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 3, 0],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: 2,
      castleWidth: 1,
      castleHeight: 1,
      rowSolver: new LegacyRowSolver(0, 1),
    });
    expect(result.castleFlooded).toBe(false);
  });

  test('wall blocks water when no adjacent columns have flow (equalizing solver)', () => {
    const rows = 3;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[0][1] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 3, 0],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: 2,
      castleWidth: 2,
      castleHeight: 2,
    });
    expect(result.maxWaterMap[0][0]).toBe(0);
    expect(result.maxWaterMap[0][1]).toBe(0);
    expect(result.maxWaterMap[0][2]).toBe(0);
  });

  test('wall redirects blocked water to neighbors with flow (equalizing solver)', () => {
    const rows = 3;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[0][1] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [2, 3, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: 2,
      castleWidth: 2,
      castleHeight: 2,
    });
    expect(result.maxWaterMap[0][0]).toBeGreaterThan(2);
    expect(result.maxWaterMap[0][1]).toBe(0);
    expect(result.maxWaterMap[0][2]).toBeGreaterThan(2);
  });

  test('lateral spreading transfers water when difference exceeds threshold', () => {
    const rows = 3;
    const cols = 3;
    const result = simulateAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [5, 0, 0],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
      rowSolver: new LegacyRowSolver(0.3, 1),
    });
    // Col 0 has 5, col 1 has 0 => diff 5, above threshold 1
    // Transfer = (5 - 1) * 0.3 = 1.2 to col 1
    // Then col 1 (1.2) vs col 2 (0) => diff 1.2 > 1, transfer = (1.2 - 1) * 0.3 = 0.06
    expect(result.maxWaterMap[0][0]).toBeCloseTo(3.8);
    expect(result.maxWaterMap[0][1]).toBeCloseTo(1.14);
    expect(result.maxWaterMap[0][2]).toBeCloseTo(0.06);
  });

  test('lateral spreading does not trigger when difference is within threshold', () => {
    const rows = 3;
    const cols = 3;
    const result = simulateAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [3, 2.5, 3],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
      rowSolver: new LegacyRowSolver(0.3, 1),
    });
    // Max diff is 0.5, below threshold of 1 => no spreading
    expect(result.maxWaterMap[0][0]).toBe(3);
    expect(result.maxWaterMap[0][1]).toBe(2.5);
    expect(result.maxWaterMap[0][2]).toBe(3);
  });

  test('lateral spreading fills gap behind a single-column wall', () => {
    const rows = 4;
    const cols = 5;
    const elevations = flatElevations(rows, cols);
    elevations[1][2] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [3, 3, 3, 3, 3],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 2,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
      rowSolver: new LegacyRowSolver(0.3, 1),
    });
    // Wall blocks col 2, redistributes to cols 1 and 3
    // After redistribution, cols 1 and 3 have 4.5 each
    // Lateral spreading then pushes some water toward cols 0, 2(dry behind wall), 4
    // Castle col 2 should receive water from spreading
    expect(result.maxWaterMap[2][2]).toBeGreaterThan(0);
  });

  test('redistribution does not leak water through a wall that had no incoming (legacy solver)', () => {
    const rows = 3;
    const cols = 5;
    const elevations = flatElevations(rows, cols);
    elevations[0][2] = 10;
    elevations[1][1] = 10;
    elevations[1][2] = 10;
    elevations[1][3] = 10;

    const result = simulateAdvance({
      elevations,
      columnHeights: [0, 5, 5, 5, 0],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 2,
      castleRow: 2,
      castleWidth: 2,
      castleHeight: 2,
      rowSolver: new LegacyRowSolver(0, 1),
    });

    expect(result.castleFlooded).toBe(false);
  });
});

describe('simulateAdvance with EqualizingRowSolver (default)', () => {
  test('flat grid: water reaches every row', () => {
    const rows = 4;
    const cols = 3;
    const result = simulateAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        expect(result.maxWaterMap[r][c]).toBeGreaterThan(0);
      }
    }
  });

  test('single wall column: blocked water redistributes without loss', () => {
    const rows = 4;
    const cols = 5;
    const elevations = flatElevations(rows, cols);
    elevations[1][2] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [3, 3, 3, 3, 3],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 2,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    const row1Total = result.maxWaterMap[1].reduce((a, b) => a + b, 0);
    expect(row1Total).toBeGreaterThan(0);
    expect(result.maxWaterMap[1][2]).toBe(0);
  });

  test('wall + hole: hole behind wall fills from adjacent columns', () => {
    const rows = 4;
    const cols = 5;
    const elevations = flatElevations(rows, cols);
    elevations[1][2] = 10;
    elevations[2][2] = -3;
    const holeDepths = zeroHoleDepths(rows, cols);
    holeDepths[2][2] = 3;
    const result = simulateAdvance({
      elevations,
      columnHeights: [3, 3, 3, 3, 3],
      terrainSlope: 0,
      effectiveHoleDepths: holeDepths,
      castleCol: 2,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    expect(result.puddleDelta[2][2]).toBeGreaterThan(0);
  });

  test('enclosed pool: walls prevent water from leaking inside', () => {
    const rows = 5;
    const cols = 5;
    const elevations = flatElevations(rows, cols);
    // Walls forming an enclosure around col 2, rows 1-3
    elevations[1][1] = 10;
    elevations[1][2] = 10;
    elevations[1][3] = 10;
    elevations[2][1] = 10;
    elevations[2][3] = 10;
    elevations[3][1] = 10;
    elevations[3][2] = 10;
    elevations[3][3] = 10;
    // Interior hole
    elevations[2][2] = -5;
    const holeDepths = zeroHoleDepths(rows, cols);
    holeDepths[2][2] = 5;
    const result = simulateAdvance({
      elevations,
      columnHeights: [5, 5, 5, 5, 5],
      terrainSlope: 0,
      effectiveHoleDepths: holeDepths,
      castleCol: 2,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    expect(result.maxWaterMap[2][2]).toBe(0);
    expect(result.puddleDelta[2][2]).toBe(0);
  });
});

describe('simulateRecede', () => {
  test('one snapshot per row', () => {
    const rows = 4;
    const cols = 3;
    const advanceResult = simulateAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    const recedeResult = simulateRecede({
      elevations: flatElevations(rows, cols),
      advanceWaterMap: advanceResult.maxWaterMap,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    expect(recedeResult.snapshots.length).toBe(rows);
  });

  test('water appears in top rows', () => {
    const rows = 4;
    const cols = 3;
    const advanceResult = simulateAdvance({
      elevations: flatElevations(rows, cols),
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    const recedeResult = simulateRecede({
      elevations: flatElevations(rows, cols),
      advanceWaterMap: advanceResult.maxWaterMap,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    const topRowMax = recedeResult.maxWaterMap[0].reduce((a, b) => a + b, 0);
    expect(topRowMax).toBeGreaterThan(0);
  });

  test('wall blocking receding water produces blocked event', () => {
    const rows = 4;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    // Wall at row 1 col 1, tall enough to block
    elevations[1][1] = 10;
    const advanceResult = simulateAdvance({
      elevations,
      columnHeights: [2, 2, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    // Water flows around the wall during advance, reaching rows south of it
    // During recede, water at row 2 tries to flow north and hits the wall at row 1
    const recedeResult = simulateRecede({
      elevations,
      advanceWaterMap: advanceResult.maxWaterMap,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    expect(recedeResult.wallEvents[1][1]).toBe('blocked');
  });

  test('wall partially blocking receding water produces overtopped event', () => {
    const rows = 4;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    // Short wall at row 1 col 1
    elevations[1][1] = 1;
    const advanceResult = simulateAdvance({
      elevations,
      columnHeights: [5, 5, 5],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    const recedeResult = simulateRecede({
      elevations,
      advanceWaterMap: advanceResult.maxWaterMap,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    expect(recedeResult.wallEvents[1][1]).toBe('overtopped');
  });

  test('hole absorbs receding water', () => {
    const rows = 4;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[1][1] = -3;
    const advanceHoleDepths = zeroHoleDepths(rows, cols);
    advanceHoleDepths[1][1] = 3;
    const advanceResult = simulateAdvance({
      elevations,
      columnHeights: [0, 5, 0],
      terrainSlope: 0,
      effectiveHoleDepths: advanceHoleDepths,
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });

    // Fresh hole depths for recede (simulate hole having capacity again)
    const recedeHoleDepths = zeroHoleDepths(rows, cols);
    recedeHoleDepths[1][1] = 2;
    const recedeResult = simulateRecede({
      elevations,
      advanceWaterMap: advanceResult.maxWaterMap,
      terrainSlope: 0,
      effectiveHoleDepths: recedeHoleDepths,
      castleCol: 1,
      castleRow: rows - 1,
      castleWidth: 2,
      castleHeight: 2,
    });
    expect(recedeResult.puddleDelta).toBeDefined();
    expect(recedeResult.snapshots.length).toBe(rows);
  });
});
