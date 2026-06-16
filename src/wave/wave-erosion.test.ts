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
      hydrostaticCoeff: 0,
    });
    // West neighbor flowing south past the face: pure shear (parallel).
    const shear = computeErosionHits({
      cells: [cell(0, 3, 0, 0.4)],
      isErodible: erodibleAt13,
      acc: new Map(),
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
      hydrostaticCoeff: 0,
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
      hydrostaticCoeff: 0,
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
      hydrostaticCoeff: 0,
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
      hydrostaticCoeff: 0,
    });
    expect(res.hits).toEqual([]);
    expect(res.acc.size).toBe(0);
  });

  it("a still wet cell with depth produces hydrostatic charge per frame and emits hits when charge crosses integer", () => {
    // velX = 0, velY = 0 -> frontal and shear contribute nothing.
    // depth = 2.0, hydrostaticCoeff = 0.6 -> adds 1.2 per frame to each adjacent erodible face.
    const cellStill = (col: number, row: number, depth: number): WetCell => ({
      col,
      row,
      depth,
      velX: 0,
      velY: 0,
    });

    // Frame 1: charge starts at 0, adds 1.2 -> whole part 1 emitted, 0.2 carried over.
    const frame1 = computeErosionHits({
      cells: [cellStill(1, 2, 2.0)],
      isErodible: erodibleAt13,
      acc: new Map(),
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
      hydrostaticCoeff: 0.6,
    });
    expect(frame1.hits).toEqual([{ col: 1, row: 3, hits: 1 }]);
    expect(frame1.acc.get("1:3")).toBeCloseTo(0.2);

    // Frame 2: 0.2 carried in, adds another 1.2 -> 1.4 total -> 1 hit emitted, 0.4 carried over.
    const frame2 = computeErosionHits({
      cells: [cellStill(1, 2, 2.0)],
      isErodible: erodibleAt13,
      acc: frame1.acc,
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
      hydrostaticCoeff: 0.6,
    });
    expect(frame2.hits).toEqual([{ col: 1, row: 3, hits: 1 }]);
    expect(frame2.acc.get("1:3")).toBeCloseTo(0.4);
  });

  it("does not mutate the input accumulator", () => {
    const acc = new Map([["1:3", 0.9]]);
    computeErosionHits({
      cells: [cell(1, 2, 0, 0.4)],
      isErodible: erodibleAt13,
      acc,
      frontalCoeff: 0.5,
      shearCoeff: 0.05,
      hydrostaticCoeff: 0,
    });
    expect(acc.get("1:3")).toBe(0.9);
  });
});
