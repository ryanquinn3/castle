import { describe, expect, it } from "vitest";
import type { WetCell } from "./wave-dynamic-system.ts";
import { applyTerrainFeedback, type TerrainProbe } from "./wave-terrain-feedback.ts";

const cell = (col: number, row: number, depth: number): WetCell => ({ col, row, depth, velX: 0, velY: 0 });

const probe = (over: Partial<TerrainProbe> = {}): TerrainProbe => ({
  isCastle: () => false,
  remainingHoleCapacity: () => 0,
  ...over,
});

describe("applyTerrainFeedback", () => {
  it("absorbs hole-resting water up to remaining capacity and keeps the overflow", () => {
    const res = applyTerrainFeedback({
      cells: [cell(1, 3, 5)],
      probe: probe({ remainingHoleCapacity: (c, r) => (c === 1 && r === 3 ? 2 : 0) }),
      floodDepth: 0.5,
      drainThreshold: 0.01,
    });
    expect(res.absorbed).toEqual([{ col: 1, row: 3, amount: 2 }]);
    expect(res.cells).toEqual([cell(1, 3, 3)]);
    expect(res.castleFlooded).toBe(false);
  });

  it("fully absorbs and drops a shallow cell over a hole with spare capacity", () => {
    const res = applyTerrainFeedback({
      cells: [cell(1, 3, 1)],
      probe: probe({ remainingHoleCapacity: () => 2 }),
      floodDepth: 0.5,
      drainThreshold: 0.05,
    });
    expect(res.absorbed).toEqual([{ col: 1, row: 3, amount: 1 }]);
    expect(res.cells).toEqual([]);
  });

  it("does not absorb over a full hole (capacity 0)", () => {
    const res = applyTerrainFeedback({
      cells: [cell(1, 3, 4)],
      probe: probe({ remainingHoleCapacity: () => 0 }),
      floodDepth: 0.5,
      drainThreshold: 0.01,
    });
    expect(res.absorbed).toEqual([]);
    expect(res.cells).toEqual([cell(1, 3, 4)]);
  });

  it("flags castle flooding only when a castle cell is wet at or above floodDepth", () => {
    const flooded = applyTerrainFeedback({
      cells: [cell(7, 11, 0.8)],
      probe: probe({ isCastle: (c, r) => c === 7 && r === 11 }),
      floodDepth: 0.5,
      drainThreshold: 0.01,
    });
    expect(flooded.castleFlooded).toBe(true);

    const shallow = applyTerrainFeedback({
      cells: [cell(7, 11, 0.2)],
      probe: probe({ isCastle: (c, r) => c === 7 && r === 11 }),
      floodDepth: 0.5,
      drainThreshold: 0.01,
    });
    expect(shallow.castleFlooded).toBe(false);
  });
});
