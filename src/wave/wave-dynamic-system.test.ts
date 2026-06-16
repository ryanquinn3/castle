import { describe, expect, it } from "vitest";
import { PRESSURE_INERTIA_COEFF } from "../config.ts";
import { computeFluxStep, isFieldSettled, seepDepth, type WetCell } from "./wave-dynamic-system.ts";

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
  opts: {
    width: number;
    height: number;
    groundAt: (c: number, r: number) => number;
    source: { open: boolean; depth?: number; depths?: number[] };
    oceanSink: boolean;
    inertiaCoeff?: number;
  },
) => {
  const depths = opts.source.depths ?? Array.from({ length: opts.width }, () => opts.source.depth ?? 0);
  const source = { open: opts.source.open, depths };
  let current = cells;
  for (let s = 0; s < steps; s++) {
    current = computeFluxStep({
      cells: current,
      width: opts.width,
      height: opts.height,
      groundAt: opts.groundAt,
      source,
      oceanSink: opts.oceanSink,
      coeff: COEFF,
      drainThreshold: THRESHOLD,
      inertiaCoeff: opts.inertiaCoeff,
    });
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

  it("stays stable (mass-conserving, non-negative, no checkerboard) with inertia on", () => {
    // Mirrors the inertia-off closed-box invariants on the same 7x7/depth-10 grid,
    // but with PRESSURE_INERTIA_COEFF active. The seed has zero velocity, so any
    // motion is generated and then carried by the inertia term itself; a runaway
    // would show up as mass drift, a negative depth, or a checkerboard.
    const seed: WetCell[] = [{ col: 3, row: 3, depth: 10, velX: 0, velY: 0 }];
    const start = totalDepth(seed);
    const out = run(seed, 200, {
      width: 7,
      height: 7,
      groundAt: flat,
      source: { open: false, depth: 0 },
      oceanSink: false,
      inertiaCoeff: PRESSURE_INERTIA_COEFF,
    });
    expect(totalDepth(out)).toBeCloseTo(start, 3);
    for (const c of out) {
      expect(c.depth).toBeGreaterThanOrEqual(0);
    }
    // Symmetric seed + ground: momentum must stay symmetric (no directional bias,
    // the real checkerboard guard — a checkerboard breaks left/right symmetry).
    expect(depthAt(out, 2, 3)).toBeCloseTo(depthAt(out, 4, 3), 4);
    expect(depthAt(out, 3, 2)).toBeCloseTo(depthAt(out, 3, 4), 4);
    // Outward profile is near-monotonic. Unlike pure diffusion (strictly
    // monotonic), an inertial field carries a small, bounded ripple at the
    // advancing front (the swash). That overshoot stays <= ~0.01 and decays over
    // time (it does not grow) — proof the inertia term is not running away. We
    // allow that bounded slack rather than asserting strict monotonicity.
    const OVERSHOOT_TOLERANCE = 0.02;
    for (let col = 3; col < 6; col++) {
      expect(depthAt(out, col, 3)).toBeGreaterThanOrEqual(
        depthAt(out, col + 1, 3) - OVERSHOOT_TOLERANCE,
      );
    }
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

  it("holds each column at its own source depth (uneven lateral profile)", () => {
    const out = run([], 4000, {
      width: 3,
      height: 16,
      groundAt: slope(0.5),
      source: { open: true, depths: [6, 1, 6] }, // deep edges, shallow middle
      oceanSink: true,
    });
    // The per-column pin is a per-column minimum: the deep edges (D=6) hold their
    // source depth at row 0, while the shallow middle (D=1) is only as deep as the
    // lateral inflow gives it — strictly below the edges. A Math.max collapse of the
    // profile would instead pin the middle to 6 too, so this distinguishes the two.
    expect(depthAt(out, 0, 0)).toBeCloseTo(6, 5);
    expect(depthAt(out, 2, 0)).toBeCloseTo(6, 5);
    expect(depthAt(out, 1, 0)).toBeLessThan(6);
    expect(depthAt(out, 1, 0)).toBeGreaterThanOrEqual(1);
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

describe("computeFluxStep — momentum/inertia", () => {
  // Flat ground, two adjacent cells at EQUAL depth (zero pressure gradient), the
  // upstream cell carrying a southward velocity. Pure pressure relaxation cannot
  // move equal-head water; only the carried velocity (momentum) can.
  const flatEqual = (inertiaCoeff: number) =>
    computeFluxStep({
      cells: [
        { col: 0, row: 0, depth: 4, velX: 0, velY: 2 },
        { col: 0, row: 1, depth: 4, velX: 0, velY: 0 },
      ],
      width: 1,
      height: 2,
      groundAt: flat,
      source: { open: false, depths: [0] },
      oceanSink: false,
      coeff: COEFF,
      drainThreshold: THRESHOLD,
      inertiaCoeff,
    });

  it("does not move equal-head water with inertia off (pure pressure)", () => {
    const out = flatEqual(0);
    // No net transfer: both cells keep their seeded depth.
    expect(depthAt(out, 0, 0)).toBeCloseTo(4, 6);
    expect(depthAt(out, 0, 1)).toBeCloseTo(4, 6);
  });

  it("carries equal-head water in its established direction with inertia on", () => {
    const out = flatEqual(0.5);
    // Momentum pushes water south even though heads are equal.
    expect(depthAt(out, 0, 1)).toBeGreaterThan(4);
    expect(depthAt(out, 0, 0)).toBeLessThan(4);
    // The upstream cell's returned velocity stays southward so motion persists.
    const upstream = out.find((c) => c.col === 0 && c.row === 0)!;
    expect(upstream.velY).toBeGreaterThan(0);
  });
});

describe("seepDepth — rim-aware recede drain", () => {
  it("seeps flat-ground water fully (floor == ground level)", () => {
    expect(seepDepth({ floor: 0, depth: 2, groundLevel: 0, seep: 0.5 })).toBeCloseTo(1.5, 6);
  });

  it("does not seep water sitting below the beach plane in a hole", () => {
    // hole floor -3, holding 2 units => surface -1, entirely below ground level 0
    expect(seepDepth({ floor: -3, depth: 2, groundLevel: 0, seep: 0.5 })).toBeCloseTo(2, 6);
  });

  it("seeps only the band of water standing above the rim", () => {
    // hole floor -3, holding 4 => surface +1, only the 1 unit above ground level seeps
    expect(seepDepth({ floor: -3, depth: 4, groundLevel: 0, seep: 0.5 })).toBeCloseTo(3.5, 6);
    // a large seep cannot drain below the rim in one step
    expect(seepDepth({ floor: -3, depth: 4, groundLevel: 0, seep: 5 })).toBeCloseTo(3, 6);
  });
});

describe("isFieldSettled", () => {
  const groundLevel = (_c: number, r: number) => 0.5 * r;
  // a hole at (0,4): beach plane 2.0, floor 2.0 - 3 = -1.0
  const groundAt = (c: number, r: number) => (c === 0 && r === 4 ? 0.5 * r - 3 : 0.5 * r);

  it("is settled when trapped pool water is below the rim and at rest", () => {
    // groundAt(0,4) = -1, groundLevel(0,4) = 2, depth=2 => seepable = -1+2-2 = -1 => clamped 0 => settled
    const cells: WetCell[] = [{ col: 0, row: 4, depth: 2, velX: 0, velY: 0 }];
    expect(
      isFieldSettled({ cells, groundAt, groundLevelAt: groundLevel, velocityEpsilon: 0.02, seepEpsilon: 0.01 }),
    ).toBe(true);
  });

  it("is not settled while water still stands above the rim", () => {
    // groundAt(0,4) = -1, groundLevel(0,4) = 2, depth=4 => seepable = -1+4-2 = 1 > seepEpsilon => not settled
    const cells: WetCell[] = [{ col: 0, row: 4, depth: 4, velX: 0, velY: 0 }];
    expect(
      isFieldSettled({ cells, groundAt, groundLevelAt: groundLevel, velocityEpsilon: 0.02, seepEpsilon: 0.01 }),
    ).toBe(false);
  });

  it("is not settled while any cell is still moving", () => {
    // Below the rim but velocity exceeds epsilon
    const cells: WetCell[] = [{ col: 0, row: 4, depth: 2, velX: 0, velY: 0.5 }];
    expect(
      isFieldSettled({ cells, groundAt, groundLevelAt: groundLevel, velocityEpsilon: 0.02, seepEpsilon: 0.01 }),
    ).toBe(false);
  });
});

describe("computeFluxStep — terrain as ground (walls block / overtop / flow around)", () => {
  // groundAt with a single raised cell acting as a wall of the given elevation.
  const wall = (col: number, row: number, elev: number) => (c: number, r: number) =>
    0.5 * r + (c === col && r === row ? elev : 0);

  it("a tall wall blocks its own cell but water flows around it laterally", () => {
    const out = run([], 3000, {
      width: 3,
      height: 12,
      groundAt: wall(1, 3, 5),
      source: { open: true, depth: 4 },
      oceanSink: true,
    });
    // Head tops out near D=4; the wall cell's ground is 0.5*3+5 = 6.5, so it stays dry.
    expect(depthAt(out, 1, 3)).toBeLessThan(0.1);
    // South of the wall in the same column can only wet via lateral inflow from the sides.
    expect(depthAt(out, 1, 4)).toBeGreaterThan(0.5);
    // The sides themselves carry water past the wall row.
    expect(depthAt(out, 0, 4)).toBeGreaterThan(0.5);
  });

  it("a low wall is overtopped and water continues past it", () => {
    const out = run([], 3000, {
      width: 3,
      height: 12,
      groundAt: wall(1, 3, 1),
      source: { open: true, depth: 4 },
      oceanSink: true,
    });
    // Wall ground 0.5*3+1 = 2.5 < head 4, so water sits on the wall cell (overtopped)...
    expect(depthAt(out, 1, 3)).toBeGreaterThan(0.5);
    // ...and reaches beyond it.
    expect(depthAt(out, 1, 5)).toBeGreaterThan(0.3);
  });
});
