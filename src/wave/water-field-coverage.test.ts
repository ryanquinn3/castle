import { describe, expect, it } from "vitest";
import { buildFieldCoverageData } from "./water-field-coverage.ts";

const TILE = 4;
const emptyGrid = (w: number, h: number) =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => 0));

describe("buildFieldCoverageData", () => {
  const makeInput = (depths: number[][], oceanDepth = 0) => ({
    depths,
    gridWidth: depths[0].length,
    gridHeight: depths.length,
    tileSize: TILE,
    oceanDepth,
  });

  it("produces an RGBA buffer sized (height+1) rows tall", () => {
    const depths = emptyGrid(3, 4);
    const rgba = buildFieldCoverageData(makeInput(depths));
    expect(rgba.length).toBe(3 * TILE * ((4 + 1) * TILE) * 4);
  });

  it("is fully transparent when dry", () => {
    const rgba = buildFieldCoverageData(makeInput(emptyGrid(3, 4)));
    let maxAlpha = 0;
    for (let i = 3; i < rgba.length; i += 4) {
      maxAlpha = Math.max(maxAlpha, rgba[i]);
    }
    expect(maxAlpha).toBe(0);
  });

  it("writes depth (R) + alpha (A=255) over a wet cell, transparent far away", () => {
    const depths = emptyGrid(3, 6);
    depths[2][1] = 6;
    const rgba = buildFieldCoverageData(makeInput(depths));
    const pixelW = 3 * TILE;
    const at = (px: number, py: number) => (py * pixelW + px) * 4;
    const cx = 1 * TILE + TILE / 2;
    const cy = (2 + 1) * TILE + TILE / 2; // +1 ocean band offset
    expect(rgba[at(cx, cy)]).toBeGreaterThan(0); // R = depth
    expect(rgba[at(cx, cy) + 3]).toBe(255); // A = 255 wet
    expect(rgba[at(0, (5 + 1) * TILE + TILE / 2) + 3]).toBe(0); // far pixel dry
  });

  it("scales R with depth (deeper cell -> larger R)", () => {
    const shallow = emptyGrid(3, 6);
    shallow[2][1] = 2;
    const deep = emptyGrid(3, 6);
    deep[2][1] = 8;
    const pixelW = 3 * TILE;
    const idx = ((2 + 1) * TILE + TILE / 2) * pixelW + (1 * TILE + TILE / 2);
    const rShallow = buildFieldCoverageData(makeInput(shallow))[idx * 4];
    const rDeep = buildFieldCoverageData(makeInput(deep))[idx * 4];
    expect(rDeep).toBeGreaterThan(rShallow);
  });

  it("fills the top ocean band with standing water when oceanDepth > 0", () => {
    const depths = emptyGrid(3, 4);
    const rgba = buildFieldCoverageData(makeInput(depths, 3));
    const pixelW = 3 * TILE;
    // Center of the ocean band sits half a tile down from the top.
    const cy = Math.floor(TILE / 2);
    const cx = 1 * TILE + Math.floor(TILE / 2);
    const idx = (cy * pixelW + cx) * 4;
    expect(rgba[idx]).toBeGreaterThan(0); // R = ocean depth
    expect(rgba[idx + 1]).toBe(255); // G = full opaque-ocean weight near the top
    expect(rgba[idx + 3]).toBe(255); // A = wet
    // Deep in the (dry) grid interior stays transparent.
    expect(rgba[((3 + 1) * TILE) * pixelW * 4 + 3]).toBe(0);
  });

  it("does not flag grid-interior water as opaque ocean (G stays 0)", () => {
    const depths = emptyGrid(3, 6);
    depths[2][1] = 6;
    const rgba = buildFieldCoverageData(makeInput(depths, 3));
    const pixelW = 3 * TILE;
    const cx = 1 * TILE + Math.floor(TILE / 2);
    const cy = (2 + 1) * TILE + Math.floor(TILE / 2); // +1 ocean band offset
    const idx = (cy * pixelW + cx) * 4;
    expect(rgba[idx + 3]).toBe(255); // wet
    expect(rgba[idx + 1]).toBe(0); // not ocean band -> no opaque flag
  });
});
