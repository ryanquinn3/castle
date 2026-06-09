import { describe, expect, test as baseTest } from 'vitest';
import { GridModel, type WallErosionEvent } from './grid-model.ts';
import { MIN_ELEVATION } from '../config.ts';
import { Hole } from './terrain/hole.ts';
import { Tower } from './terrain/tower.ts';
import { Wall } from './terrain/wall.ts';

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
  test('applies positive delta on a hole raises it', ({ grid }) => {
    grid.setElevation(3, 3, -4);
    grid.setElevation(3, 3, +2);
    expect(grid.getElevation(3, 3)).toBe(-2);
  });

  test('applies negative delta', ({ grid }) => {
    grid.setElevation(3, 3, -4);
    expect(grid.getElevation(3, 3)).toBe(-4);
  });

  test('clamps to max elevation (no effect on flat ground with positive delta)', ({ grid }) => {
    grid.setElevation(1, 1, 25);
    expect(grid.getElevation(1, 1)).toBe(0);
  });

  test('clamps to min elevation', ({ grid }) => {
    grid.setElevation(1, 1, -25);
    expect(grid.getElevation(1, 1)).toBe(MIN_ELEVATION);
  });

  test('respects custom elevation bounds for negative delta', ({ grid }) => {
    grid.setElevationBounds(-20, 20);
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
    grid.placeWall(1, 1, 1);
    expect(grid.effectiveHoleDepth(1, 1)).toBe(0);
  });

  test('returns 0 for out-of-bounds', ({ grid }) => {
    expect(grid.effectiveHoleDepth(-1, -1)).toBe(0);
  });
});

describe('hit counts', () => {
  test('incrementHitCount and getHitCount on hole', ({ grid }) => {
    grid.setElevation(3, 3, -2);
    grid.incrementHitCount(3, 3, 2);
    expect(grid.getHitCount(3, 3)).toBe(2);
    grid.incrementHitCount(3, 3, 1);
    expect(grid.getHitCount(3, 3)).toBe(3);
  });

  test('getHitCount returns 0 for wall (walls use HP, not hitCount)', ({ grid }) => {
    grid.placeWall(3, 3, 1);
    grid.incrementHitCount(3, 3, 5);
    expect(grid.getHitCount(3, 3)).toBe(0);
  });

  test('getHitCount returns 0 for flat ground', ({ grid }) => {
    expect(grid.getHitCount(3, 3)).toBe(0);
  });

  test('resetHitCounts clears hit counts on holes', ({ grid }) => {
    grid.setElevation(0, 0, -5);
    grid.setElevation(1, 1, -3);
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
  test('destroys wall when HP reaches 0 via applyErosion', ({ grid }) => {
    grid.placeWall(0, 0, 1); // L1 wall: elevation 5, hp 15

    const w = 16;
    const h = 16;
    const advance = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));
    const recede = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));

    // Water depth 7 overtops by 2 (7 - 5 = 2 >= 2), each applyErosion call hits twice (advance + recede)
    advance[0][0] = 7;
    recede[0][0] = 7;

    // Apply 7 times to accumulate 14 hits (hp goes from 15 to 1)
    for (let i = 0; i < 7; i++) {
      grid.applyErosion(advance, recede);
    }
    expect((grid.getCell(0, 0) as unknown as Wall).hp).toBe(1);

    // One more call: 2 more hits, hp goes to -1 <= 0 -> destroyed
    const result = grid.applyErosion(advance, recede);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ col: 0, row: 0, newElevation: 0 });
    expect(grid.getElevation(0, 0)).toBe(0);
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
  test('walls are immutable to sand redistribution', ({ grid }) => {
    grid.placeWall(5, 3, 1);
    const events = emptyEventsMatrix(16, 16);
    events[3][5] = 'overtopped';
    grid.applySandRedistribution(events);
    // Wall applyDelta is a no-op; elevation stays 5
    expect(grid.getElevation(5, 3)).toBe(5);
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

describe('placeTower', () => {
  test('places tower on flat ground', ({ grid }) => {
    grid.placeTower(3, 3);
    expect(grid.getElevation(3, 3)).toBe(15);
    expect(grid.getCell(3, 3)).toBeInstanceOf(Tower);
  });

  test('returns false on non-flat ground', ({ grid }) => {
    grid.placeWall(3, 3, 1);
    expect(grid.placeTower(3, 3)).toBe(false);
    expect(grid.getCell(3, 3)).not.toBeInstanceOf(Tower);
  });

  test('returns false on castle cell', ({ grid }) => {
    expect(grid.placeTower(8, 12)).toBe(false);
  });

  test('returns false out of bounds', ({ grid }) => {
    expect(grid.placeTower(-1, 0)).toBe(false);
  });

  test('tower immutable to setElevation', ({ grid }) => {
    grid.placeTower(3, 3);
    grid.setElevation(3, 3, -5);
    expect(grid.getElevation(3, 3)).toBe(15);
    expect(grid.getCell(3, 3)).toBeInstanceOf(Tower);
  });
});

describe('tower erosion', () => {
  test('tower erodes after TOWER_HITS_PER_EROSION hits via applyErosion', ({ grid }) => {
    grid.placeTower(0, 0);
    const w = 16;
    const h = 16;
    const advance = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));
    const recede = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));
    advance[0][0] = 20;
    recede[0][0] = 20;

    for (let i = 0; i < 5; i++) {
      grid.applyErosion(advance, recede);
    }
    expect(grid.getElevation(0, 0)).toBe(14);
  });

  test('tower hit count increments correctly', ({ grid }) => {
    grid.placeTower(0, 0);
    grid.incrementHitCount(0, 0, 5);
    expect(grid.getHitCount(0, 0)).toBe(5);
  });
});

describe('tower serialization', () => {
  test('tower appears in serialized cells', ({ grid }) => {
    grid.placeTower(3, 3);
    const result = JSON.parse(grid.serialize());
    expect(result.cells[3][3]).toEqual({ type: 'tower', height: 15 });
  });
});

describe('neighborsOf', () => {
  test('returns adjacent terrain instances', ({ grid }) => {
    grid.placeWall(5, 5, 1); // wall
    grid.setElevation(5, 4, -1); // hole to the north
    const n = grid.neighborsOf(5, 5);
    expect(n.north).toBe(grid.getCell(5, 4));
    expect(n.south).toBe(grid.getCell(5, 6));
    expect(n.east).toBe(grid.getCell(6, 5));
    expect(n.west).toBe(grid.getCell(4, 5));
  });

  test('returns null past the grid edge', ({ grid }) => {
    const n = grid.neighborsOf(0, 0);
    expect(n.north).toBeNull();
    expect(n.west).toBeNull();
    expect(n.south).not.toBeNull();
    expect(n.east).not.toBeNull();
  });

  test('terrain.neighbors reflects live state after a cell is replaced', ({ grid }) => {
    grid.placeWall(5, 5, 1);
    const wall = grid.getCell(5, 5);
    expect(wall.neighbors.east).toBe(grid.getCell(6, 5)); // flat
    grid.placeWall(6, 5, 1); // replace east neighbor with a wall
    expect(wall.connectsTo(wall.neighbors.east)).toBe(true);
  });
});

describe('hole neighbor awareness', () => {
  test('a hole sees adjacent holes via this.neighbors', ({ grid }) => {
    grid.setElevation(3, 3, -1);
    grid.setElevation(4, 3, -1); // east
    grid.setElevation(3, 4, -1); // south

    const hole = grid.getCell(3, 3) as Hole;
    expect(hole.neighbors.south).toBeInstanceOf(Hole);
    expect(hole.neighbors.east).toBeInstanceOf(Hole);
    expect(hole.neighbors.north).not.toBeInstanceOf(Hole);
    expect(hole.neighbors.west).not.toBeInstanceOf(Hole);
  });

  test('hole getRenderInfo exposes a stable cacheKey reflecting neighbors', ({ grid }) => {
    grid.setElevation(3, 3, -1);
    const before = (grid.getCell(3, 3) as Hole).getRenderInfo().cacheKey;
    grid.setElevation(4, 3, -1); // add an east hole neighbor
    const after = (grid.getCell(3, 3) as Hole).getRenderInfo().cacheKey;
    expect(before).not.toEqual(after);
  });
});

describe('placeWall', () => {
  test('places a level-1 wall on flat ground', ({ grid }) => {
    expect(grid.placeWall(3, 3, 1)).toBe(true);
    const cell = grid.getCell(3, 3);
    expect(cell).toBeInstanceOf(Wall);
    expect(cell.elevation).toBe(5);
  });

  test('rejects level 2 on flat ground', ({ grid }) => {
    expect(grid.placeWall(3, 3, 2)).toBe(false);
    expect(grid.getCell(3, 3).elevation).toBe(0);
  });

  test('upgrades level 1 to level 2', ({ grid }) => {
    grid.placeWall(3, 3, 1);
    expect(grid.placeWall(3, 3, 2)).toBe(true);
    expect((grid.getCell(3, 3) as unknown as Wall).level).toBe(2);
  });

  test('rejects skipping a level (3 on level 1)', ({ grid }) => {
    grid.placeWall(3, 3, 1);
    expect(grid.placeWall(3, 3, 3)).toBe(false);
  });

  test('rejects placement on the castle', ({ grid }) => {
    expect(grid.placeWall(8, 12, 1)).toBe(false);
  });

  test('returns false for out-of-bounds coordinates', ({ grid }) => {
    expect(grid.placeWall(-1, 0, 1)).toBe(false);
    expect(grid.placeWall(0, 999, 1)).toBe(false);
  });

  test('wall hp persists across resetHitCounts', ({ grid }) => {
    grid.placeWall(3, 3, 1);
    grid.placeWall(3, 3, 2);
    grid.placeWall(3, 3, 3);
    grid.placeWall(3, 3, 4);
    const wall = grid.getCell(3, 3) as unknown as Wall;
    wall.applyHits(50);
    const hpAfter = wall.hp;
    grid.resetHitCounts();
    expect((grid.getCell(3, 3) as unknown as Wall).hp).toBe(hpAfter);
  });
});

describe('serialize', () => {
  test('produces JSON with cells and castle object', () => {
    const grid = new GridModel({ width: 4, height: 3, castleCol: 2, castleRow: 1, castleWidth: 2, castleHeight: 2 });
    grid.placeWall(0, 0, 1);
    grid.setElevation(1, 0, -2);

    const result = JSON.parse(grid.serialize({ columnHeights: [1.5, 2.0, 3.0, 1.0] }));

    expect(result.castle).toEqual({ col: 2, row: 1, width: 2, height: 2 });
    expect(result.columnHeights).toEqual([1.5, 2.0, 3.0, 1.0]);
    expect(result.cells[0][0]).toMatchObject({ type: 'wall', height: 5, level: 1, hp: 15 });
    expect(result.cells[0][1]).toEqual({ type: 'hole', height: -2, puddleDepth: 0 });
    expect(result.cells[0][2]).toEqual({ type: 'flat', height: 0 });
    expect(result.elevations).toBeUndefined();
    expect(result.puddleDepths).toBeUndefined();
  });

  test('defaults columnHeights to empty array', () => {
    const grid = new GridModel({ width: 2, height: 2, castleCol: 0, castleRow: 0, castleWidth: 2, castleHeight: 2 });
    const result = JSON.parse(grid.serialize());
    expect(result.columnHeights).toEqual([]);
  });

  test('includes puddleDepth in hole cells', () => {
    const grid = new GridModel({ width: 3, height: 2, castleCol: 1, castleRow: 1, castleWidth: 2, castleHeight: 2 });
    grid.setElevation(0, 0, -3);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 1.5 }]);

    const result = JSON.parse(grid.serialize());
    expect(result.cells[0][0]).toEqual({ type: 'hole', height: -3, puddleDepth: 1.5 });
  });
});
