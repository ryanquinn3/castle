/**
 * Visual baseline test for the flowing-water fragment shader.
 *
 * Sets up a synthetic coverage buffer with:
 *   - A wet body (deep) in the upper rows
 *   - A leading front (depth tapers off toward the bottom)
 *
 * The test advances time so u_time_ms > 0 (ripples / caustics animated), then
 * captures a screenshot and asserts structural invariants on the coverage
 * buffer: a wet body exists and depth varies (deep body -> shallow front -> dry).
 * These guarantee the shader has the data it needs to produce flowing ripples,
 * specular glints, caustics, depth tint, and a leading-edge foam cap.
 */
import { expect, test } from "../test/excalibur-browser-shared-test.ts";
import { page } from "vitest/browser";
import { WaveOverlay } from "./wave-overlay.ts";
import { buildFieldCoverageData } from "./water-field-coverage.ts";

const TILE = 16;
const COLS = 6;
const ROWS = 8;

/** Build a synthetic field: a deep wet body tapering to a thin leading front. */
function makeSyntheticField(): Uint8ClampedArray {
  const depths: number[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => 0),
  );

  // Rows 0-4 = deep body; row 5 shallower; row 6 thin leading edge; row 7 dry.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r < 5) {
        depths[r][c] = 9.0; // deep body (DEPTH_NORMALIZE = 9)
      } else if (r === 5) {
        depths[r][c] = 5.0; // shallower
      } else if (r === 6) {
        depths[r][c] = 1.5; // thin leading edge
      }
      // row 7 stays dry -> creates the front foam contrast
    }
  }

  return buildFieldCoverageData({
    depths,
    gridWidth: COLS,
    gridHeight: ROWS,
    tileSize: TILE,
    oceanDepth: 3,
  });
}

test(
  "flowing-water shader: wet body with depth variation feeds the shader",
  async ({ scene, clock }) => {
    const overlay = new WaveOverlay({
      gridLeft: 0,
      gridTop: TILE,
      tileSize: TILE,
      width: COLS,
      height: ROWS,
    });
    scene.add(overlay);

    // Load the synthetic field into the overlay buffer.
    overlay.setCoverage(makeSyntheticField());

    // Advance time so u_time_ms > 0 — ripples, caustics and specular are animated.
    for (let i = 0; i < 32; i++) {
      clock.step(16);
    }

    // Capture screenshot for visual inspection (no path → temp file only).
    await page.screenshot();

    // ---- buffer invariants ----
    // The shader renders GPU-side; we can't read back the framebuffer directly.
    // Instead we assert on the input coverage buffer to confirm the wet body is
    // present and depth varies (deep body -> shallow front), which is what the
    // shader needs for ripples, specular, caustics, depth tint, and front foam.
    const imgData = overlay.debugImageData();
    expect(imgData).not.toBeNull();

    const data = imgData!.data;

    const depthValues: number[] = [];
    let wetPixelCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 10) {
        continue; // skip dry pixels
      }
      wetPixelCount++;
      depthValues.push(data[i]); // R = depth
    }

    // (a) Wet pixels must exist — the shader discards dry fragments (cover < 0.01).
    expect(wetPixelCount).toBeGreaterThan(0);

    // (b) Depth must vary: the body is deep, the front is shallow.
    const maxDepth = Math.max(...depthValues);
    const minDepth = Math.min(...depthValues);
    expect(maxDepth).toBeGreaterThan(200); // deep water present
    expect(minDepth).toBeLessThan(100); // shallow front present
  },
);
