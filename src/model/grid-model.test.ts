import { describe, expect, test as baseTest } from 'vitest';
import { GridModel, type WallErosionEvent } from './grid-model.ts';
import { MAX_ELEVATION, MIN_ELEVATION } from '../config.ts';

const test = baseTest.extend<{ grid: GridModel }>({
  grid: async ({}, use) => {
    await use(
      new GridModel({ width: 16, height: 16, castleCol: 8, castleRow: 12, castleWidth: 2, castleHeight: 2 }),
    );
  },
});

function emptyEventsMatrix(
  width: number,
  height: number,
): WallErosionEvent[][] {
  return Array.from({ length: height }, () =>
    Array.from<WallErosionEvent>({ length: width }).fill(null),
  );
}

describe('GridModel initialization', () => {
  test('all elevations start at zero', ({ grid }) => {
    const elevs = grid.getElevations();
    for (const row of elevs) {
      for (const val of row) {
        expect(val).toBe(0);
      }
    }
  });

  test('all puddle depths start at zero', ({ grid }) => {
    expect(grid.getPuddleDepth(0, 0)).toBe(0);
    expect(grid.getPuddleDepth(5, 5)).toBe(0);
  });

  test('all hit counts start at zero', ({ grid }) => {
    expect(grid.getHitCount(0, 0)).toBe(0);
    expect(grid.getHitCount(7, 7)).toBe(0);
  });
});

describe('isCastle', () => {
  test('returns true for all cells in 2x2 castle', ({ grid }) => {
    expect(grid.isCastle(8, 12)).toBe(true);
    expect(grid.isCastle(9, 12)).toBe(true);
    expect(grid.isCastle(8, 13)).toBe(true);
    expect(grid.isCastle(9, 13)).toBe(true);
  });

  test('returns false for cells adjacent to castle', ({ grid }) => {
    expect(grid.isCastle(7, 12)).toBe(false);
    expect(grid.isCastle(10, 12)).toBe(false);
    expect(grid.isCastle(8, 11)).toBe(false);
    expect(grid.isCastle(8, 14)).toBe(false);
  });

  test('returns false for non-castle position', ({ grid }) => {
    expect(grid.isCastle(0, 0)).toBe(false);
  });
});

describe('getElevation', () => {
  test('returns 0 for in-bounds default tile', ({ grid }) => {
    expect(grid.getElevation(0, 0)).toBe(0);
  });

  test('returns 0 for out-of-bounds coordinates', ({ grid }) => {
    expect(grid.getElevation(-1, 0)).toBe(0);
    expect(grid.getElevation(0, -1)).toBe(0);
    expect(grid.getElevation(16, 0)).toBe(0);
    expect(grid.getElevation(0, 16)).toBe(0);
  });
});

describe('setElevation', () => {
  test('applies positive delta', ({ grid }) => {
    grid.setElevation(3, 3, +2);
    expect(grid.getElevation(3, 3)).toBe(2);
  });

  test('applies negative delta', ({ grid }) => {
    grid.setElevation(3, 3, -4);
    expect(grid.getElevation(3, 3)).toBe(-4);
  });

  test('clamps to max elevation', ({ grid }) => {
    grid.setElevation(1, 1, 25);
    expect(grid.getElevation(1, 1)).toBe(MAX_ELEVATION);
  });

  test('clamps to min elevation', ({ grid }) => {
    grid.setElevation(1, 1, -25);
    expect(grid.getElevation(1, 1)).toBe(MIN_ELEVATION);
  });

  test('respects custom elevation bounds', ({ grid }) => {
    grid.setElevationBounds(-20, 20);
    grid.setElevation(1, 1, 18);
    expect(grid.getElevation(1, 1)).toBe(18);
    grid.setElevation(2, 2, -18);
    expect(grid.getElevation(2, 2)).toBe(-18);
  });

  test('clears puddle when elevation becomes non-negative', ({ grid }) => {
    grid.setElevation(0, 0, -3);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 2 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(2);

    grid.setElevation(0, 0, +3);
    expect(grid.getElevation(0, 0)).toBe(0);
    expect(grid.getPuddleDepth(0, 0)).toBe(0);
  });

  test('clamps puddle to new hole depth when elevation rises but stays negative', ({ grid }) => {
    grid.setElevation(0, 0, -5);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 4 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(4);

    grid.setElevation(0, 0, +3);
    expect(grid.getElevation(0, 0)).toBe(-2);
    expect(grid.getPuddleDepth(0, 0)).toBe(2);
  });

  test('no-ops for out-of-bounds', ({ grid }) => {
    grid.setElevation(-1, -1, 5);
    expect(grid.getElevation(-1, -1)).toBe(0);
  });
});

describe('getElevations', () => {
  test('returns a copy that does not mutate internal state', ({ grid }) => {
    const elevs = grid.getElevations();
    elevs[0][0] = 999;
    expect(grid.getElevation(0, 0)).toBe(0);
  });
});

describe('applyPuddleDeltas', () => {
  test('accumulates puddle depth, clamped to -elevation', ({ grid }) => {
    grid.setElevation(0, 0, -3);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 2 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(2);

    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 5 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(3);
  });

  test('ignores tiles with non-negative elevation', ({ grid }) => {
    grid.applyPuddleDeltas([{ col: 1, row: 1, depth: 2 }]);
    expect(grid.getPuddleDepth(1, 1)).toBe(0);
  });

  test('ignores out-of-bounds deltas', ({ grid }) => {
    grid.applyPuddleDeltas([{ col: -1, row: -1, depth: 2 }]);
    // no crash
  });
});

describe('effectiveHoleDepth', () => {
  test('returns hole depth minus puddle', ({ grid }) => {
    grid.setElevation(2, 2, -4);
    grid.applyPuddleDeltas([{ col: 2, row: 2, depth: 1 }]);
    expect(grid.effectiveHoleDepth(2, 2)).toBe(3);
  });

  test('returns 0 for flat tile', ({ grid }) => {
    expect(grid.effectiveHoleDepth(0, 0)).toBe(0);
  });

  test('returns 0 for wall tile', ({ grid }) => {
    grid.setElevation(1, 1, +2);
    expect(grid.effectiveHoleDepth(1, 1)).toBe(0);
  });

  test('returns 0 for out-of-bounds', ({ grid }) => {
    expect(grid.effectiveHoleDepth(-1, -1)).toBe(0);
  });
});

describe('hit counts', () => {
  test('incrementHitCount and getHitCount on wall', ({ grid }) => {
    grid.setElevation(3, 3, 5);
    grid.incrementHitCount(3, 3, 2);
    expect(grid.getHitCount(3, 3)).toBe(2);
    grid.incrementHitCount(3, 3, 1);
    expect(grid.getHitCount(3, 3)).toBe(3);
  });

  test('getHitCount returns 0 for flat ground', ({ grid }) => {
    expect(grid.getHitCount(3, 3)).toBe(0);
  });

  test('resetHitCounts clears all hit counts', ({ grid }) => {
    grid.setElevation(0, 0, 5);
    grid.setElevation(1, 1, 3);
    grid.incrementHitCount(0, 0, 5);
    grid.incrementHitCount(1, 1, 3);
    grid.resetHitCounts();
    expect(grid.getHitCount(0, 0)).toBe(0);
    expect(grid.getHitCount(1, 1)).toBe(0);
  });
});

describe('detectPools', () => {
  test('groups adjacent negative tiles into one pool', ({ grid }) => {
    grid.setElevation(3, 3, -2);
    grid.setElevation(4, 3, -1);
    grid.setElevation(3, 4, -3);

    const pools = grid.getPools();
    expect(pools.length).toBe(1);
    expect(pools[0].members.length).toBe(3);
  });

  test('separates non-adjacent negative tiles into different pools', ({ grid }) => {
    grid.setElevation(0, 0, -1);
    grid.setElevation(5, 5, -1);

    const pools = grid.getPools();
    expect(pools.length).toBe(2);
  });

  test('getPool returns pool for negative tile', ({ grid }) => {
    grid.setElevation(2, 2, -1);
    const pool = grid.getPool(2, 2);
    expect(pool).toBeDefined();
    expect(pool!.members).toEqual([{ col: 2, row: 2 }]);
  });

  test('getPool returns undefined for non-negative tile', ({ grid }) => {
    expect(grid.getPool(0, 0)).toBeUndefined();
  });

  test('getPoolMap returns the map', ({ grid }) => {
    grid.setElevation(1, 1, -1);
    const map = grid.getPoolMap();
    expect(map.get('1:1')).toBeDefined();
  });
});

describe('getPoolNeighbors', () => {
  test('returns neighbor connectivity within a pool', ({ grid }) => {
    grid.setElevation(3, 3, -1);
    grid.setElevation(4, 3, -1);
    grid.setElevation(3, 4, -1);

    const neighbors = grid.getPoolNeighbors(3, 3);
    expect(neighbors).toEqual({
      top: false,
      bottom: true,
      left: false,
      right: true,
    });
  });

  test('returns undefined for non-pool tile', ({ grid }) => {
    expect(grid.getPoolNeighbors(0, 0)).toBeUndefined();
  });
});

describe('applyErosion', () => {
  test('erodes wall after 3+ hits', ({ grid }) => {
    grid.setElevation(0, 0, 2);

    const w = 16;
    const h = 16;
    const advance = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));
    const recede = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));

    // Each pass gives 1 hit (advance + recede = 2 per call).
    // We need 2 calls to get 4 hits total (>= 3 triggers erosion).
    advance[0][0] = 4;
    recede[0][0] = 4;

    const result1 = grid.applyErosion(advance, recede);
    // 2 hits, not yet 3
    expect(result1.length).toBe(0);
    expect(grid.getHitCount(0, 0)).toBe(2);

    const result2 = grid.applyErosion(advance, recede);
    // 4 total hits, triggers erosion at 3, remainder 1
    expect(result2.length).toBe(1);
    expect(result2[0]).toMatchObject({ col: 0, row: 0, newElevation: 1 });
  });

  test('erodes hole toward zero after 3+ hits', ({ grid }) => {
    grid.setElevation(1, 1, -2);

    const w = 16;
    const h = 16;
    const advance = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));
    const recede = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));

    advance[1][1] = 4;
    recede[1][1] = 4;

    grid.applyErosion(advance, recede);
    const result = grid.applyErosion(advance, recede);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ col: 1, row: 1, newElevation: -1 });
  });

  test('skips castle tile', ({ grid }) => {
    const w = 16;
    const h = 16;
    const advance = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));
    const recede = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));
    advance[12][8] = 10;
    recede[12][8] = 10;

    grid.applyErosion(advance, recede);
    grid.applyErosion(advance, recede);
    expect(grid.getElevation(8, 12)).toBe(0);
  });
});

describe('applySandRedistribution', () => {
  test('drops wall by 1, sand lost when upstream is flat', ({ grid }) => {
    grid.setElevation(5, 3, +2);
    const events = emptyEventsMatrix(16, 16);
    events[3][5] = 'overtopped';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 3)).toBe(1);
    expect(grid.getElevation(5, 2)).toBe(0);
  });

  test('also redistributes from blocked walls', ({ grid }) => {
    grid.setElevation(5, 3, +3);
    const events = emptyEventsMatrix(16, 16);
    events[3][5] = 'blocked';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 3)).toBe(2);
    expect(grid.getElevation(5, 2)).toBe(0);
  });

  test('drops sand off top edge when wall is in row 0', ({ grid }) => {
    grid.setElevation(5, 0, +2);
    const events = emptyEventsMatrix(16, 16);
    events[0][5] = 'overtopped';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 0)).toBe(1);
  });

  test('drops sand into existing hole upstream', ({ grid }) => {
    grid.setElevation(5, 3, +2);
    grid.setElevation(5, 2, -1);
    const events = emptyEventsMatrix(16, 16);
    events[3][5] = 'overtopped';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 3)).toBe(1);
    expect(grid.getElevation(5, 2)).toBe(0);
  });

  test('skips castle tile', ({ grid }) => {
    const events = emptyEventsMatrix(16, 16);
    events[12][8] = 'overtopped';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(8, 12)).toBe(0);
  });
});

describe('reset', () => {
  test('clears all state back to initial', ({ grid }) => {
    grid.setElevation(3, 3, -5);
    grid.applyPuddleDeltas([{ col: 3, row: 3, depth: 2 }]);
    grid.incrementHitCount(3, 3, 7);

    grid.reset();

    expect(grid.getElevation(3, 3)).toBe(0);
    expect(grid.getPuddleDepth(3, 3)).toBe(0);
    expect(grid.getHitCount(3, 3)).toBe(0);
    expect(grid.getPools().length).toBe(0);
  });
});

describe('serialize', () => {
  test('produces JSON with elevations and castle position', () => {
    const grid = new GridModel({ width: 4, height: 3, castleCol: 2, castleRow: 1, castleWidth: 2, castleHeight: 2 });
    grid.setElevation(0, 0, 3);
    grid.setElevation(1, 0, -2);

    const result = JSON.parse(grid.serialize({ columnHeights: [1.5, 2.0, 3.0, 1.0] }));

    expect(result).toEqual({
      castleCol: 2,
      castleRow: 1,
      elevations: [
        [3, -2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      columnHeights: [1.5, 2.0, 3.0, 1.0],
      puddleDepths: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    });
  });

  test('defaults columnHeights to empty array', () => {
    const grid = new GridModel({ width: 2, height: 2, castleCol: 0, castleRow: 0, castleWidth: 2, castleHeight: 2 });

    const result = JSON.parse(grid.serialize());

    expect(result.columnHeights).toEqual([]);
  });

  test('includes puddleDepths in output', () => {
    const grid = new GridModel({ width: 3, height: 2, castleCol: 1, castleRow: 1, castleWidth: 2, castleHeight: 2 });
    grid.setElevation(0, 0, -3);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 1.5 }]);

    const result = JSON.parse(grid.serialize());

    expect(result.puddleDepths).toEqual([
      [1.5, 0, 0],
      [0, 0, 0],
    ]);
  });
});
