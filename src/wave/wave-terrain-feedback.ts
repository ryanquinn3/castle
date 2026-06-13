import type { WetCell } from "./wave-dynamic-system.ts";

/** Grid lookups the terrain feedback needs, decoupled from GridModel for testability. */
export interface TerrainProbe {
  isCastle(col: number, row: number): boolean;
  /** Remaining hole capacity at this cell (effective hole depth); 0 for non-holes and full holes. */
  remainingHoleCapacity(col: number, row: number): number;
}

export interface TerrainFeedbackInput {
  cells: WetCell[];
  probe: TerrainProbe;
  /** Depth on a castle cell at or above which the castle is considered flooded. */
  floodDepth: number;
  /** Cells whose depth falls to/below this after absorption are dropped. */
  drainThreshold: number;
}

export interface TerrainFeedbackResult {
  cells: WetCell[];
  absorbed: { col: number; row: number; amount: number }[];
  castleFlooded: boolean;
}

/**
 * Post-flux terrain feedback for the pressure field. Holes absorb the water
 * resting in them up to their remaining capacity (committed to puddleDepth by the
 * caller via WaveEventApplier) and that water leaves the live field, which both
 * accumulates the puddle and lets the wave terminate (water below a hole rim can
 * never drain north). A castle cell wet at or above floodDepth flags a flood.
 * Pure: no Excalibur, no GridModel — terrain enters only through the probe.
 */
export function applyTerrainFeedback(input: TerrainFeedbackInput): TerrainFeedbackResult {
  const { cells, probe, floodDepth, drainThreshold } = input;
  const absorbed: { col: number; row: number; amount: number }[] = [];
  const next: WetCell[] = [];
  let castleFlooded = false;

  for (const cell of cells) {
    if (probe.isCastle(cell.col, cell.row) && cell.depth >= floodDepth) {
      castleFlooded = true;
    }

    const capacity = probe.remainingHoleCapacity(cell.col, cell.row);
    if (capacity <= 0) {
      next.push(cell);
      continue;
    }

    const amount = Math.min(cell.depth, capacity);
    absorbed.push({ col: cell.col, row: cell.row, amount });
    const remaining = cell.depth - amount;
    if (remaining > drainThreshold) {
      next.push({ ...cell, depth: remaining });
    }
  }

  return { cells: next, absorbed, castleFlooded };
}
