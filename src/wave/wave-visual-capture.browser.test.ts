import { Color, Vector } from "excalibur";
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

// Board pixel bounds: the ocean band sits one tile above gridTop, so the
// rendered region is y in [gridTop - tileSize, gridTop + height*tileSize].
const BOARD_WIDTH_PX = SCENARIO_WIDTH * SCENARIO_TILE_SIZE;
const BOARD_TOP_PX = SCENARIO_GRID_TOP - SCENARIO_TILE_SIZE;
const BOARD_HEIGHT_PX = SCENARIO_HEIGHT * SCENARIO_TILE_SIZE + SCENARIO_TILE_SIZE;
const BOARD_CENTER = new Vector(BOARD_WIDTH_PX / 2, BOARD_TOP_PX + BOARD_HEIGHT_PX / 2);
// Small margin so the board does not touch the canvas edge.
const MARGIN_PX = 8;

interface Runtime {
  playWave(spawns: WaveSegmentSpawn[]): Promise<WaveActorRuntimeResult>;
  cleanup(): void;
}

/**
 * A fixture that frames the camera tightly on the small scenario board against a
 * black background. The shared fixture defaults to a 500x500 ExcaliburBlue
 * canvas, which would leave the board a tiny patch in a sea of blue that blends
 * with the (also blue) water. Black + tight framing makes the water legible.
 */
const test = baseTest.extend<{ ctx: ExcaliburBrowserTestContext }>({
  ctx: async ({}, use) => {
    const ctx = await createExcaliburBrowserTestContext({
      width: BOARD_WIDTH_PX + MARGIN_PX * 2,
      height: BOARD_HEIGHT_PX + MARGIN_PX * 2,
      backgroundColor: Color.Black,
    });
    ctx.scene.camera.pos = BOARD_CENTER;
    ctx.scene.camera.zoom = 1;
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

/** Path-appropriate "is there water on the page right now" probe. */
function waterPresent(ctx: ExcaliburBrowserTestContext): boolean {
  if (CAPTURE_PATH === "legacy") {
    return ctx.scene.actors.some((a) => a instanceof WaveSegment);
  }
  return ctx.scene.world.query([WaterComponent]).entities.length > 0;
}

for (const scenario of WAVE_VISUAL_SCENARIOS) {
  test(`${CAPTURE_PATH} ${scenario.id}: ${scenario.description}`, async ({ ctx }) => {
    const grid = scenario.build(ctx.scene);
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
      await page.screenshot({ path: `${OUT_DIR}/${scenario.id}-${frame}.png` });
    }

    runtime.cleanup();
    await done;

    // Structural (non-pixel) assertion: the wave actually produced water during
    // advance. Guards against a silently empty capture without locking pixels.
    expect(advanceHadWater).toBe(true);
  });
}
