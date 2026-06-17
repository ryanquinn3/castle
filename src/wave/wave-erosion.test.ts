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

  it("hole cell with surface below rim produces zero hydrostatic charge (trench case)", () => {
    // groundAt returns a deep pit floor (elevation = -3), groundLevelAt is the rim (0).
    // depth = 2 -> surface = -3 + 2 = -1, head = max(0, -1 - 0) = 0 -> zero hydrostatic.
    const pitCell: WetCell = { col: 1, row: 2, depth: 2, velX: 0, velY: 0 };
    const res = computeErosionHits({
      cells: [pitCell],
      isErodible: erodibleAt13,
      acc: new Map(),
      frontalCoeff: 0,
      shearCoeff: 0,
      hydrostaticCoeff: 0.6,
      groundAt: () => -3,
      groundLevelAt: () => 0,
    });
    expect(res.hits).toEqual([]);
    expect(res.acc.size).toBe(0);
  });

  it("flat ground (groundAt == groundLevelAt) produces the same hydrostatic charge as the unmodified behavior", () => {
    // groundAt == groundLevelAt == 5, depth = 2 -> surface = 7, head = max(0, 7 - 5) = 2 == depth.
    const flatCell: WetCell = { col: 1, row: 2, depth: 2, velX: 0, velY: 0 };
    const withGround = computeErosionHits({
      cells: [flatCell],
      isErodible: erodibleAt13,
      acc: new Map(),
      frontalCoeff: 0,
      shearCoeff: 0,
      hydrostaticCoeff: 0.6,
      groundAt: () => 5,
      groundLevelAt: () => 5,
    });
    const withoutGround = computeErosionHits({
      cells: [flatCell],
      isErodible: erodibleAt13,
      acc: new Map(),
      frontalCoeff: 0,
      shearCoeff: 0,
      hydrostaticCoeff: 0.6,
      // omit groundAt/groundLevelAt -> defaults to () => 0, head == depth
    });
    // Both produce charge = 0.6 * 2 = 1.2 -> 1 hit, 0.2 carry-over.
    expect(withGround.hits).toEqual([{ col: 1, row: 3, hits: 1 }]);
    expect(withGround.acc.get("1:3")).toBeCloseTo(0.2);
    expect(withoutGround.hits).toEqual([{ col: 1, row: 3, hits: 1 }]);
    expect(withoutGround.acc.get("1:3")).toBeCloseTo(0.2);
  });

  it("surface stacking above rim produces hydrostatic charge proportional to head above rim", () => {
    // groundAt = -1 (shallow pit), groundLevelAt = 0 (rim), depth = 3 -> surface = 2, head = 2.
    const stackedCell: WetCell = { col: 1, row: 2, depth: 3, velX: 0, velY: 0 };
    const res = computeErosionHits({
      cells: [stackedCell],
      isErodible: erodibleAt13,
      acc: new Map(),
      frontalCoeff: 0,
      shearCoeff: 0,
      hydrostaticCoeff: 0.6,
      groundAt: () => -1,
      groundLevelAt: () => 0,
    });
    // head = max(0, -1 + 3 - 0) = 2; charge = 0.6 * 2 = 1.2 -> 1 hit, 0.2 carry-over.
    expect(res.hits).toEqual([{ col: 1, row: 3, hits: 1 }]);
    expect(res.acc.get("1:3")).toBeCloseTo(0.2);
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
