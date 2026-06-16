import { describe, expect, it } from "vitest";
import { computeFluxStep, type WetCell } from "./wave-dynamic-system.ts";
import { applyTerrainFeedback, type TerrainProbe } from "./wave-terrain-feedback.ts";

const cell = (col: number, row: number, depth: number): WetCell => ({ col, row, depth, velX: 0, velY: 0 });

const probe = (over: Partial<TerrainProbe> = {}): TerrainProbe => ({
  isCastle: () => false,
  ...over,
});

describe("applyTerrainFeedback", () => {
  it("does not remove hole-resting water (water passes through unchanged)", () => {
    const res = applyTerrainFeedback({
      cells: [cell(1, 3, 5)],
      probe: probe({ isCastle: () => false }),
      floodDepth: 0.5,
    });
    expect(res.cells).toEqual([cell(1, 3, 5)]);
    expect(res.castleFlooded).toBe(false);
  });

  it("still flags castle flooding at or above floodDepth", () => {
    expect(
      applyTerrainFeedback({
        cells: [cell(7, 11, 0.8)],
        probe: probe({ isCastle: (c, r) => c === 7 && r === 11 }),
        floodDepth: 0.5,
      }).castleFlooded,
    ).toBe(true);
  });
});

describe("channeling reproduce - water flows to the deepest hole", () => {
  const groundAt = (_c: number, r: number) => {
    const depth = r === 4 ? 1 : r === 5 ? 5 : r === 6 ? 10 : 0;
    return 0.5 * r - depth;
  };

  it("water seeded at the shallow hole collects in the deepest hole", () => {
    let cells: WetCell[] = [{ col: 0, row: 4, depth: 1, velX: 0, velY: 0 }];
    for (let s = 0; s < 400; s++) {
      cells = computeFluxStep({
        cells,
        width: 1,
        height: 16,
        groundAt,
        source: { open: false, depths: [0] },
        oceanSink: true,
        coeff: 0.2,
        drainThreshold: 0.01,
      });
      cells = applyTerrainFeedback({ cells, probe: probe(), floodDepth: 0.5 }).cells;
    }
    const depthAt = (r: number) => cells.find((c) => c.row === r)?.depth ?? 0;
    expect(depthAt(6)).toBeGreaterThan(depthAt(4));
    expect(depthAt(6)).toBeGreaterThan(0.5);
  });
});
