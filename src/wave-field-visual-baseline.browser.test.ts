import { page } from "vitest/browser";
import { test, expect } from "./test/game-browser-test.ts";
import { WaveFieldRuntime } from "./wave/wave-field-runtime.ts";
import { WaterComponent } from "./wave/water-component.ts";
import { computeLayout, GRID_HEIGHT, GRID_WIDTH, TERRAIN_SLOPE } from "./config.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave/wave-segment-types.ts";

const STEP_FRAMES = 120;
const STEP_MS = 16;
const FLAT_DEPTH = 4;

test("renders field water inland on flat ground without throwing", async ({ game }) => {

  await game.goToScene('tide');

  const layout = computeLayout(window);
  const { tileSize, gridLeft, gridTop } = layout;

  // Flat synthetic grid — all cells at elevation 0, no castle, no holes.
  const flatGrid: WaveSegmentGrid = {
    gridLeft,
    gridTop,
    tileSize,
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

  // Fire the wave — don't await; we drive it via the test clock below.
  void runtime.playWave(spawns);

  // Hand the clock to test control and step frames to reach ~peak reach.
  const clock = game.debug.useTestClock();
  for (let i = 0; i < STEP_FRAMES; i++) {
    clock.step(STEP_MS);
  }

  // By peak reach, at least some WaterComponent entities should be live.
  const waterCount = scene.world.query([WaterComponent]).entities.length;
  expect(waterCount).toBeGreaterThan(0);

  await page.screenshot();

  runtime.cleanup();
}, 25_000);
