import { describe, it, expect } from 'vitest';
import { simulateWave } from './wave-simulation.ts';
import { FlatGround, Hole, Wall, type Terrain } from './terrain.ts';

function cellsFromElevations(elevations: number[][]): Terrain[][] {
  return elevations.map(row =>
    row.map(e => {
      if (e > 0) {
        return new Wall(e);
      }
      if (e < 0) {
        return new Hole(-e);
      }
      return new FlatGround();
    }),
  );
}

describe('simulateWave', () => {
  const flat3x3 = cellsFromElevations([
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]);

  it('flat grid: wave reaches every row', () => {
    const result = simulateWave({
      cells: flat3x3,
      columnHeights: [1, 1, 1],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    for (const v of result.advanceHeightMap[0]) {
      expect(v).toBeGreaterThan(0);
    }
    for (const v of result.advanceHeightMap[2]) {
      expect(v).toBeGreaterThan(0);
    }
  });

  it('flat grid: castle floods', () => {
    const result = simulateWave({
      cells: flat3x3,
      columnHeights: [1, 1, 1],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    expect(result.castleFlooded).toBe(true);
  });

  it('wall taller than wave blocks flood', () => {
    const result = simulateWave({
      cells: cellsFromElevations([
        [0, 2, 0],
        [0, 0, 0],
        [0, 0, 0],
      ]),
      columnHeights: [0, 1, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    expect(result.castleFlooded).toBe(false);
  });

  it('hole absorbs wave water', () => {
    const result = simulateWave({
      cells: cellsFromElevations([
        [0, 0, 0],
        [0, -2, 0],
        [0, 0, 0],
      ]),
      columnHeights: [0, 1, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    expect(result.puddleDelta[1][1]).toBeGreaterThanOrEqual(0.5);
  });

  it('partial wall reduces wave height', () => {
    const result = simulateWave({
      cells: cellsFromElevations([
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ]),
      columnHeights: [3, 3, 3],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    expect(result.advanceHeightMap[2][1]).toBeGreaterThan(0);
    expect(result.advanceHeightMap[2][1]).toBeLessThan(3);
  });

  it('returns advance and recede frames', () => {
    const result = simulateWave({
      cells: flat3x3,
      columnHeights: [1, 1, 1],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    expect(result.advanceFrames.length).toBeGreaterThan(0);
    expect(result.recedeFrames.length).toBeGreaterThan(0);
    expect(result.recedeHeightMap[0][0]).toBeGreaterThan(0);
  });

  it('sums puddle deltas from both passes', () => {
    const result = simulateWave({
      cells: cellsFromElevations([
        [0, 0, 0],
        [0, -3, 0],
        [0, 0, 0],
      ]),
      columnHeights: [0, 2, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    expect(result.puddleDelta[1][1]).toBeGreaterThanOrEqual(1);
  });
});
