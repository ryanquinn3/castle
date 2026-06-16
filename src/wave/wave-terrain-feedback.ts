import type { WetCell } from "./wave-dynamic-system.ts";

export interface TerrainProbe {
  isCastle(col: number, row: number): boolean;
}

export interface TerrainFeedbackInput {
  cells: WetCell[];
  probe: TerrainProbe;
  /** Depth on a castle cell at or above which the castle is considered flooded. */
  floodDepth: number;
}

export interface TerrainFeedbackResult {
  cells: WetCell[];
  castleFlooded: boolean;
}

/**
 * Post-flux terrain feedback for the pressure field. Detects castle flooding
 * only; holes no longer absorb water mid-wave so water pools live in holes and
 * channels to the deepest pit. Pure: no Excalibur, no GridModel — terrain
 * enters only through the probe.
 */
export function applyTerrainFeedback(input: TerrainFeedbackInput): TerrainFeedbackResult {
  const { cells, probe, floodDepth } = input;
  let castleFlooded = false;
  for (const cell of cells) {
    if (probe.isCastle(cell.col, cell.row) && cell.depth >= floodDepth) {
      castleFlooded = true;
    }
  }
  return { cells, castleFlooded };
}
