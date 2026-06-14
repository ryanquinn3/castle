import { expect, test } from "../test/excalibur-browser-test.ts";
import { TERRAIN_SLOPE } from "../config.ts";
import { GridModel } from "../model/grid-model.ts";
import { WaterComponent } from "./water-component.ts";
import { WaveFieldRuntime } from "./wave-field-runtime.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave-segment-types.ts";

const HEIGHT = 16;
const WIDTH = 3;

const buildGrid = (scene: import("excalibur").Scene): GridModel =>
  new GridModel(
    { width: WIDTH, height: HEIGHT, castleCol: 1, castleRow: 13, castleWidth: 1, castleHeight: 1 },
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

const spawns = (depth: number): WaveSegmentSpawn[] =>
  Array.from({ length: WIDTH }, (_, col) => ({ col, x: 0, y: 0, initialDepth: depth, speed: 0, maxTravelDistance: 0 }));

// Run a wave to full drain and return how many frames it took (proxy for total
// surge + recede duration). A short surge window gets us into the recede phase
// quickly so the recede coeff dominates the count.
const framesToDrain = async (
  ctx: { scene: import("excalibur").Scene; step: (ms: number) => void },
  recedeCoeff: number,
): Promise<number> => {
  const grid = buildGrid(ctx.scene);
  const runtime = new WaveFieldRuntime(ctx.scene, adapterFor(grid), TERRAIN_SLOPE, {
    surgeWindowMs: 300,
    recedeCoeff,
  });
  const done = runtime.playWave(spawns(5));
  let frames = 0;
  let sawWater = false;
  while (frames < 5000) {
    ctx.step(16);
    frames++;
    const n = ctx.scene.world.query([WaterComponent]).entities.length;
    if (n > 0) {
      sawWater = true;
    }
    if (sawWater && n === 0) {
      break;
    }
  }
  await done;
  return frames;
};

test("a lower recede coefficient drains the wave more slowly", async ({ ctx }) => {
  // Same surge window for both; the only difference is the recede coeff.
  const fastDrain = await framesToDrain(ctx, 0.2); // recede as fast as the surge
  const slowDrain = await framesToDrain(ctx, 0.04); // gentle recede

  expect(slowDrain).toBeGreaterThan(fastDrain * 1.3);
});
