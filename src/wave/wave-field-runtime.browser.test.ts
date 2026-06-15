import { expect, test } from "../test/excalibur-browser-test.ts";
import { page } from "vitest/browser";
import { TERRAIN_SLOPE } from "../config.ts";
import { WaterComponent } from "./water-component.ts";
import { WaveFieldRuntime } from "./wave-field-runtime.ts";
import type { WaveSegmentGrid } from "./wave-segment-types.ts";

const flatGrid = (): WaveSegmentGrid => ({
  gridLeft: 0,
  gridTop: 32,
  tileSize: 16,
  height: 16,
  getElevation: () => 0,
  effectiveHoleDepth: () => 0,
  isCastle: () => false,
});

const spawnsFor = (numCols: number, depth: number) =>
  Array.from({ length: numCols }, (_, col) => ({
    col,
    x: col * 16,
    y: 0,
    initialDepth: depth,
    speed: 0,
    maxTravelDistance: 0,
  }));

test("emits WaterCellAdded on fieldEvents as cells become wet", async ({ ctx }) => {
  const runtime = new WaveFieldRuntime(ctx.scene, flatGrid(), TERRAIN_SLOPE, { surgeWindowMs: 200 });
  const wetted = new Set<string>();
  runtime.fieldEvents.on("WaterCellAdded", ({ col, row }) => wetted.add(`${col}:${row}`));

  const done = runtime.playWave(spawnsFor(16, 4));
  for (let i = 0; i < 800; i++) {
    ctx.step(16);
  }
  await done;

  // The wave advanced down the board, so cells across multiple rows reported in.
  expect(wetted.size).toBeGreaterThan(16);
  const rows = new Set([...wetted].map((k) => Number(k.split(":")[1])));
  expect(rows.size).toBeGreaterThan(1);
});

test("runs a full surge+drain wave and resolves when empty", async ({ ctx }) => {
  const runtime = new WaveFieldRuntime(ctx.scene, flatGrid(), TERRAIN_SLOPE, { surgeWindowMs: 200 });
  const done = runtime.playWave(spawnsFor(16, 4));

  let sawWater = false;
  for (let i = 0; i < 800 && !sawWater; i++) {
    ctx.step(16);
    sawWater = ctx.scene.world.query([WaterComponent]).entities.length > 0;
  }
  expect(sawWater).toBe(true);
  await page.screenshot();

  for (let i = 0; i < 1200; i++) {
    ctx.step(16);
  }

  const result = await done;
  expect(result).toMatchObject({ castleFlooded: false, sandRedistributed: false });
  expect(result.erodedTiles).toEqual([]);
  expect(ctx.scene.world.query([WaterComponent]).entities.length).toBe(0);
});
