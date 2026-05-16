import { describe, expect, test as baseTest } from 'vitest';
import { Scene } from 'excalibur';
import { TileGrid } from './grid';

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
