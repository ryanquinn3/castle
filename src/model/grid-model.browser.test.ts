import { describe } from "vitest";
import { expect, test } from "../test/excalibur-browser-shared-test.ts";
import { GridModel } from "./grid-model.ts";
import { FlatGround } from "./terrain/flat-ground.ts";
import { Hole } from "./terrain/hole.ts";
import { Tower } from "./terrain/tower.ts";
import { Wall } from "./terrain/wall.ts";

function makeModel(scene: import("excalibur").Scene) {
  return new GridModel(
    {
      width: 5,
      height: 5,
      castleCol: 2,
      castleRow: 4,
      castleWidth: 1,
      castleHeight: 1,
    },
    scene,
  );
}

function makeFullModel(scene: import("excalibur").Scene) {
  return new GridModel(
    {
      width: 16,
      height: 16,
      castleCol: 8,
      castleRow: 12,
      castleWidth: 2,
      castleHeight: 2,
    },
    scene,
  );
}

// --- Actor grid tests ---

test("adds a terrain actor per cell to the scene", async ({ scene, clock }) => {
  makeModel(scene);
  clock.step(16);
  expect(scene.actors.filter((a) => a instanceof FlatGround)).toHaveLength(
    25,
  );
});

test("digging swaps the FlatGround actor for a Hole actor in the scene", async ({
  scene,
  clock,
}) => {
  const model = makeModel(scene);
  const before = model.getCell(1, 1);
  model.setElevation(1, 1, -1);
  const after = model.getCell(1, 1);
  clock.step(16);
  expect(after).toBeInstanceOf(Hole);
  expect(scene.actors).not.toContain(before);
  expect(scene.actors).toContain(after);
});

test("deepening a hole keeps the same actor instance (no swap)", async ({
  scene,
  clock,
}) => {
  const model = makeModel(scene);
  model.setElevation(1, 1, -1);
  const hole = model.getCell(1, 1);
  model.setElevation(1, 1, -1);
  clock.step(16);
  expect(model.getCell(1, 1)).toBe(hole);
  expect(scene.actors).toContain(hole);
});

test("placing a wall swaps FlatGround for Wall actor in the scene", async ({
  scene,
  clock,
}) => {
  const model = makeModel(scene);
  const before = model.getCell(0, 0);
  model.placeWall(0, 0, 1);
  const after = model.getCell(0, 0);
  clock.step(16);
  expect(after).toBeInstanceOf(Wall);
  expect(scene.actors).not.toContain(before);
  expect(scene.actors).toContain(after);
});

test("placing a tower swaps FlatGround for Tower actor in the scene", async ({
  scene,
  clock,
}) => {
  const model = makeModel(scene);
  const before = model.getCell(0, 0);
  model.placeTower(0, 0);
  const after = model.getCell(0, 0);
  clock.step(16);
  expect(after).toBeInstanceOf(Tower);
  expect(scene.actors).not.toContain(before);
  expect(scene.actors).toContain(after);
});

test("reset removes old actors and adds fresh FlatGround actors", async ({
  scene,
  clock,
}) => {
  const model = makeModel(scene);
  model.setElevation(1, 1, -1);
  const holeBeforeReset = model.getCell(1, 1);
  clock.step(16);
  expect(scene.actors).toContain(holeBeforeReset);
  model.reset();
  clock.step(16);
  expect(scene.actors).not.toContain(holeBeforeReset);
  expect(scene.actors.filter((a) => a instanceof FlatGround)).toHaveLength(
    25,
  );
});

// --- Ported from grid-model.test.ts ---

describe("GridModel initialization", () => {
  test("all elevations start at zero", async ({ scene }) => {
    const grid = makeFullModel(scene);
    const elevs = grid.getElevations();
    for (const row of elevs) {
      for (const val of row) {
        expect(val).toBe(0);
      }
    }
  });

  test("all puddle depths start at zero", async ({ scene }) => {
    const grid = makeFullModel(scene);
    expect(grid.getPuddleDepth(0, 0)).toBe(0);
    expect(grid.getPuddleDepth(5, 5)).toBe(0);
  });

  test("all hit counts start at zero", async ({ scene }) => {
    const grid = makeFullModel(scene);
    expect(grid.getHitCount(0, 0)).toBe(0);
    expect(grid.getHitCount(7, 7)).toBe(0);
  });
});

describe("applyPuddleDeltas", () => {
  test("accumulates puddle depth, clamped to -elevation", async ({ scene }) => {
    const grid = makeFullModel(scene);
    grid.setElevation(0, 0, -3);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 2 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(2);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 5 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(3);
  });

  test("ignores tiles with non-negative elevation", async ({ scene }) => {
    const grid = makeFullModel(scene);
    grid.applyPuddleDeltas([{ col: 1, row: 1, depth: 2 }]);
    expect(grid.getPuddleDepth(1, 1)).toBe(0);
  });

  test("ignores out-of-bounds deltas", async ({ scene }) => {
    const grid = makeFullModel(scene);
    grid.applyPuddleDeltas([{ col: -1, row: -1, depth: 2 }]);
    // no crash
  });
});

describe("effectiveHoleDepth", () => {
  test("returns hole depth minus puddle", async ({ scene }) => {
    const grid = makeFullModel(scene);
    grid.setElevation(2, 2, -4);
    grid.applyPuddleDeltas([{ col: 2, row: 2, depth: 1 }]);
    expect(grid.effectiveHoleDepth(2, 2)).toBe(3);
  });

  test("returns 0 for flat tile", async ({ scene }) => {
    const grid = makeFullModel(scene);
    expect(grid.effectiveHoleDepth(0, 0)).toBe(0);
  });

  test("returns 0 for wall tile", async ({ scene }) => {
    const grid = makeFullModel(scene);
    grid.placeWall(1, 1, 1);
    expect(grid.effectiveHoleDepth(1, 1)).toBe(0);
  });

  test("returns 0 for out-of-bounds", async ({ scene }) => {
    const grid = makeFullModel(scene);
    expect(grid.effectiveHoleDepth(-1, -1)).toBe(0);
  });
});

describe("detectPools", () => {
  test("groups adjacent negative tiles into one pool", async ({ scene }) => {
    const grid = makeFullModel(scene);
    grid.setElevation(3, 3, -2);
    grid.setElevation(4, 3, -1);
    grid.setElevation(3, 4, -3);
    const pools = grid.getPools();
    expect(pools.length).toBe(1);
    expect(pools[0].members.length).toBe(3);
  });

  test("separates non-adjacent negative tiles into different pools", async ({
    scene,
  }) => {
    const grid = makeFullModel(scene);
    grid.setElevation(0, 0, -1);
    grid.setElevation(5, 5, -1);
    const pools = grid.getPools();
    expect(pools.length).toBe(2);
  });

  test("getPool returns pool for negative tile", async ({ scene }) => {
    const grid = makeFullModel(scene);
    grid.setElevation(2, 2, -1);
    const pool = grid.getPool(2, 2);
    expect(pool).toBeDefined();
    expect(pool!.members).toEqual([{ col: 2, row: 2 }]);
  });

  test("getPool returns undefined for non-negative tile", async ({ scene }) => {
    const grid = makeFullModel(scene);
    expect(grid.getPool(0, 0)).toBeUndefined();
  });

  test("getPoolMap returns the map", async ({ scene }) => {
    const grid = makeFullModel(scene);
    grid.setElevation(1, 1, -1);
    const map = grid.getPoolMap();
    expect(map.get("1:1")).toBeDefined();
  });
});

describe("commitHoleWave", () => {
  test("silts a hole one step and reports the eroded cell", async ({ scene }) => {
    const grid = makeModel(scene);
    grid.setElevation(2, 2, -5); // depth-5 hole
    const result = grid.commitHoleWave(2, 2, 1);
    expect(result).toMatchObject({ col: 2, row: 2, newElevation: -4 });
    expect(grid.getElevation(2, 2)).toBe(-4);
  });

  test("converts a depth-1 hole to flat ground when it silts to 0", async ({ scene }) => {
    const grid = makeModel(scene);
    grid.setElevation(2, 2, -1);
    grid.commitHoleWave(2, 2, 1);
    expect(grid.getElevation(2, 2)).toBe(0);
  });

  test("ignores non-hole and castle cells", async ({ scene }) => {
    const grid = makeModel(scene);
    expect(grid.commitHoleWave(2, 2, 1)).toBeNull(); // flat ground
  });
});
