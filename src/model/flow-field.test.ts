import { describe, expect, test } from 'vitest';
import { simulateAdvance, simulateRecede } from './flow-field';

function flatElevations(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

function zeroHoleDepths(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
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
    });
    expect(result.wallEvents[1][1]).toBe('blocked');
    expect(result.maxWaterMap[1][1]).toBe(0);
  });

  test('blocked water redistributes to neighbors', () => {
    const rows = 3;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[0][1] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [2, 4, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
    });
    // Col 1 blocked at row 0, its 4 units split to cols 0 and 2
    // Row 0 snapshot: col 0 gets 2 + 2 = 4, col 2 gets 2 + 2 = 4
    expect(result.snapshots[0][0][0]).toBe(4);
    expect(result.snapshots[0][0][2]).toBe(4);
    expect(result.snapshots[0][0][1]).toBe(0);
  });

  test('blocked water only goes to unblocked neighbors', () => {
    const rows = 3;
    const cols = 3;
    const elevations = flatElevations(rows, cols);
    elevations[0][0] = 10;
    elevations[0][1] = 10;
    const result = simulateAdvance({
      elevations,
      columnHeights: [3, 3, 2],
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
    });
    // Col 0 blocked, only neighbor is col 1 which is also blocked
    // Col 1 blocked, left neighbor (col 0) blocked, right neighbor (col 2) unblocked
    // Col 1's 3 units go entirely to col 2
    expect(result.snapshots[0][0][2]).toBe(2 + 3);
    expect(result.snapshots[0][0][0]).toBe(0);
    expect(result.snapshots[0][0][1]).toBe(0);
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
    });
    expect(result.wallEvents[0][1]).toBe('overtopped');
    expect(result.snapshots[0][0][1]).toBe(3);
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
    });
    // Row 0: water passes through (elev 0, no wall/hole)
    // Row 1: hole absorbs all 3 (depth 4 >= incoming 3)
    expect(result.puddleDelta[1][1]).toBe(3);
    expect(result.snapshots[1][1][1]).toBe(0);
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
    });
    expect(result.puddleDelta[1][1]).toBe(2);
    expect(result.snapshots[1][1][1]).toBe(3);
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
    });
    // Row 0: slope 1 reduces 4 to 3
    // Row 1: slope 1 reduces 3 to 2
    // Row 2: slope 1 reduces 2 to 1
    // Row 3: slope 1 reduces 1 to 0 (blocked)
    expect(result.snapshots[0][0][0]).toBe(3);
    expect(result.snapshots[1][1][0]).toBe(2);
    expect(result.snapshots[2][2][0]).toBe(1);
    expect(result.snapshots[3][3][0]).toBe(0);
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
    });
    expect(result.castleFlooded).toBe(true);
  });

  test('castle not flooded when wall blocks', () => {
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
    });
    expect(result.castleFlooded).toBe(false);
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
    });
    const recedeResult = simulateRecede({
      elevations: flatElevations(rows, cols),
      advanceWaterMap: advanceResult.maxWaterMap,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
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
    });
    const recedeResult = simulateRecede({
      elevations: flatElevations(rows, cols),
      advanceWaterMap: advanceResult.maxWaterMap,
      terrainSlope: 0,
      effectiveHoleDepths: zeroHoleDepths(rows, cols),
      castleCol: 1,
      castleRow: rows - 1,
    });
    const topRowMax = recedeResult.maxWaterMap[0].reduce((a, b) => a + b, 0);
    expect(topRowMax).toBeGreaterThan(0);
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
    });
    expect(recedeResult.puddleDelta[1][1]).toBeGreaterThan(0);
  });
});
