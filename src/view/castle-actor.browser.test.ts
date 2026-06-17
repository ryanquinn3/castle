import { expect, test } from "../test/excalibur-browser-shared-test.ts";
import { CASTLE_WIDTH, CASTLE_HEIGHT, TILE_SIZE, GRID_LEFT, GRID_TOP } from "../config.ts";
import { CastleActor } from "./castle-actor.ts";

test("castle actor renders the castle sprite", async ({ scene }) => {
  const col = 2;
  const row = 4;
  const castle = new CastleActor(col, row);
  scene.add(castle);
  expect(castle.graphics.current).toBeDefined();

  const expectedX = GRID_LEFT + (col + 0.5) * TILE_SIZE;
  const expectedY = GRID_TOP + (row + 0.5) * TILE_SIZE;
  const expectedOffsetX = (CASTLE_WIDTH - 1) * TILE_SIZE * 0.5;
  const expectedOffsetY = (CASTLE_HEIGHT - 1) * TILE_SIZE * 0.5;

  expect(castle.pos.x).toBe(expectedX);
  expect(castle.pos.y).toBe(expectedY);
  expect(castle.graphics.offset.x).toBe(expectedOffsetX);
  expect(castle.graphics.offset.y).toBe(expectedOffsetY);
});
