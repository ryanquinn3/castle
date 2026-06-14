import { describe, expect, it } from "vitest";
import { buildFieldCoverageData } from "./water-field-coverage.ts";

const TILE = 4;
const emptyGrid = (w: number, h: number) =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => 0));

describe("buildFieldCoverageData", () => {
  it("produces an RGBA buffer sized (height+1) rows tall", () => {
    const depths = emptyGrid(3, 4);
    const rgba = buildFieldCoverageData({ depths, gridWidth: 3, gridHeight: 4, tileSize: TILE });
    expect(rgba.length).toBe(3 * TILE * ((4 + 1) * TILE) * 4);
  });

  it("is fully transparent when dry", () => {
    const rgba = buildFieldCoverageData({ depths: emptyGrid(3, 4), gridWidth: 3, gridHeight: 4, tileSize: TILE });
    let maxAlpha = 0;
    for (let i = 3; i < rgba.length; i += 4) {
      maxAlpha = Math.max(maxAlpha, rgba[i]);
    }
    expect(maxAlpha).toBe(0);
  });

  it("writes depth (R) + alpha over a wet cell, transparent far away", () => {
    const depths = emptyGrid(3, 6);
    depths[2][1] = 6;
    const rgba = buildFieldCoverageData({ depths, gridWidth: 3, gridHeight: 6, tileSize: TILE });
    const pixelW = 3 * TILE;
    const at = (px: number, py: number) => (py * pixelW + px) * 4;
    const cx = 1 * TILE + TILE / 2;
    const cy = (2 + 1) * TILE + TILE / 2; // +1 ocean band offset
    expect(rgba[at(cx, cy)]).toBeGreaterThan(0);
    expect(rgba[at(cx, cy) + 3]).toBeGreaterThan(0);
    expect(rgba[at(0, (5 + 1) * TILE + TILE / 2) + 3]).toBe(0);
  });

  it("writes foam (G) only near the leading wet front, not across the body", () => {
    // Wet block rows 1..4 with a per-row depth gradient (the legacy sim has
    // deeper water upstream, shallower downstream). Row 5 is dry, so the front
    // is the row 4 / row 5 boundary. The body (rows 1..3) has a wet row below,
    // so it must carry NO foam; the per-row depth step must not produce bands.
    const w = 3;
    const h = 7;
    const depths = emptyGrid(w, h);
    const rowDepth: Record<number, number> = { 1: 8, 2: 6, 3: 4, 4: 2 };
    for (const row of [1, 2, 3, 4]) {
      for (let col = 0; col < w; col++) {
        depths[row][col] = rowDepth[row];
      }
    }
    const rgba = buildFieldCoverageData({ depths, gridWidth: w, gridHeight: h, tileSize: TILE });
    const pixelW = w * TILE;
    const foamAt = (px: number, py: number) => rgba[(py * pixelW + px) * 4 + 1];

    const col = 1;
    const cx = col * TILE + TILE / 2;

    // Body: every wet pixel of rows 1..3 (the +1 ocean band offset puts grid
    // row r in pixel band r+1) has a wet row below -> no foam.
    let maxBodyFoam = 0;
    for (const gridRow of [1, 2, 3]) {
      const bandTop = (gridRow + 1) * TILE;
      for (let py = bandTop; py < bandTop + TILE; py++) {
        maxBodyFoam = Math.max(maxBodyFoam, foamAt(cx, py));
      }
    }
    expect(maxBodyFoam).toBe(0);

    // Front: pixels just above the wet/dry boundary (bottom of row 4) carry foam.
    const frontPy = (4 + 1 + 1) * TILE - 1;
    expect(foamAt(cx, frontPy)).toBeGreaterThan(0);
  });
});
