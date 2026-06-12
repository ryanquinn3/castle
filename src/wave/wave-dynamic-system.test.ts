import { describe, expect, it } from "vitest";
import { computeFluxStep, type WetCell } from "./wave-dynamic-system.ts";

const COEFF = 0.2;
const THRESHOLD = 0.01;

const flat = (_col: number, _row: number) => 0;
const slope = (s: number) => (_col: number, row: number) => s * row;

const totalDepth = (cells: WetCell[]) => cells.reduce((sum, c) => sum + c.depth, 0);
const depthAt = (cells: WetCell[], col: number, row: number) =>
  cells.find((c) => c.col === col && c.row === row)?.depth ?? 0;

const run = (
  cells: WetCell[],
  steps: number,
  opts: { width: number; height: number; groundAt: (c: number, r: number) => number; source: { open: boolean; depth: number }; oceanSink: boolean },
) => {
  let current = cells;
  for (let s = 0; s < steps; s++) {
    current = computeFluxStep({ cells: current, coeff: COEFF, drainThreshold: THRESHOLD, ...opts });
  }
  return current;
};

describe("computeFluxStep — closed box (oceanSink off)", () => {
  it("conserves mass and stays non-negative as water spreads", () => {
    const seed: WetCell[] = [{ col: 3, row: 3, depth: 10, velX: 0, velY: 0 }];
    const start = totalDepth(seed);
    const out = run(seed, 200, {
      width: 7, height: 7, groundAt: flat, source: { open: false, depth: 0 }, oceanSink: false,
    });
    expect(totalDepth(out)).toBeCloseTo(start, 3);
    for (const c of out) {
      expect(c.depth).toBeGreaterThanOrEqual(0);
    }
  });

  it("spreads monotonically from the seed and stays symmetric (no checkerboard)", () => {
    const seed: WetCell[] = [{ col: 4, row: 4, depth: 12, velX: 0, velY: 0 }];
    const out = run(seed, 150, {
      width: 9, height: 9, groundAt: flat, source: { open: false, depth: 0 }, oceanSink: false,
    });
    for (let col = 4; col < 8; col++) {
      expect(depthAt(out, col, 4)).toBeGreaterThanOrEqual(depthAt(out, col + 1, 4) - 1e-6);
    }
    expect(depthAt(out, 3, 4)).toBeCloseTo(depthAt(out, 5, 4), 4);
    expect(depthAt(out, 4, 3)).toBeCloseTo(depthAt(out, 4, 5), 4);
  });
});

describe("computeFluxStep — slope with source + ocean sink", () => {
  it("converges to ~D/s rows of reach with a held source", () => {
    const out = run([], 4000, {
      width: 3, height: 16, groundAt: slope(0.5), source: { open: true, depth: 4 }, oceanSink: true,
    });
    const deepestWetRow = Math.max(...out.map((c) => c.row));
    expect(deepestWetRow).toBeGreaterThanOrEqual(6);
    expect(deepestWetRow).toBeLessThanOrEqual(8);
    expect(depthAt(out, 1, 2)).toBeCloseTo(4 - 0.5 * 2, 1);
    expect(depthAt(out, 1, 5)).toBeCloseTo(4 - 0.5 * 5, 1);
  });

  it("drains to empty after the source closes", () => {
    const filled = run([], 2000, {
      width: 3, height: 16, groundAt: slope(0.5), source: { open: true, depth: 4 }, oceanSink: true,
    });
    expect(filled.length).toBeGreaterThan(0);
    const drained = run(filled, 6000, {
      width: 3, height: 16, groundAt: slope(0.5), source: { open: false, depth: 0 }, oceanSink: true,
    });
    expect(drained.length).toBe(0);
  });
});
