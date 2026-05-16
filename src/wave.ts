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

import { WAVE_HEIGHT_START, WAVE_HEIGHT_INCREMENT, WAVES_BASE, WAVES_INCREMENT, WAVE_SPREAD_FACTOR } from './config';

export type WallErosionEvent = 'overtopped' | 'blocked' | null;

export interface AdvanceInput {
  elevations: number[][];
  columnHeights: number[];
  castleCol: number;
  castleRow: number;
  maxRows: number;
  terrainSlope: number;
  /** Pre-computed effective hole depth (raw depth minus existing puddle) per tile. */
  effectiveHoleDepths: number[][];
}

export interface AdvanceResult {
  /** Wave height entering each cell before tile interaction. */
  waveHeightMap: number[][];
  /** Water bounced back upstream by a fully-blocking wall, indexed by [row][col]. */
  bounceBack: number[][];
  /** Per-column water still flowing at the deepest row the wave reached. */
  survivedAtMaxRow: number[];
  /** Water absorbed into holes this pass; will be added to puddleDepth post-wave. */
  puddleDelta: number[][];
  /** Wall interaction per tile this pass. */
  wallErosionEvents: WallErosionEvent[][];
  castleFlooded: boolean;
}

/**
 * Generate a multi-peaked per-column height curve.
 * numPeaks controls how many peaks appear across the grid (1, 2, or 3).
 * peakPhase shifts peak positions slightly (±0.2 range) for per-wave variation.
 * valleyFraction: valley height as a fraction of peakHeight (0–1).
 */
export function generateWaveCurve(
  numCols: number,
  peakHeight: number,
  valleyFraction: number,
  peakPhase: number,
  numPeaks: number,
): number[] {
  return Array.from({ length: numCols }, (_, col) => {
    const x = col / (numCols - 1) * numPeaks + peakPhase;
    const wFactor = Math.abs(Math.sin(Math.PI * x)); // 0 at center/edges, 1 at peaks
    return peakHeight * valleyFraction + (peakHeight - peakHeight * valleyFraction) * wFactor;
  });
}

export function simulateAdvance(input: AdvanceInput): AdvanceResult {
  const { elevations, columnHeights, castleCol, castleRow, maxRows, terrainSlope, effectiveHoleDepths } = input;
  const numRows = elevations.length;
  const numCols = numRows > 0 ? elevations[0].length : 0;

  const columnWaveHeights: number[] = columnHeights.length === numCols
    ? columnHeights.slice()
    : new Array(numCols).fill(0);

  const waveHeightMap: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const bounceBack: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const puddleDelta: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const wallErosionEvents: WallErosionEvent[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(null));
  const survivedAtMaxRow: number[] = new Array(numCols).fill(0);

  let castleFlooded = false;

  const rowsToRun = Math.min(numRows, maxRows);
  for (let row = 0; row < rowsToRun; row++) {
    for (let col = 0; col < numCols; col++) {
      waveHeightMap[row][col] = columnWaveHeights[col];
      if (columnWaveHeights[col] === 0) {
        continue;
      }

      const elev = terrainSlope + elevations[row][col];

      if (elev >= columnWaveHeights[col]) {
        // Fully blocked: water bounces back upstream as recede flow.
        bounceBack[row][col] = columnWaveHeights[col];
        if (elevations[row][col] > 0) {
          wallErosionEvents[row][col] = 'blocked';
        }
        columnWaveHeights[col] = 0;
      } else if (elev > 0) {
        // Overtopped: wall reduces wave height.
        columnWaveHeights[col] -= elev;
        if (elevations[row][col] > 0) {
          wallErosionEvents[row][col] = 'overtopped';
        }
      } else if (elev < 0) {
        const effDepth = effectiveHoleDepths[row][col];
        if (effDepth <= 0) {
          // Hole saturated by existing puddle — water passes over as if flat.
        } else if (effDepth >= columnWaveHeights[col]) {
          puddleDelta[row][col] = columnWaveHeights[col];
          columnWaveHeights[col] = 0;
        } else {
          puddleDelta[row][col] = effDepth;
          columnWaveHeights[col] -= effDepth;
        }
      }

      if (col === castleCol && row === castleRow && waveHeightMap[row][col] > 0) {
        castleFlooded = true;
      }
    }

    // Lateral spread (unchanged from existing logic).
    const spread = columnWaveHeights.slice();
    for (let col = 0; col < numCols; col++) {
      const h = columnWaveHeights[col];
      if (h <= 0) {
        continue;
      }
      for (const n of [col - 1, col + 1]) {
        if (n < 0 || n >= numCols) {
          continue;
        }
        if (columnWaveHeights[n] < h) {
          const spreadAmount = h * WAVE_SPREAD_FACTOR;
          const nElev = terrainSlope + elevations[row][n];
          if (nElev >= spreadAmount) {
            continue;
          }
          spread[n] = Math.max(spread[n], spreadAmount);
        }
      }
    }
    for (let col = 0; col < numCols; col++) {
      columnWaveHeights[col] = spread[col];
    }
  }

  // Capture survivedAtMaxRow as the column heights after the final row's processing.
  for (let col = 0; col < numCols; col++) {
    survivedAtMaxRow[col] = columnWaveHeights[col];
  }

  return { waveHeightMap, bounceBack, survivedAtMaxRow, puddleDelta, wallErosionEvents, castleFlooded };
}

export interface RecedeInput {
  elevations: number[][];
  survivedAtMaxRow: number[];
  bounceBack: number[][];
  castleCol: number;
  castleRow: number;
  maxRows: number;
  terrainSlope: number;
  effectiveHoleDepths: number[][];
}

export interface RecedeResult {
  /** Wave height passing through each cell during the recede pass. */
  recedeHeightMap: number[][];
  /** Additional puddle deltas accrued during recede (lateral flow into holes). */
  puddleDelta: number[][];
  castleFloodedOnRecede: boolean;
}

export function simulateRecede(input: RecedeInput): RecedeResult {
  const { elevations, survivedAtMaxRow, bounceBack, castleCol, castleRow, maxRows, terrainSlope, effectiveHoleDepths } = input;
  const numRows = elevations.length;
  const numCols = numRows > 0 ? elevations[0].length : 0;

  const columnWaveHeights: number[] = survivedAtMaxRow.slice();
  const recedeHeightMap: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const puddleDelta: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  // Local mutable copy so we can decrement remaining hole capacity as recede water absorbs.
  const effectiveLocal: number[][] = effectiveHoleDepths.map(row => row.slice());

  let castleFloodedOnRecede = false;
  const startRow = Math.min(numRows, maxRows) - 1;

  for (let row = startRow; row >= 0; row--) {
    for (let col = 0; col < numCols; col++) {
      recedeHeightMap[row][col] = columnWaveHeights[col];
      if (columnWaveHeights[col] === 0) {
        // Still inject bounceBack below.
      } else {
        const elev = terrainSlope + elevations[row][col];

        if (elev >= columnWaveHeights[col]) {
          // Wall blocks recede — water is dropped (no second bounce, by design).
          columnWaveHeights[col] = 0;
        } else if (elev > 0) {
          columnWaveHeights[col] -= elev;
        } else if (elev < 0) {
          const effDepth = effectiveLocal[row][col];
          if (effDepth <= 0) {
            // Saturated hole — recede flows over puddle.
          } else if (effDepth >= columnWaveHeights[col]) {
            puddleDelta[row][col] += columnWaveHeights[col];
            effectiveLocal[row][col] -= columnWaveHeights[col];
            columnWaveHeights[col] = 0;
          } else {
            puddleDelta[row][col] += effDepth;
            columnWaveHeights[col] -= effDepth;
            effectiveLocal[row][col] = 0;
          }
        }
      }

      if (col === castleCol && row === castleRow && recedeHeightMap[row][col] > 0) {
        castleFloodedOnRecede = true;
      }
    }

    // Inject water that bounced back from a wall at this row during advance.
    // Bounce-back water is conceptually already upstream of the wall, so it
    // is added after the wall row's tile processing and carries to row-1.
    for (let col = 0; col < numCols; col++) {
      columnWaveHeights[col] += bounceBack[row][col];
    }

    // Lateral spread, same model as advance.
    const spread = columnWaveHeights.slice();
    for (let col = 0; col < numCols; col++) {
      const h = columnWaveHeights[col];
      if (h <= 0) {
        continue;
      }
      for (const n of [col - 1, col + 1]) {
        if (n < 0 || n >= numCols) {
          continue;
        }
        if (columnWaveHeights[n] < h) {
          const spreadAmount = h * WAVE_SPREAD_FACTOR;
          const nElev = terrainSlope + elevations[row][n];
          if (nElev >= spreadAmount) {
            continue;
          }
          spread[n] = Math.max(spread[n], spreadAmount);
        }
      }
    }
    for (let col = 0; col < numCols; col++) {
      columnWaveHeights[col] = spread[col];
    }
  }

  return { recedeHeightMap, puddleDelta, castleFloodedOnRecede };
}

export interface SimulateWaveInput {
  elevations: number[][];
  /** Current puddleDepth on each tile, used to derive effective hole depth. */
  puddleDepths: number[][];
  columnHeights: number[];
  castleCol: number;
  castleRow: number;
  maxRows: number;
  terrainSlope: number;
}

export interface WaveResult {
  advanceHeightMap: number[][];
  recedeHeightMap: number[][];
  /** Combined puddle deltas from both passes; apply to grid post-wave. */
  puddleDelta: number[][];
  wallErosionEvents: WallErosionEvent[][];
  castleFlooded: boolean;
}

export function simulateWave(input: SimulateWaveInput): WaveResult {
  const { elevations, puddleDepths, columnHeights, castleCol, castleRow, maxRows, terrainSlope } = input;
  const numRows = elevations.length;
  const numCols = numRows > 0 ? elevations[0].length : 0;

  const effectiveHoleDepths: number[][] = Array.from({ length: numRows }, (_, r) =>
    Array.from({ length: numCols }, (_, c) => {
      const e = elevations[r][c];
      if (e >= 0) {
        return 0;
      }
      return Math.max(0, (-e) - puddleDepths[r][c]);
    }),
  );

  const advance = simulateAdvance({
    elevations,
    columnHeights,
    castleCol,
    castleRow,
    maxRows,
    terrainSlope,
    effectiveHoleDepths,
  });

  // Subtract advance puddle deltas from effective hole depths before recede.
  const effectiveAfterAdvance = effectiveHoleDepths.map((row, r) =>
    row.map((d, c) => Math.max(0, d - advance.puddleDelta[r][c])),
  );

  const recede = simulateRecede({
    elevations,
    survivedAtMaxRow: advance.survivedAtMaxRow,
    bounceBack: advance.bounceBack,
    castleCol,
    castleRow,
    maxRows,
    terrainSlope,
    effectiveHoleDepths: effectiveAfterAdvance,
  });

  const puddleDelta: number[][] = advance.puddleDelta.map((row, r) =>
    row.map((v, c) => v + recede.puddleDelta[r][c]),
  );

  return {
    advanceHeightMap: advance.waveHeightMap,
    recedeHeightMap: recede.recedeHeightMap,
    puddleDelta,
    wallErosionEvents: advance.wallErosionEvents,
    castleFlooded: advance.castleFlooded || recede.castleFloodedOnRecede,
  };
}

/**
 * Returns the wave height for a given level number (1-indexed).
 * Level 1 → WAVE_HEIGHT_START; each subsequent level adds WAVE_HEIGHT_INCREMENT.
 */
export function waveHeightForLevel(level: number): number {
  return WAVE_HEIGHT_START + (level - 1) * WAVE_HEIGHT_INCREMENT;
}

/**
 * Returns the number of waves for a given level (1-indexed).
 * Level 1 → WAVES_BASE; each subsequent level adds WAVES_INCREMENT.
 */
export function wavesForLevel(level: number): number {
  return WAVES_BASE + (level - 1) * WAVES_INCREMENT;
}
