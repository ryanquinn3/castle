import { describe, expect, it } from "vitest";
import { buildCoverageData, type SegmentData } from "./wave-overlay.ts";

const TILE = 16;

function seg(overrides: Partial<SegmentData> = {}): SegmentData {
  return {
    col: 0,
    pixelY: 0,
    currentDepth: 4,
    state: "surging",
    tileSize: TILE,
    ...overrides,
  };
}

function pixel(
  data: Uint8ClampedArray,
  width: number,
  px: number,
  py: number,
) {
  const idx = (py * width + px) * 4;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
}

describe("buildCoverageData", () => {
  it("empty segments produce all-zero coverage", () => {
    const data = buildCoverageData([], 32, 32);
    expect(data.every((v) => v === 0)).toBe(true);
  });

  it("single surging segment produces coverage from top to leading edge", () => {
    const gridW = 3 * TILE;
    const gridH = 4 * TILE;
    const data = buildCoverageData(
      [seg({ col: 1, pixelY: 2 * TILE, currentDepth: 4, state: "surging" })],
      gridW,
      gridH,
    );

    const midCol = TILE + TILE / 2;

    const atTop = pixel(data, gridW, midCol, 0);
    expect(atTop.r).toBeGreaterThan(0);
    expect(atTop.b).toBeGreaterThan(0);
    expect(atTop.a).toBe(255);

    const insideTile = 2 * TILE;
    const p = pixel(data, gridW, midCol, insideTile);
    expect(p.r).toBeGreaterThan(0);
    expect(p.b).toBeGreaterThan(0);
    expect(p.a).toBe(255);

    const belowSegment = pixel(data, gridW, midCol, 2 * TILE + TILE + 2);
    expect(belowSegment.r).toBe(0);
    expect(belowSegment.a).toBe(0);
  });

  it("leading edge pixels have G > 0 (foam flag)", () => {
    const gridW = 2 * TILE;
    const gridH = 4 * TILE;
    const frontPixelY = 2 * TILE;
    const data = buildCoverageData(
      [seg({ col: 0, pixelY: frontPixelY, currentDepth: 4, state: "surging" })],
      gridW,
      gridH,
    );

    const midCol = TILE / 2;
    const leadingEdge = frontPixelY + TILE / 2;
    const p = pixel(data, gridW, midCol, leadingEdge);
    expect(p.g).toBeGreaterThan(0);

    const awayFromEdge = pixel(data, gridW, midCol, frontPixelY - TILE / 2 + 1);
    expect(awayFromEdge.g).toBe(0);
  });

  it("two adjacent columns with different depths produce interpolated R", () => {
    const gridW = 3 * TILE;
    const gridH = 4 * TILE;
    const data = buildCoverageData(
      [
        seg({ col: 0, pixelY: 2 * TILE, currentDepth: 2, state: "surging" }),
        seg({ col: 1, pixelY: 2 * TILE, currentDepth: 8, state: "surging" }),
      ],
      gridW,
      gridH,
    );

    const insideTile = 2 * TILE;
    const nearLeftR = pixel(data, gridW, 4, insideTile).r;
    const midR = pixel(data, gridW, 8, insideTile).r;
    const nearRightR = pixel(data, gridW, 12, insideTile).r;

    expect(midR).toBeGreaterThan(nearLeftR);
    expect(midR).toBeLessThan(nearRightR);
  });

  it("receding/still segments contribute coverage but G = 0", () => {
    const gridW = TILE;
    const gridH = 4 * TILE;
    const data = buildCoverageData(
      [seg({ col: 0, pixelY: 2 * TILE, currentDepth: 3, state: "still" })],
      gridW,
      gridH,
    );

    const midCol = TILE / 2;
    const inTile = 2 * TILE;
    const p = pixel(data, gridW, midCol, inTile);
    expect(p.r).toBeGreaterThan(0);
    expect(p.b).toBeGreaterThan(0);
    expect(p.a).toBe(255);
    expect(p.g).toBe(0);
  });
});
