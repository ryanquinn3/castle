import { Actor, Color, Rectangle, Vector } from "excalibur";
import { page } from "vitest/browser";
import { expect, test as baseTest } from "vitest";
import { TERRAIN_SLOPE } from "../config.ts";
import { GridModel } from "../model/grid-model.ts";
import {
  createExcaliburBrowserTestContext,
  type ExcaliburBrowserTestContext,
} from "../test/excalibur-browser-test-utils.ts";
import { WaterComponent } from "./water-component.ts";
import { WaveActorRuntime } from "./wave-actor-runtime.ts";
import { WaveEventApplier } from "./wave-event-applier.ts";
import { WaveFieldRuntime } from "./wave-field-runtime.ts";
import { WaveSegment } from "./wave-segment.ts";
import type { WaveActorRuntimeResult, WaveSegmentSpawn } from "./wave-segment-types.ts";
import {
  scenarioAdapter,
  SCENARIO_GRID_LEFT,
  SCENARIO_GRID_TOP,
  SCENARIO_HEIGHT,
  SCENARIO_TILE_SIZE,
  SCENARIO_WIDTH,
  WAVE_VISUAL_SCENARIOS,
} from "./wave-visual-scenarios.ts";

/**
 * M5 visual-baseline capture harness.
 *
 * Renders every scenario (S1-S7) at four canonical frames and writes PNGs under
 * `test-results/screenshots/m5/<path>/<id>-<frame>.png` (the `path` option is
 * resolved relative to *this test file*, so we walk back up to the configured
 * screenshot directory). Both runtimes share `playWave(spawns)` on a bare
 * scene, so the same boards/frames render either path apples-to-apples.
 *
 * CAPTURE_PATH selects which runtime to capture. Flip it to "field" and re-run
 * to capture the field set; "legacy" captures the pre-cutover baseline that
 * later M5 tasks must visually meet or beat. The legacy path must be captured
 * before any later task changes behaviour.
 */
const CAPTURE_PATH: "legacy" | "field" = "legacy";

/** Output dir relative to this test file -> test-results/screenshots/m5/<path>. */
const OUT_DIR = `../../test-results/screenshots/m5/${CAPTURE_PATH}`;

/**
 * Frame budgets, in 16ms steps from the open of the source. The pressure field
 * runs ~2 sim ticks per 16ms call, so these are deliberately generous; they
 * just need to land in the advance / near-peak / draining / drained regimes.
 */
const FRAME_STEPS = {
  advance: 25,
  peak: 70,
  recede: 150,
  settled: 320,
} as const;

type FrameName = keyof typeof FRAME_STEPS;
const ORDERED_FRAMES: FrameName[] = ["advance", "peak", "recede", "settled"];

// Board pixel bounds in *terrain/world coordinates*. The scenario layout now
// reuses the same `computeLayout(window)` the terrain actors read, so the wave
// overlay and the terrain actors share this region. The ocean band sits one
// tile above gridTop, so the rendered region is
// y in [gridTop - tileSize, gridTop + height*tileSize].
const BOARD_LEFT_PX = SCENARIO_GRID_LEFT;
const BOARD_TOP_PX = SCENARIO_GRID_TOP - SCENARIO_TILE_SIZE;
const BOARD_WIDTH_PX = SCENARIO_WIDTH * SCENARIO_TILE_SIZE;
const BOARD_HEIGHT_PX = SCENARIO_HEIGHT * SCENARIO_TILE_SIZE + SCENARIO_TILE_SIZE;
const BOARD_CENTER = new Vector(
  BOARD_LEFT_PX + BOARD_WIDTH_PX / 2,
  BOARD_TOP_PX + BOARD_HEIGHT_PX / 2,
);

// The scenario layout reuses config's `computeLayout`, which yields ~36px tiles
// at the 1024x768 browser viewport - already large and legible (vs the prior
// 16px). The board is 5 wide x 17 tall (~180x612px), which fits comfortably
// inside the viewport at zoom 1, so we keep zoom 1 and size the canvas to the
// board (plus a small margin). Capturing the canvas element crops the iframe
// out, so the board fills the frame. (A larger zoom would push the tall board
// past the 768px viewport height and leave the lower rows unpainted.)
const CAPTURE_ZOOM = 1;
// Small margin so the board does not touch the canvas edge.
const MARGIN_PX = 12;
const CANVAS_WIDTH_PX = Math.round(BOARD_WIDTH_PX * CAPTURE_ZOOM + MARGIN_PX * 2);
const CANVAS_HEIGHT_PX = Math.round(BOARD_HEIGHT_PX * CAPTURE_ZOOM + MARGIN_PX * 2);

interface Runtime {
  playWave(spawns: WaveSegmentSpawn[]): Promise<WaveActorRuntimeResult>;
  cleanup(): void;
}

/**
 * A fixture that frames the camera tightly on the small scenario board so it
 * fills the captured canvas.
 *
 * Two legibility choices:
 * - A light-grey background instead of black. Terrain renders in a tan/brown
 *   palette and flat ground is *transparent* (it shows the background), so a
 *   pale neutral lets the brown walls/holes/towers and the navy water both
 *   stand out, while flat ground reads as the background.
 * - The canvas is sized to the board at `CAPTURE_ZOOM`, and the camera is
 *   zoomed to match, so the board fills the frame at large tiles. We then
 *   capture only the canvas element (see the screenshot call) to crop the
 *   surrounding iframe out entirely.
 */
const CAPTURE_BACKGROUND = Color.fromRGB(222, 224, 228);
const test = baseTest.extend<{ ctx: ExcaliburBrowserTestContext }>({
  ctx: async ({}, use) => {
    const ctx = await createExcaliburBrowserTestContext({
      width: CANVAS_WIDTH_PX,
      height: CANVAS_HEIGHT_PX,
      backgroundColor: CAPTURE_BACKGROUND,
    });
    ctx.scene.camera.pos = BOARD_CENTER;
    ctx.scene.camera.zoom = CAPTURE_ZOOM;
    await use(ctx);
    ctx.dispose();
  },
});

function makeRuntime(ctx: ExcaliburBrowserTestContext, grid: GridModel): Runtime {
  const adapter = scenarioAdapter(grid);
  const applier = new WaveEventApplier(grid);
  if (CAPTURE_PATH === "legacy") {
    return new WaveActorRuntime(ctx.scene, adapter, applier, TERRAIN_SLOPE);
  }
  // Hold the source open across the advance/peak window so the front reaches
  // inland before draining, matching the legacy surge.
  return new WaveFieldRuntime(ctx.scene, adapter, TERRAIN_SLOPE, {
    surgeWindowMs: 1500,
    applier,
  });
}

/**
 * The castle cells stay `FlatGround` in the grid (the real game draws the castle
 * via a separate `CastleActor` overlay fed by loaded `Resources`, which we don't
 * boot here), so a bare scenario grid renders nothing where the castle sits. We
 * drop in a distinct magenta marker over the castle footprint purely so the
 * castle is *visible* in the capture - this is rendering scaffolding and does
 * not change what any scenario tests. Magenta can't be confused with the
 * tan/brown terrain or the blue water.
 */
const CASTLE_MARKER_COLOR = Color.fromRGB(210, 40, 160);
function addCastleMarker(ctx: ExcaliburBrowserTestContext, grid: GridModel): void {
  const w = grid.castleWidth * SCENARIO_TILE_SIZE - 2;
  const h = grid.castleHeight * SCENARIO_TILE_SIZE - 2;
  const marker = new Actor({
    x: SCENARIO_GRID_LEFT + (grid.castleCol + grid.castleWidth / 2) * SCENARIO_TILE_SIZE,
    y: SCENARIO_GRID_TOP + (grid.castleRow + grid.castleHeight / 2) * SCENARIO_TILE_SIZE,
    z: 1,
  });
  marker.graphics.use(new Rectangle({ width: w, height: h, color: CASTLE_MARKER_COLOR }));
  ctx.scene.add(marker);
}

/** Path-appropriate "is there water on the page right now" probe. */
function waterPresent(ctx: ExcaliburBrowserTestContext): boolean {
  if (CAPTURE_PATH === "legacy") {
    return ctx.scene.actors.some((a) => a instanceof WaveSegment);
  }
  return ctx.scene.world.query([WaterComponent]).entities.length > 0;
}

for (const scenario of WAVE_VISUAL_SCENARIOS) {
  test.skip(`${CAPTURE_PATH} ${scenario.id}: ${scenario.description}`, async ({ ctx }) => {
    const grid = scenario.build(ctx.scene);
    addCastleMarker(ctx, grid);
    const runtime = makeRuntime(ctx, grid);
    const done = runtime.playWave(scenario.spawns());

    let advanceHadWater = false;
    let stepped = 0;

    for (const frame of ORDERED_FRAMES) {
      const target = FRAME_STEPS[frame];
      while (stepped < target) {
        ctx.step(16);
        stepped++;
      }
      if (frame === "advance") {
        advanceHadWater = waterPresent(ctx);
      }
      // Capture only the game canvas element, so the output is cropped to the
      // board rather than the full (mostly empty) test iframe.
      await page.screenshot({
        path: `${OUT_DIR}/${scenario.id}-${frame}.png`,
        element: ctx.game.canvas,
      });
    }

    runtime.cleanup();
    await done;

    // Structural (non-pixel) assertion: the wave actually produced water during
    // advance. Guards against a silently empty capture without locking pixels.
    expect(advanceHadWater).toBe(true);
  });
}
