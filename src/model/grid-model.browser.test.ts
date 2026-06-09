import { describe } from "vitest";
import { expect, test } from "../test/excalibur-browser-test.ts";
import { GridModel, type WallErosionEvent } from "./grid-model.ts";
import { FlatGround } from "./terrain/flat-ground.ts";
import { Hole } from "./terrain/hole.ts";
import { Tower } from "./terrain/tower.ts";
import { Wall } from "./terrain/wall.ts";
import { MIN_ELEVATION } from "../config.ts";

function makeModel(scene: import("excalibur").Scene) {
  return new GridModel(
    { width: 5, height: 5, castleCol: 2, castleRow: 4, castleWidth: 1, castleHeight: 1 },
    scene,
  );
}

function makeFullModel(scene: import("excalibur").Scene) {
  return new GridModel(
    { width: 16, height: 16, castleCol: 8, castleRow: 12, castleWidth: 2, castleHeight: 2 },
    scene,
  );
}

function emptyEventsMatrix(width: number, height: number): WallErosionEvent[][] {
  return Array.from({ length: height }, () =>
    Array.from<WallErosionEvent>({ length: width }).fill(null),
  );
}

// --- Actor grid tests ---

test("adds a terrain actor per cell to the scene", async ({ ctx }) => {
  makeModel(ctx.scene);
  ctx.step(16);
  expect(ctx.scene.actors.filter(a => a instanceof FlatGround)).toHaveLength(25);
});

test("digging swaps the FlatGround actor for a Hole actor in the scene", async ({ ctx }) => {
  const model = makeModel(ctx.scene);
  const before = model.getCell(1, 1);
  model.setElevation(1, 1, -1);
  const after = model.getCell(1, 1);
  ctx.step(16);
  expect(after).toBeInstanceOf(Hole);
  expect(ctx.scene.actors).not.toContain(before);
  expect(ctx.scene.actors).toContain(after);
});

test("deepening a hole keeps the same actor instance (no swap)", async ({ ctx }) => {
  const model = makeModel(ctx.scene);
  model.setElevation(1, 1, -1);
  const hole = model.getCell(1, 1);
  model.setElevation(1, 1, -1);
  ctx.step(16);
  expect(model.getCell(1, 1)).toBe(hole);
  expect(ctx.scene.actors).toContain(hole);
});

test("placing a wall swaps FlatGround for Wall actor in the scene", async ({ ctx }) => {
  const model = makeModel(ctx.scene);
  const before = model.getCell(0, 0);
  model.placeWall(0, 0, 1);
  const after = model.getCell(0, 0);
  ctx.step(16);
  expect(after).toBeInstanceOf(Wall);
  expect(ctx.scene.actors).not.toContain(before);
  expect(ctx.scene.actors).toContain(after);
});

test("placing a tower swaps FlatGround for Tower actor in the scene", async ({ ctx }) => {
  const model = makeModel(ctx.scene);
  const before = model.getCell(0, 0);
  model.placeTower(0, 0);
  const after = model.getCell(0, 0);
  ctx.step(16);
  expect(after).toBeInstanceOf(Tower);
  expect(ctx.scene.actors).not.toContain(before);
  expect(ctx.scene.actors).toContain(after);
});

test("reset removes old actors and adds fresh FlatGround actors", async ({ ctx }) => {
  const model = makeModel(ctx.scene);
  model.setElevation(1, 1, -1);
  const holeBeforeReset = model.getCell(1, 1);
  ctx.step(16);
  expect(ctx.scene.actors).toContain(holeBeforeReset);
  model.reset();
  ctx.step(16);
  expect(ctx.scene.actors).not.toContain(holeBeforeReset);
  expect(ctx.scene.actors.filter(a => a instanceof FlatGround)).toHaveLength(25);
});

// --- Ported from grid-model.test.ts ---

describe("GridModel initialization", () => {
  test("all elevations start at zero", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    const elevs = grid.getElevations();
    for (const row of elevs) {
      for (const val of row) {
        expect(val).toBe(0);
      }
    }
  });

  test("all puddle depths start at zero", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.getPuddleDepth(0, 0)).toBe(0);
    expect(grid.getPuddleDepth(5, 5)).toBe(0);
  });

  test("all hit counts start at zero", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.getHitCount(0, 0)).toBe(0);
    expect(grid.getHitCount(7, 7)).toBe(0);
  });
});

describe("isCastle", () => {
  test("returns true for all cells in 2x2 castle", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.isCastle(8, 12)).toBe(true);
    expect(grid.isCastle(9, 12)).toBe(true);
    expect(grid.isCastle(8, 13)).toBe(true);
    expect(grid.isCastle(9, 13)).toBe(true);
  });

  test("returns false for cells adjacent to castle", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.isCastle(7, 12)).toBe(false);
    expect(grid.isCastle(10, 12)).toBe(false);
    expect(grid.isCastle(8, 11)).toBe(false);
    expect(grid.isCastle(8, 14)).toBe(false);
  });

  test("returns false for non-castle position", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.isCastle(0, 0)).toBe(false);
  });
});

describe("getElevation", () => {
  test("returns 0 for in-bounds default tile", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.getElevation(0, 0)).toBe(0);
  });

  test("returns 0 for out-of-bounds coordinates", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.getElevation(-1, 0)).toBe(0);
    expect(grid.getElevation(0, -1)).toBe(0);
    expect(grid.getElevation(16, 0)).toBe(0);
    expect(grid.getElevation(0, 16)).toBe(0);
  });
});

describe("setElevation", () => {
  test("applies positive delta on a hole raises it", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(3, 3, -4);
    grid.setElevation(3, 3, +2);
    expect(grid.getElevation(3, 3)).toBe(-2);
  });

  test("applies negative delta", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(3, 3, -4);
    expect(grid.getElevation(3, 3)).toBe(-4);
  });

  test("clamps to max elevation (no effect on flat ground with positive delta)", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(1, 1, 25);
    expect(grid.getElevation(1, 1)).toBe(0);
  });

  test("clamps to min elevation", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(1, 1, -25);
    expect(grid.getElevation(1, 1)).toBe(MIN_ELEVATION);
  });

  test("respects custom elevation bounds for negative delta", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevationBounds(-20, 20);
    grid.setElevation(2, 2, -18);
    expect(grid.getElevation(2, 2)).toBe(-18);
  });

  test("clears puddle when elevation becomes non-negative", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(0, 0, -3);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 2 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(2);
    grid.setElevation(0, 0, +3);
    expect(grid.getElevation(0, 0)).toBe(0);
    expect(grid.getPuddleDepth(0, 0)).toBe(0);
  });

  test("clamps puddle to new hole depth when elevation rises but stays negative", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(0, 0, -5);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 4 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(4);
    grid.setElevation(0, 0, +3);
    expect(grid.getElevation(0, 0)).toBe(-2);
    expect(grid.getPuddleDepth(0, 0)).toBe(2);
  });

  test("no-ops for out-of-bounds", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(-1, -1, 5);
    expect(grid.getElevation(-1, -1)).toBe(0);
  });
});

describe("getElevations", () => {
  test("returns a copy that does not mutate internal state", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    const elevs = grid.getElevations();
    elevs[0][0] = 999;
    expect(grid.getElevation(0, 0)).toBe(0);
  });
});

describe("applyPuddleDeltas", () => {
  test("accumulates puddle depth, clamped to -elevation", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(0, 0, -3);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 2 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(2);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 5 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(3);
  });

  test("ignores tiles with non-negative elevation", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.applyPuddleDeltas([{ col: 1, row: 1, depth: 2 }]);
    expect(grid.getPuddleDepth(1, 1)).toBe(0);
  });

  test("ignores out-of-bounds deltas", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.applyPuddleDeltas([{ col: -1, row: -1, depth: 2 }]);
    // no crash
  });
});

describe("effectiveHoleDepth", () => {
  test("returns hole depth minus puddle", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(2, 2, -4);
    grid.applyPuddleDeltas([{ col: 2, row: 2, depth: 1 }]);
    expect(grid.effectiveHoleDepth(2, 2)).toBe(3);
  });

  test("returns 0 for flat tile", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.effectiveHoleDepth(0, 0)).toBe(0);
  });

  test("returns 0 for wall tile", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeWall(1, 1, 1);
    expect(grid.effectiveHoleDepth(1, 1)).toBe(0);
  });

  test("returns 0 for out-of-bounds", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.effectiveHoleDepth(-1, -1)).toBe(0);
  });
});

describe("hit counts", () => {
  test("incrementHitCount and getHitCount on hole", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(3, 3, -2);
    grid.incrementHitCount(3, 3, 2);
    expect(grid.getHitCount(3, 3)).toBe(2);
    grid.incrementHitCount(3, 3, 1);
    expect(grid.getHitCount(3, 3)).toBe(3);
  });

  test("getHitCount returns 0 for wall (walls use HP, not hitCount)", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeWall(3, 3, 1);
    grid.incrementHitCount(3, 3, 5);
    expect(grid.getHitCount(3, 3)).toBe(0);
  });

  test("getHitCount returns 0 for flat ground", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.getHitCount(3, 3)).toBe(0);
  });

  test("resetHitCounts clears hit counts on holes", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(0, 0, -5);
    grid.setElevation(1, 1, -3);
    grid.incrementHitCount(0, 0, 5);
    grid.incrementHitCount(1, 1, 3);
    grid.resetHitCounts();
    expect(grid.getHitCount(0, 0)).toBe(0);
    expect(grid.getHitCount(1, 1)).toBe(0);
  });
});

describe("detectPools", () => {
  test("groups adjacent negative tiles into one pool", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(3, 3, -2);
    grid.setElevation(4, 3, -1);
    grid.setElevation(3, 4, -3);
    const pools = grid.getPools();
    expect(pools.length).toBe(1);
    expect(pools[0].members.length).toBe(3);
  });

  test("separates non-adjacent negative tiles into different pools", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(0, 0, -1);
    grid.setElevation(5, 5, -1);
    const pools = grid.getPools();
    expect(pools.length).toBe(2);
  });

  test("getPool returns pool for negative tile", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(2, 2, -1);
    const pool = grid.getPool(2, 2);
    expect(pool).toBeDefined();
    expect(pool!.members).toEqual([{ col: 2, row: 2 }]);
  });

  test("getPool returns undefined for non-negative tile", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.getPool(0, 0)).toBeUndefined();
  });

  test("getPoolMap returns the map", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(1, 1, -1);
    const map = grid.getPoolMap();
    expect(map.get("1:1")).toBeDefined();
  });
});

describe("getPoolNeighbors", () => {
  test("returns neighbor connectivity within a pool", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
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

  test("returns undefined for non-pool tile", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.getPoolNeighbors(0, 0)).toBeUndefined();
  });
});

describe("applyErosion", () => {
  test("destroys wall when HP reaches 0 via applyErosion", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeWall(0, 0, 1); // L1 wall: elevation 5, hp 15

    const w = 16;
    const h = 16;
    const advance = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));
    const recede = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));

    // Water depth 7 overtops by 2 (7 - 5 = 2 >= 2), each applyErosion call hits twice
    advance[0][0] = 7;
    recede[0][0] = 7;

    for (let i = 0; i < 7; i++) {
      grid.applyErosion(advance, recede);
    }
    expect((grid.getCell(0, 0) as unknown as Wall).hp).toBe(1);

    const result = grid.applyErosion(advance, recede);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ col: 0, row: 0, newElevation: 0 });
    expect(grid.getElevation(0, 0)).toBe(0);
  });

  test("erodes hole toward zero after 3+ hits", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
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

  test("skips castle tile", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
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

describe("applySandRedistribution", () => {
  test("walls are immutable to sand redistribution", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeWall(5, 3, 1);
    const events = emptyEventsMatrix(16, 16);
    events[3][5] = "overtopped";
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 3)).toBe(5);
  });

  test("skips castle tile", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    const events = emptyEventsMatrix(16, 16);
    events[12][8] = "overtopped";
    grid.applySandRedistribution(events);
    expect(grid.getElevation(8, 12)).toBe(0);
  });
});

describe("reset", () => {
  test("clears all state back to initial", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
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

describe("placeTower", () => {
  test("places tower on flat ground", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeTower(3, 3);
    expect(grid.getElevation(3, 3)).toBe(15);
    expect(grid.getCell(3, 3)).toBeInstanceOf(Tower);
  });

  test("returns false on non-flat ground", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeWall(3, 3, 1);
    expect(grid.placeTower(3, 3)).toBe(false);
    expect(grid.getCell(3, 3)).not.toBeInstanceOf(Tower);
  });

  test("returns false on castle cell", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.placeTower(8, 12)).toBe(false);
  });

  test("returns false out of bounds", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.placeTower(-1, 0)).toBe(false);
  });

  test("tower immutable to setElevation", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeTower(3, 3);
    grid.setElevation(3, 3, -5);
    expect(grid.getElevation(3, 3)).toBe(15);
    expect(grid.getCell(3, 3)).toBeInstanceOf(Tower);
  });
});

describe("tower erosion", () => {
  test("tower erodes after TOWER_HITS_PER_EROSION hits via applyErosion", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
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

  test("tower hit count increments correctly", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeTower(0, 0);
    grid.incrementHitCount(0, 0, 5);
    expect(grid.getHitCount(0, 0)).toBe(5);
  });
});

describe("tower serialization", () => {
  test("tower appears in serialized cells", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeTower(3, 3);
    const result = JSON.parse(grid.serialize());
    expect(result.cells[3][3]).toEqual({ type: "tower", height: 15 });
  });
});

describe("neighborsOf", () => {
  test("returns adjacent terrain instances", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeWall(5, 5, 1);
    grid.setElevation(5, 4, -1);
    const n = grid.neighborsOf(5, 5);
    expect(n.north).toBe(grid.getCell(5, 4));
    expect(n.south).toBe(grid.getCell(5, 6));
    expect(n.east).toBe(grid.getCell(6, 5));
    expect(n.west).toBe(grid.getCell(4, 5));
  });

  test("returns null past the grid edge", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    const n = grid.neighborsOf(0, 0);
    expect(n.north).toBeNull();
    expect(n.west).toBeNull();
    expect(n.south).not.toBeNull();
    expect(n.east).not.toBeNull();
  });

  test("terrain.neighbors reflects live state after a cell is replaced", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeWall(5, 5, 1);
    const wall = grid.getCell(5, 5);
    expect(wall.neighbors.east).toBe(grid.getCell(6, 5));
    grid.placeWall(6, 5, 1);
    expect(wall.connectsTo(wall.neighbors.east)).toBe(true);
  });
});

describe("hole neighbor awareness", () => {
  test("a hole sees adjacent holes via this.neighbors", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(3, 3, -1);
    grid.setElevation(4, 3, -1);
    grid.setElevation(3, 4, -1);
    const hole = grid.getCell(3, 3) as Hole;
    expect(hole.neighbors.south).toBeInstanceOf(Hole);
    expect(hole.neighbors.east).toBeInstanceOf(Hole);
    expect(hole.neighbors.north).not.toBeInstanceOf(Hole);
    expect(hole.neighbors.west).not.toBeInstanceOf(Hole);
  });

  test("hole getRenderInfo exposes a stable cacheKey reflecting neighbors", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.setElevation(3, 3, -1);
    const before = (grid.getCell(3, 3) as Hole).getRenderInfo().cacheKey;
    grid.setElevation(4, 3, -1);
    const after = (grid.getCell(3, 3) as Hole).getRenderInfo().cacheKey;
    expect(before).not.toEqual(after);
  });
});

describe("placeWall", () => {
  test("places a level-1 wall on flat ground", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.placeWall(3, 3, 1)).toBe(true);
    const cell = grid.getCell(3, 3);
    expect(cell).toBeInstanceOf(Wall);
    expect(cell.elevation).toBe(5);
  });

  test("rejects level 2 on flat ground", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.placeWall(3, 3, 2)).toBe(false);
    expect(grid.getCell(3, 3).elevation).toBe(0);
  });

  test("upgrades level 1 to level 2", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeWall(3, 3, 1);
    expect(grid.placeWall(3, 3, 2)).toBe(true);
    expect((grid.getCell(3, 3) as unknown as Wall).level).toBe(2);
  });

  test("rejects skipping a level (3 on level 1)", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    grid.placeWall(3, 3, 1);
    expect(grid.placeWall(3, 3, 3)).toBe(false);
  });

  test("rejects placement on the castle", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.placeWall(8, 12, 1)).toBe(false);
  });

  test("returns false for out-of-bounds coordinates", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
    expect(grid.placeWall(-1, 0, 1)).toBe(false);
    expect(grid.placeWall(0, 999, 1)).toBe(false);
  });

  test("wall hp persists across resetHitCounts", async ({ ctx }) => {
    const grid = makeFullModel(ctx.scene);
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

describe("serialize", () => {
  test("produces JSON with cells and castle object", async ({ ctx }) => {
    const grid = new GridModel(
      { width: 4, height: 3, castleCol: 2, castleRow: 1, castleWidth: 2, castleHeight: 2 },
      ctx.scene,
    );
    grid.placeWall(0, 0, 1);
    grid.setElevation(1, 0, -2);
    const result = JSON.parse(grid.serialize({ columnHeights: [1.5, 2.0, 3.0, 1.0] }));
    expect(result.castle).toEqual({ col: 2, row: 1, width: 2, height: 2 });
    expect(result.columnHeights).toEqual([1.5, 2.0, 3.0, 1.0]);
    expect(result.cells[0][0]).toMatchObject({ type: "wall", height: 5, level: 1, hp: 15 });
    expect(result.cells[0][1]).toEqual({ type: "hole", height: -2, puddleDepth: 0 });
    expect(result.cells[0][2]).toEqual({ type: "flat", height: 0 });
    expect(result.elevations).toBeUndefined();
    expect(result.puddleDepths).toBeUndefined();
  });

  test("defaults columnHeights to empty array", async ({ ctx }) => {
    const grid = new GridModel(
      { width: 2, height: 2, castleCol: 0, castleRow: 0, castleWidth: 2, castleHeight: 2 },
      ctx.scene,
    );
    const result = JSON.parse(grid.serialize());
    expect(result.columnHeights).toEqual([]);
  });

  test("includes puddleDepth in hole cells", async ({ ctx }) => {
    const grid = new GridModel(
      { width: 3, height: 2, castleCol: 1, castleRow: 1, castleWidth: 2, castleHeight: 2 },
      ctx.scene,
    );
    grid.setElevation(0, 0, -3);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 1.5 }]);
    const result = JSON.parse(grid.serialize());
    expect(result.cells[0][0]).toEqual({ type: "hole", height: -3, puddleDepth: 1.5 });
  });
});
