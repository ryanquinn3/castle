import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { startGame } from "./engine.ts";
import { WaveFieldRuntime } from "./wave/wave-field-runtime.ts";
import { WaterComponent } from "./wave/water-component.ts";
import { computeLayout, GRID_HEIGHT, GRID_WIDTH, TERRAIN_SLOPE } from "./config.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave/wave-segment-types.ts";

// Visual baseline for the pressure-driven (flag-on) water field path.
//
// PRESSURE_WATER_ENABLED is a compile-time const that stays false in
// production; we exercise the field path directly by constructing a
// WaveFieldRuntime on the live Tide scene with synthetic flat spawns. The
// goal is "water appears and renders ~8 rows inland on flat ground without
// throwing" — not pixel equality.
//
// Boot pattern mirrors src/wave-visual-baseline.browser.test.ts: use
// startGame("game") so the full Tide scene (tilemap, grid, React HUD) is
// initialised before we drive the runtime.

const STEP_FRAMES = 120;
const STEP_MS = 16;
const FLAT_DEPTH = 4;

test("renders field water inland on flat ground without throwing", async () => {
  const game = await startGame("game");

  const tideButton = page.getByRole("button", { name: "Tide Mode" });
  await vi.waitFor(() => expect(tideButton).toBeVisible(), { timeout: 5000 });
  await tideButton.click();

  // Wait for the Tide scene to finish activating (actors appear).
  await vi.waitFor(
    () => {
      expect(game.currentScene.actors.length).toBeGreaterThan(0);
    },
    { timeout: 5000 },
  );

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

  // Uniform spawns: one per column, all at the same depth.
  const spawns: WaveSegmentSpawn[] = Array.from({ length: GRID_WIDTH }, (_, col) => ({
    col,
    x: gridLeft + col * tileSize + tileSize / 2,
    y: gridTop - 1,
    initialDepth: FLAT_DEPTH,
    speed: 120,
    maxTravelDistance: 150 + FLAT_DEPTH * 350,
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
