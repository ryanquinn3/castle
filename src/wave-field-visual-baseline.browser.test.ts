import { page } from "vitest/browser";
import { test, expect } from "./test/game-browser-test.ts";
import { WaveFieldRuntime } from "./wave/wave-field-runtime.ts";
import { WaterComponent } from "./wave/water-component.ts";
import { TILE_SIZE, GRID_LEFT, GRID_TOP, GRID_HEIGHT, GRID_WIDTH, TERRAIN_SLOPE } from "./config.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave/wave-segment-types.ts";

const STEP_FRAMES = 140;
const STEP_MS = 16;
// Big wave so the screenshot shows a deep, full-coverage water body to eyeball
// the shader against (ripples, flow, foam edge, depth tint).
const FLAT_DEPTH = 12;

test("renders field water inland on flat ground without throwing", async ({ game, clock }) => {

  // Render at a game-sized window. The engine is FitScreen + pixelArt, so the
  // WebGL backing store is sized to the viewport: at the real game's large
  // window the fragment shader runs at far higher resolution than the fixed
  // 256x304 coverage texture and supersamples it. A tiny headless viewport
  // renders ~1 sample per texel and hides resolution-dependent artifacts
  // (e.g. the top-band moire), so the screenshot must match the play scale.
  // Tall viewport so FitScreen scales the 256x304 canvas wide (~5-7x, matching
  // the real game window). The shader output is fixed at 256x304 and nearest-
  // upscaled, so this magnifies it like real play and exposes the artifacts.
  await page.viewport(1400, 1750);

  await game.goToScene('tide');

  // Grid with a hole so the wave develops realistic velocity STRUCTURE (water
  // converges/diverges around the pit). A perfectly flat grid + uniform spawns
  // produces near-uniform velocity, which hid the velocity-driven shader
  // artifacts (stripes/rings) that show up in real play.
  const holeCols = new Set([7, 8, 9]);
  const holeRows = new Set([8, 9, 10]);
  const isHole = (col: number, row: number) => holeCols.has(col) && holeRows.has(row);
  const structuredGrid: WaveSegmentGrid = {
    gridLeft: GRID_LEFT,
    gridTop: GRID_TOP,
    tileSize: TILE_SIZE,
    height: GRID_HEIGHT,
    getElevation: (col: number, row: number) => (isHole(col, row) ? -4 : 0),
    effectiveHoleDepth: (col: number, row: number) => (isHole(col, row) ? 4 : 0),
    isCastle: (_col: number, _row: number) => false,
  };

  // Non-uniform source profile so the surge has lateral velocity variation.
  const spawns: WaveSegmentSpawn[] = Array.from({ length: GRID_WIDTH }, (_, col) => ({
    col,
    x: 0,
    y: 0,
    initialDepth: FLAT_DEPTH * (0.6 + 0.4 * Math.abs(Math.sin(col * 0.7))),
  }));

  const scene = game.currentScene;
  const runtime = new WaveFieldRuntime(scene, structuredGrid, TERRAIN_SLOPE);

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
