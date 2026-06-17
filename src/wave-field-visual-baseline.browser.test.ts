import { page } from "vitest/browser";
import { test, expect } from "./test/game-browser-test.ts";
import { WaveFieldRuntime } from "./wave/wave-field-runtime.ts";
import { WaterComponent } from "./wave/water-component.ts";
import { TILE_SIZE, GRID_LEFT, GRID_TOP, GRID_HEIGHT, GRID_WIDTH, TERRAIN_SLOPE } from "./config.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave/wave-segment-types.ts";

const STEP_FRAMES = 120;
const STEP_MS = 16;
const FLAT_DEPTH = 4;

test("renders field water inland on flat ground without throwing", async ({ game, clock }) => {

  await game.goToScene('tide');

  // Flat synthetic grid — all cells at elevation 0, no castle, no holes.
  const flatGrid: WaveSegmentGrid = {
    gridLeft: GRID_LEFT,
    gridTop: GRID_TOP,
    tileSize: TILE_SIZE,
    height: GRID_HEIGHT,
    getElevation: (_col: number, _row: number) => 0,
    effectiveHoleDepth: (_col: number, _row: number) => 0,
    isCastle: (_col: number, _row: number) => false,
  };

  const spawns: WaveSegmentSpawn[] = Array.from({ length: GRID_WIDTH }, (_, col) => ({
    col,
    x: 0,
    y: 0,
    initialDepth: FLAT_DEPTH,
  }));

  const scene = game.currentScene;
  const runtime = new WaveFieldRuntime(scene, flatGrid, TERRAIN_SLOPE);

  // Fire the wave — don't await; we drive it via the test clock (installed at
  // boot by the fixture, so the wave runs deterministically from the start).
  void runtime.playWave(spawns);
  clock.run(STEP_FRAMES, STEP_MS); // step frames to reach ~peak reach

  // By peak reach, at least some WaterComponent entities should be live.
  const waterCount = scene.world.query([WaterComponent]).entities.length;
  expect(waterCount).toBeGreaterThan(0);

  await page.screenshot();

  runtime.cleanup();
}, 60_000);
