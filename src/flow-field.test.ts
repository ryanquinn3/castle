import { describe, expect, test } from 'vitest';
import { createFlowGrid, injectRow } from './flow-field';
import { FLOW_MIN_WATER } from './config';

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
