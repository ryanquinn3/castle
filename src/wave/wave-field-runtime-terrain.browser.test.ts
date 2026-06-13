import { expect, test } from "../test/excalibur-browser-test.ts";
import { TERRAIN_SLOPE } from "../config.ts";
import { GridModel } from "../model/grid-model.ts";
import { WaterComponent } from "./water-component.ts";
import { WaveEventApplier } from "./wave-event-applier.ts";
import { WaveFieldRuntime } from "./wave-field-runtime.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave-segment-types.ts";

const HEIGHT = 16;
const WIDTH = 3;

function buildGrid(scene: import("excalibur").Scene): GridModel {
  // Castle in-bounds for this narrow test board.
  return new GridModel(
    { width: WIDTH, height: HEIGHT, castleCol: 1, castleRow: 11, castleWidth: 1, castleHeight: 1 },
    scene,
  );
}

const adapterFor = (grid: GridModel): WaveSegmentGrid => ({
  gridLeft: 0,
  gridTop: 32,
  tileSize: 16,
  height: HEIGHT,
  getElevation: (c, r) => grid.getElevation(c, r),
  effectiveHoleDepth: (c, r) => grid.effectiveHoleDepth(c, r),
  isCastle: (c, r) => grid.isCastle(c, r),
});

const spawnsFor = (depth: number): WaveSegmentSpawn[] =>
  Array.from({ length: WIDTH }, (_, col) => ({ col, x: 0, y: 0, initialDepth: depth, speed: 0, maxTravelDistance: 0 }));

test("water pooling in a hole accumulates puddleDepth and the wave drains to empty", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);
  grid.setElevation(1, 5, -2); // dig a depth-2 hole well short of the castle

  const runtime = new WaveFieldRuntime(ctx.scene, adapterFor(grid), TERRAIN_SLOPE, {
    surgeWindowMs: 300,
    applier: new WaveEventApplier(grid),
  });
  const done = runtime.playWave(spawnsFor(4)); // D=4 reaches ~row 8, never the castle at row 11

  for (let i = 0; i < 1000; i++) {
    ctx.step(16);
  }
  const result = await done;

  expect(grid.getPuddleDepth(1, 5)).toBeGreaterThan(0);
  expect(result.castleFlooded).toBe(false);
  expect(result.erodedTiles).toEqual([]);
  expect(result.sandRedistributed).toBe(false);
  expect(ctx.scene.world.query([WaterComponent]).entities.length).toBe(0);
});

test("a strong source floods the castle and resolves castleFlooded", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);

  const runtime = new WaveFieldRuntime(ctx.scene, adapterFor(grid), TERRAIN_SLOPE, {
    // Surge stays open long enough for the pressure front to reach row 11.
    // Using 50ms steps so each call runs ~2 sim ticks; 800 calls = ~1600 sim
    // steps. Source (5 000 ms = ~300 sim steps) closes well before that.
    surgeWindowMs: 5000,
    applier: new WaveEventApplier(grid),
  });
  const done = runtime.playWave(spawnsFor(9)); // D=9 reaches the castle at row 11 (ground 5.5)

  for (let i = 0; i < 800; i++) {
    ctx.step(50);
  }
  const result = await done;

  expect(result.castleFlooded).toBe(true);
});
