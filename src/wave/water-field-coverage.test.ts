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
});
