import { expect, test } from "../test/excalibur-browser-test.ts";
import { TERRAIN_SLOPE } from "../config.ts";
import { GridModel } from "../model/grid-model.ts";
import { WaterComponent } from "./water-component.ts";
import { WaveEventApplier } from "./wave-event-applier.ts";
import { WaveFieldRuntime } from "./wave-field-runtime.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave-segment-types.ts";

const HEIGHT = 16;
const WIDTH = 3;

const buildGrid = (scene: import("excalibur").Scene): GridModel =>
  new GridModel(
    { width: WIDTH, height: HEIGHT, castleCol: 1, castleRow: 11, castleWidth: 1, castleHeight: 1 },
    scene,
  );

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

test("a wave erodes a low wall in its path and reports the eroded tile", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);
  grid.placeWall(1, 3, 1); // L1 wall (elevation 5, HP 15) just south of the source

  const runtime = new WaveFieldRuntime(ctx.scene, adapterFor(grid), TERRAIN_SLOPE, {
    surgeWindowMs: 3000,
    applier: new WaveEventApplier(grid),
  });
  const done = runtime.playWave(spawnsFor(9)); // strong, sustained head overtops + erodes the wall

  for (let i = 0; i < 2000; i++) {
    ctx.step(16);
  }
  const result = await done;

  expect(grid.getElevation(1, 3)).toBe(0); // wall fully eroded -> FlatGround
  expect(result.erodedTiles.length).toBe(1); // exactly the one wall, deduped across frames
  expect(result.sandRedistributed).toBe(false);
  expect(ctx.scene.world.query([WaterComponent]).entities.length).toBe(0);
});

test("flat-ground waves still erode nothing", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);

  const runtime = new WaveFieldRuntime(ctx.scene, adapterFor(grid), TERRAIN_SLOPE, {
    surgeWindowMs: 300,
    applier: new WaveEventApplier(grid),
  });
  const done = runtime.playWave(spawnsFor(4)); // reaches ~row 8, no terrain

  for (let i = 0; i < 1000; i++) {
    ctx.step(16);
  }
  const result = await done;

  expect(result.erodedTiles).toEqual([]);
  expect(result.castleFlooded).toBe(false);
});
