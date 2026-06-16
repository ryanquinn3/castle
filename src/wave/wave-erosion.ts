import type { WetCell } from "./wave-dynamic-system.ts";

/** @public */
export interface ErosionHit {
  col: number;
  row: number;
  hits: number;
}

export interface ErosionInput {
  cells: WetCell[];
  /** A wall or tower face that can be eroded (elevation > 0, not castle). */
  isErodible: (col: number, row: number) => boolean;
  /** Carry-over fractional erosion charge per "col:row" face, threaded across frames. */
  acc: Map<string, number>;
  /** Charge per unit of flux driven straight into a face. Tuning knob. */
  frontalCoeff: number;
  /** Charge per unit of flux running parallel past a face (<< frontal). Tuning knob. */
  shearCoeff: number;
  /** Charge per unit of water depth pressing against a face regardless of velocity. Tuning knob. */
  hydrostaticCoeff: number;
}

export interface ErosionOutput {
  hits: ErosionHit[];
  /** Updated carry-over accumulator (a new Map; the input is not mutated). */
  acc: Map<string, number>;
}

// Directions from a wet cell to a candidate face neighbor.
const DIRS = [
  { dc: 0, dr: -1 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: 1, dr: 0 },
];

/**
 * Projected-flux erosion. Each wet cell contributes to an adjacent erodible
 * (wall/tower) face: the velocity component pointing INTO the face is frontal
 * erosion, the orthogonal component sliding PAST it is shear (weighted far
 * lower). Charge accumulates per face across frames; once it crosses an integer
 * the whole part is emitted as discrete `hits` (consumed as wall HP / tower
 * hit-count) and the fraction carries over.
 *
 * Pure: terrain enters only through `isErodible`, and the accumulator is threaded
 * in and out rather than held as hidden state. The kernel produces ~0 inflow
 * velocity into a fully-blocking wall, so tall walls resist erosion while
 * overtopped walls take flow-proportional frontal erosion — matching the legacy
 * `surfaceLevel - elev >= 2` gate without re-checking depth here.
 */
export function computeErosionHits(input: ErosionInput): ErosionOutput {
  const { cells, isErodible, acc, frontalCoeff, shearCoeff, hydrostaticCoeff } = input;
  const charge = new Map<string, number>(acc);

  for (const cell of cells) {
    for (const { dc, dr } of DIRS) {
      const fc = cell.col + dc;
      const fr = cell.row + dr;
      if (!isErodible(fc, fr)) {
        continue;
      }
      // Component of this cell's velocity directed at the face (frontal) and the
      // orthogonal component sliding past it (shear).
      const frontal = Math.max(0, cell.velX * dc + cell.velY * dr);
      const shear = dc !== 0 ? Math.abs(cell.velY) : Math.abs(cell.velX);
      const hydrostatic = hydrostaticCoeff * Math.max(0, cell.depth);
      const add = frontalCoeff * frontal + shearCoeff * shear + hydrostatic;
      if (add <= 0) {
        continue;
      }
      const k = `${fc}:${fr}`;
      charge.set(k, (charge.get(k) ?? 0) + add);
    }
  }

  const hits: ErosionHit[] = [];
  for (const [k, value] of charge) {
    const whole = Math.floor(value);
    if (whole < 1) {
      continue;
    }
    const [col, row] = k.split(":").map(Number);
    hits.push({ col, row, hits: whole });
    charge.set(k, value - whole);
  }

  return { hits, acc: charge };
}
