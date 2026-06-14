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

// Deep outer columns, shallow middle — the lateral profile must survive into the field.
const unevenSpawns = (): WaveSegmentSpawn[] =>
  [6, 1, 6].map((initialDepth, col) => ({ col, x: 0, y: 0, initialDepth, speed: 0, maxTravelDistance: 0 }));

test("an uneven source profile keeps the shallow column shallower than the deep ones", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);
  const runtime = new WaveFieldRuntime(ctx.scene, adapterFor(grid), TERRAIN_SLOPE, { surgeWindowMs: 4000 });
  const done = runtime.playWave(unevenSpawns());

  let row0Col0 = 0;
  let row0Col1 = 0;
  let row0Col2 = 0;
  for (let i = 0; i < 1500; i++) {
    ctx.step(16);
    for (const e of ctx.scene.world.query([WaterComponent]).entities) {
      const w = e.get(WaterComponent)!;
      if (w.row !== 0) {
        continue;
      }
      if (w.col === 0) { row0Col0 = Math.max(row0Col0, w.depth); }
      if (w.col === 1) { row0Col1 = Math.max(row0Col1, w.depth); }
      if (w.col === 2) { row0Col2 = Math.max(row0Col2, w.depth); }
    }
  }
  await done;

  // Deep edges are pinned to their source depth; the shallow middle only fills
  // via lateral inflow and stays strictly below them (a Math.max collapse would
  // pin all three columns equally).
  expect(row0Col0).toBeGreaterThan(row0Col1 + 1);
  expect(row0Col2).toBeGreaterThan(row0Col1 + 1);
});
