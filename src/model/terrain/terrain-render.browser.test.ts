import { Canvas, Rectangle } from "excalibur";
import { expect, test } from "../../test/excalibur-browser-test.ts";
import { Wall } from "./wall.ts";
import { FlatGround } from "./flat-ground.ts";

test("wall syncs a Canvas graphic", async ({ ctx }) => {
  const wall = new Wall(2);
  wall.attach({ neighborsOf: () => ({ north: null, south: null, east: null, west: null }) }, 1, 1);
  ctx.scene.add(wall);
  wall.syncGraphic();
  expect(wall.graphics.current).toBeInstanceOf(Canvas);
});

test("flat ground (elevation 0) syncs the transparent rect", async ({ ctx }) => {
  const flat = new FlatGround();
  flat.attach({ neighborsOf: () => ({ north: null, south: null, east: null, west: null }) }, 1, 1);
  ctx.scene.add(flat);
  flat.syncGraphic();
  expect(flat.graphics.current).toBeInstanceOf(Rectangle);
});
