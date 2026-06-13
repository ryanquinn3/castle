import { expect, test } from "../test/excalibur-browser-test.ts";
import { WALL_LEVEL_HP } from "../config.ts";
import { GridModel } from "./grid-model.ts";

const buildGrid = (scene: import("excalibur").Scene): GridModel =>
  new GridModel(
    { width: 3, height: 6, castleCol: 0, castleRow: 0, castleWidth: 1, castleHeight: 1 },
    scene,
  );

test("applyErosionHits drops a wall to flat ground once HP is exhausted", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);
  grid.placeWall(1, 3, 1); // L1 wall: elevation 5, HP 15
  expect(grid.getElevation(1, 3)).toBe(5);

  expect(grid.applyErosionHits(1, 3, WALL_LEVEL_HP[0] - 1)).toBeNull(); // survives at 1 HP
  expect(grid.getElevation(1, 3)).toBe(5);

  const result = grid.applyErosionHits(1, 3, 1); // the killing hit
  expect(result).toMatchObject({ col: 1, row: 3, newElevation: 0 });
  expect(grid.getElevation(1, 3)).toBe(0);
});

test("applyErosionHits is a no-op for non-positive counts and out-of-bounds", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);
  grid.placeWall(1, 3, 1);
  expect(grid.applyErosionHits(1, 3, 0)).toBeNull();
  expect(grid.applyErosionHits(99, 99, 5)).toBeNull();
  expect(grid.getElevation(1, 3)).toBe(5);
});
