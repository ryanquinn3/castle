import { describe, expect, it } from "vitest";
import type { WetCell } from "./wave-dynamic-system.ts";
import { computeErosionHits } from "./wave-erosion.ts";

const cell = (col: number, row: number, velX: number, velY: number): WetCell => ({
  col,
  row,
  depth: 1,
  velX,
  velY,
});

// A single erodible face at (1, 3).
const erodibleAt13 = (col: number, row: number): boolean => col === 1 && row === 3;

describe("computeErosionHits", () => {
  it("charges a face more from frontal flow than from glancing (shear) flow", () => {
    // North neighbor flowing straight south into the face: pure frontal.
    const frontal = computeErosionHits({
      cells: [cell(1, 2, 0, 0.4)],
      isErodible: erodibleAt13,
      acc: new Map(),
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
    });
    // West neighbor flowing south past the face: pure shear (parallel).
    const shear = computeErosionHits({
      cells: [cell(0, 3, 0, 0.4)],
      isErodible: erodibleAt13,
      acc: new Map(),
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
    });

    expect(frontal.acc.get("1:3")!).toBeGreaterThan(shear.acc.get("1:3")! * 5);
  });

  it("emits the whole-number part as hits and carries the fraction over", () => {
    const res = computeErosionHits({
      cells: [cell(1, 2, 0, 1.0)], // frontal flux 1.0 * frontalCoeff 0.8 = 0.8
      isErodible: erodibleAt13,
      acc: new Map([["1:3", 0.7]]), // 0.7 carried in -> 1.5 total
      frontalCoeff: 0.8,
      shearCoeff: 0.05,
    });
    expect(res.hits).toEqual([{ col: 1, row: 3, hits: 1 }]);
    expect(res.acc.get("1:3")).toBeCloseTo(0.5);
  });

  it("emits nothing while charge stays below 1 and accumulates it", () => {
    const res = computeErosionHits({
      cells: [cell(1, 2, 0, 0.4)],
      isErodible: erodibleAt13,
      acc: new Map(),
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
    });
    expect(res.hits).toEqual([]);
    expect(res.acc.get("1:3")).toBeCloseTo(0.2);
  });

  it("ignores flow toward non-erodible neighbors", () => {
    const res = computeErosionHits({
      cells: [cell(1, 2, 0, 0.4)],
      isErodible: () => false,
      acc: new Map(),
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
    });
    expect(res.hits).toEqual([]);
    expect(res.acc.size).toBe(0);
  });

  it("does not mutate the input accumulator", () => {
    const acc = new Map([["1:3", 0.9]]);
    computeErosionHits({
      cells: [cell(1, 2, 0, 0.4)],
      isErodible: erodibleAt13,
      acc,
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
    });
    expect(acc.get("1:3")).toBe(0.9);
  });
});
