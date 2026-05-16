import { describe, expect, test as baseTest } from 'vitest';
import { Scene } from 'excalibur';
import { TileGrid } from './grid';
import { simulateWave } from './wave';

// Minimal Scene stub — TileGrid only calls scene.add(tile) in its constructor.
// We're stubbing a dependency (Scene), not the subject under test (TileGrid).
function makeScene(): Scene {
  return { add: () => {} } as unknown as Scene;
}

const test = baseTest.extend<{ grid: TileGrid }>({
  grid: async ({}, use) => {
    await use(new TileGrid(makeScene()));
  },
});

describe('TileGrid puddle state', () => {
  test('defaults puddleDepth to 0 on all tiles', ({ grid }) => {
    expect(grid.getPuddleDepth(0, 0)).toBe(0);
    expect(grid.getPuddleDepth(5, 5)).toBe(0);
  });

  test('applyPuddleDeltas accumulates per tile, clamped to -elevation', ({ grid }) => {
    grid.setElevation(0, 0, -3);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 2 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(2);

    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 5 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(3);
  });

  test('applyPuddleDeltas ignores tiles with non-negative elevation', ({ grid }) => {
    grid.applyPuddleDeltas([{ col: 1, row: 1, depth: 2 }]);
    expect(grid.getPuddleDepth(1, 1)).toBe(0);
  });

  test('effectiveHoleDepth returns hole depth minus puddle', ({ grid }) => {
    grid.setElevation(2, 2, -4);
    grid.applyPuddleDeltas([{ col: 2, row: 2, depth: 1 }]);
    expect(grid.effectiveHoleDepth(2, 2)).toBe(3);
  });

  test('effectiveHoleDepth returns 0 for flat or wall tiles', ({ grid }) => {
    expect(grid.effectiveHoleDepth(0, 0)).toBe(0);
    grid.setElevation(1, 1, +2);
    expect(grid.effectiveHoleDepth(1, 1)).toBe(0);
  });
});

function gridToPuddleArray(grid: TileGrid): number[][] {
  const elevs = grid.getElevations();
  return elevs.map((row, r) => row.map((_, c) => grid.getPuddleDepth(c, r)));
}

function gridFilledColumnHeights(grid: TileGrid, height: number, only: number): number[] {
  const elevs = grid.getElevations();
  const w = elevs[0]?.length ?? 0;
  return Array.from({ length: w }, (_, c) => c === only ? height : 0);
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

describe('puddle persistence across waves', () => {
  test('second wave sees reduced hole capacity from first wave puddle', ({ grid }) => {
    grid.setElevation(1, 1, -3);

    const wave1 = simulateWave({
      elevations: grid.getElevations(),
      puddleDepths: gridToPuddleArray(grid),
      columnHeights: gridFilledColumnHeights(grid, 2, 1),
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
    });
    grid.applyPuddleDeltas(deltasFromMap(wave1.puddleDelta));
    // First wave fills the hole with ~wave height (minor lateral-spread backflow rounds up).
    const puddleAfterWave1 = grid.getPuddleDepth(1, 1);
    expect(puddleAfterWave1).toBeGreaterThanOrEqual(2);
    expect(puddleAfterWave1).toBeLessThan(3);

    // Below the hole, wave1's advance was fully absorbed: row 2 col 1 should be ~0.
    expect(wave1.advanceHeightMap[2][1]).toBeLessThan(0.5);

    const wave2 = simulateWave({
      elevations: grid.getElevations(),
      puddleDepths: gridToPuddleArray(grid),
      columnHeights: gridFilledColumnHeights(grid, 2, 1),
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
    });
    // Hole's remaining capacity ~1, so wave2 leaks ~1 unit past the hole.
    expect(wave2.advanceHeightMap[2][1]).toBeGreaterThanOrEqual(1);
    expect(wave2.advanceHeightMap[2][1]).toBeLessThan(2);
  });
});
