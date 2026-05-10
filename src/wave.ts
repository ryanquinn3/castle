/**
 * Wave simulation — pure TypeScript, no Excalibur imports.
 *
 * Example: 5-col, 3-row grid, wave height 3
 *   elevations = [[0, 2, 0, 0, 0],   // row 0
 *                 [0, 0,-3, 0, 0],   // row 1
 *                 [0, 0, 0, 0, 0]]   // row 2
 *   castle at col=2, row=2
 *
 *   col 0: wave enters every row at height 3, no obstacles → passes through unchanged
 *   col 1: row 0 — wave 3 enters, hits wall h=2 → wave becomes 3-2=1; row 1 — wave 1,
 *           flat → unchanged; row 2 — wave 1, flat → unchanged
 *   col 2: row 0 — wave 3 enters, flat → unchanged; row 1 — wave 3 enters, hits hole
 *           d=3, depth >= wave height → wave fully absorbed, becomes 0; row 2 — wave 0,
 *           castle NOT flooded (wave was absorbed before reaching it)
 *   col 3, col 4: wave 3 passes all rows unchanged
 *
 *   waveHeightMap[2][2] = 0  →  castleFlooded = false
 *
 *   If instead elevations[1][2] = -1 (hole depth 1 < wave 3):
 *     col 2 wave after row 1 = 3-1 = 2, reaches castle in row 2 with height 2
 *     → castleFlooded = true
 */

import { WAVE_HEIGHT_START, WAVE_HEIGHT_INCREMENT, WAVE_REACH_START, WAVE_REACH_INCREMENT, GRID_HEIGHT, WAVES_BASE, WAVES_INCREMENT } from './config';

export interface WaveResult {
  /** waveHeightMap[row][col] = wave height entering that cell (before tile interaction).
   *  0 means the wave was already blocked or absorbed before reaching this cell. */
  waveHeightMap: number[][];
  castleFlooded: boolean;
}

/**
 * Simulate a wave of the given height advancing from row 0 downward through the grid.
 *
 * @param elevations - row-major 2D array: elevations[row][col], row 0 = top of screen.
 *   Positive values are raised walls; negative values are dug holes; 0 is flat.
 * @param columnHeights - per-column initial wave heights (replaces single waveHeight).
 * @param castleCol - column index of the castle tile.
 * @param castleRow - row index of the castle tile.
 * @param maxRows - simulation stops after this many rows (exclusive).
 */
/**
 * Returns per-column start-row offsets that create a U-shaped wave front.
 * Edge columns (0 and numCols-1) get offset 0 (start immediately).
 * The center gets offset uDepth (starts latest).
 * Formula: offset(col) = round(uDepth * (1 - ((col - center) / center)^2))
 * where center = (numCols - 1) / 2.
 * Result is clamped to [0, uDepth].
 */
export function generateColumnOffsets(numCols: number, uDepth: number): number[] {
  const center = (numCols - 1) / 2;
  return Array.from({ length: numCols }, (_, col) => {
    const offset = Math.round(uDepth * (1 - Math.pow((col - center) / center, 2)));
    return Math.max(0, Math.min(uDepth, offset));
  });
}

export function simulateWave(
  elevations: number[][],
  columnHeights: number[],
  castleCol: number,
  castleRow: number,
  maxRows: number,
  columnOffsets?: number[],
): WaveResult {
  const numRows = elevations.length;
  const numCols = numRows > 0 ? elevations[0].length : 0;

  // Each column tracks its own remaining wave height.
  const columnWaveHeights: number[] = columnHeights.length === numCols
    ? columnHeights.slice()
    : new Array(numCols).fill(0);

  // Output map: waveHeightMap[row][col] = height before tile interaction.
  // Allocated for all rows; unvisited rows remain 0.
  const waveHeightMap: number[][] = Array.from({ length: numRows }, () =>
    new Array(numCols).fill(0),
  );

  let castleFlooded = false;

  for (let row = 0; row < Math.min(numRows, maxRows); row++) {
    for (let col = 0; col < numCols; col++) {
      // If the wave hasn't reached this column yet (U-shape offset), skip interaction.
      if (columnOffsets && row < columnOffsets[col]) {
        waveHeightMap[row][col] = 0;
        continue;
      }

      // Record the wave height entering this cell, before any tile interaction.
      waveHeightMap[row][col] = columnWaveHeights[col];

      // If wave already blocked/absorbed, nothing to do.
      if (columnWaveHeights[col] === 0) continue;

      const elev = elevations[row][col];

      if (elev >= columnWaveHeights[col]) {
        // Wall at least as tall as the wave: fully blocked.
        columnWaveHeights[col] = 0;
      } else if (elev > 0) {
        // Partial wall: reduces wave height.
        columnWaveHeights[col] -= elev;
      } else if (elev < 0) {
        const depth = -elev;
        if (depth >= columnWaveHeights[col]) {
          // Hole deep enough to absorb the whole wave.
          columnWaveHeights[col] = 0;
        } else {
          // Partial absorption.
          columnWaveHeights[col] -= depth;
        }
      }
      // elev === 0: flat tile, wave passes unchanged.

      // Castle is flooded if the wave entered the castle cell with any height > 0.
      // We use waveHeightMap[row][col] (height before interaction) because the castle
      // tile cannot be dug or built on — its elevation is always 0.
      if (col === castleCol && row === castleRow && waveHeightMap[row][col] > 0) {
        castleFlooded = true;
      }
    }
  }

  return { waveHeightMap, castleFlooded };
}

/**
 * Returns the wave height for a given level number (1-indexed).
 * Level 1 → WAVE_HEIGHT_START; each subsequent level adds WAVE_HEIGHT_INCREMENT.
 */
export function waveHeightForLevel(level: number): number {
  return WAVE_HEIGHT_START + (level - 1) * WAVE_HEIGHT_INCREMENT;
}

/**
 * Generate per-column initial wave heights with random variation.
 *
 * Each column's height = baseHeight + rand, where rand is drawn uniformly
 * from [-variance, +variance] (continuous) and the result is clamped to
 * a minimum of 0. Results are NOT deterministic — call once per wave.
 *
 * @param baseHeight - base wave height for the level (from waveHeightForLevel)
 * @param variance   - maximum deviation above or below base (WAVE_HEIGHT_VARIANCE)
 * @param numCols    - number of columns (GRID_WIDTH)
 */
export function generateColumnHeights(
  baseHeight: number,
  variance: number,
  numCols: number,
): number[] {
  return Array.from({ length: numCols }, () =>
    Math.max(0, baseHeight + (Math.random() * 2 - 1) * variance),
  );
}

/**
 * Returns the number of rows the wave travels for a given level (1-indexed).
 * Clamped to GRID_HEIGHT so it never exceeds the grid.
 */
export function waveReachForLevel(level: number): number {
  return Math.min(GRID_HEIGHT, WAVE_REACH_START + (level - 1) * WAVE_REACH_INCREMENT);
}

/**
 * Returns the number of waves for a given level (1-indexed).
 * Level 1 → WAVES_BASE; each subsequent level adds WAVES_INCREMENT.
 */
export function wavesForLevel(level: number): number {
  return WAVES_BASE + (level - 1) * WAVES_INCREMENT;
}
