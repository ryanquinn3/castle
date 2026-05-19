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
import { simulateFlowAdvance, simulateFlowRecede } from './flow-field';

export interface PoolInfo {
  members: { col: number; row: number }[];
}

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
  poolMap: Map<string, PoolInfo>;
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

function redistributePoolWater(
  pool: PoolInfo,
  currentRow: number,
  puddleDelta: number[][],
  effDepths: number[][],
  elevations: number[][],
  flowRow: number,
  numRows: number,
): void {
  const members: { col: number; row: number }[] = [];
  for (const m of pool.members) {
    if (m.row === currentRow) {
      members.push(m);
    } else if (m.row === flowRow && flowRow >= 0 && flowRow < numRows) {
      members.push(m);
    }
  }

  if (members.length <= 1) { return; }

  let totalWater = 0;
  for (const m of members) {
    totalWater += puddleDelta[m.row][m.col];
  }
  if (totalWater <= 0) { return; }

  for (const m of members) {
    effDepths[m.row][m.col] += puddleDelta[m.row][m.col];
    puddleDelta[m.row][m.col] = 0;
  }

  const cells = members.map(m => ({
    col: m.col,
    row: m.row,
    elevation: elevations[m.row][m.col],
    capacity: effDepths[m.row][m.col],
    filled: 0,
  }));
  cells.sort((a, b) => a.elevation - b.elevation);

  let remaining = totalWater;
  for (let i = 0; i < cells.length && remaining > 0; i++) {
    const nextElev = i + 1 < cells.length ? cells[i + 1].elevation : 0;
    const bandDepth = nextElev - cells[i].elevation;
    if (bandDepth <= 0) { continue; }

    const groupSize = i + 1;
    const needed = bandDepth * groupSize;

    if (remaining >= needed) {
      remaining -= needed;
      for (let j = 0; j <= i; j++) {
        cells[j].filled += bandDepth;
      }
    } else {
      const perCell = remaining / groupSize;
      for (let j = 0; j <= i; j++) {
        cells[j].filled += perCell;
      }
      remaining = 0;
    }
  }

  if (remaining > 0) {
    const perCell = remaining / cells.length;
    for (const c of cells) {
      c.filled += perCell;
    }
  }

  for (const c of cells) {
    const delta = Math.min(c.filled, c.capacity);
    puddleDelta[c.row][c.col] = delta;
    effDepths[c.row][c.col] -= delta;
  }
}

export function simulateAdvance(input: AdvanceInput): AdvanceResult {
  const { elevations, columnHeights, castleCol, castleRow, maxRows, terrainSlope, effectiveHoleDepths, poolMap } = input;
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
  const effDepths = effectiveHoleDepths.map(row => row.slice());

  let castleFlooded = false;
  const wallBlocked = new Array(numCols).fill(false);

  const rowsToRun = Math.min(numRows, maxRows);
  for (let row = 0; row < rowsToRun; row++) {
    for (let col = 0; col < numCols; col++) {
      waveHeightMap[row][col] = columnWaveHeights[col];
      if (columnWaveHeights[col] === 0) {
        continue;
      }

      const elev = terrainSlope + elevations[row][col];

      if (elev >= columnWaveHeights[col]) {
        bounceBack[row][col] = columnWaveHeights[col];
        if (elevations[row][col] > 0) {
          wallErosionEvents[row][col] = 'blocked';
          wallBlocked[col] = true;
        }
        columnWaveHeights[col] = 0;
      } else if (elev > 0) {
        columnWaveHeights[col] -= elev;
        if (elevations[row][col] > 0) {
          wallErosionEvents[row][col] = 'overtopped';
        }
      } else if (elev < 0) {
        const depth = effDepths[row][col];
        if (depth <= 0) {
          // Hole saturated -- water passes over.
        } else if (depth >= columnWaveHeights[col]) {
          puddleDelta[row][col] = columnWaveHeights[col];
          columnWaveHeights[col] = 0;
        } else {
          puddleDelta[row][col] = depth;
          columnWaveHeights[col] -= depth;
        }
      }

      if (col === castleCol && row === castleRow && waveHeightMap[row][col] > 0) {
        castleFlooded = true;
      }
    }

    // Redistribute absorbed water within pools (same row + one row down)
    const poolsSeen = new Set<PoolInfo>();
    for (let col = 0; col < numCols; col++) {
      if (puddleDelta[row][col] <= 0) { continue; }
      const pool = poolMap.get(`${col}:${row}`);
      if (!pool || poolsSeen.has(pool)) { continue; }
      poolsSeen.add(pool);
      redistributePoolWater(pool, row, puddleDelta, effDepths, elevations, row + 1, numRows);
    }

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
        if (wallBlocked[n]) {
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
  poolMap: Map<string, PoolInfo>;
}

export interface RecedeResult {
  /** Wave height passing through each cell during the recede pass. */
  recedeHeightMap: number[][];
  /** Additional puddle deltas accrued during recede (lateral flow into holes). */
  puddleDelta: number[][];
  castleFloodedOnRecede: boolean;
}

export function simulateRecede(input: RecedeInput): RecedeResult {
  const { elevations, survivedAtMaxRow, bounceBack, castleCol, castleRow, maxRows, terrainSlope, effectiveHoleDepths, poolMap } = input;
  const numRows = elevations.length;
  const numCols = numRows > 0 ? elevations[0].length : 0;

  const columnWaveHeights: number[] = survivedAtMaxRow.slice();
  const recedeHeightMap: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const puddleDelta: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));
  const effectiveLocal: number[][] = effectiveHoleDepths.map(row => row.slice());

  let castleFloodedOnRecede = false;
  const wallBlocked = new Array(numCols).fill(false);
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      if (bounceBack[row][col] > 0 && elevations[row][col] > 0) {
        wallBlocked[col] = true;
      }
    }
  }
  const startRow = Math.min(numRows, maxRows) - 1;

  for (let row = startRow; row >= 0; row--) {
    for (let col = 0; col < numCols; col++) {
      recedeHeightMap[row][col] = columnWaveHeights[col];
      if (columnWaveHeights[col] === 0) {
        // Still inject bounceBack below.
      } else {
        const elev = terrainSlope + elevations[row][col];

        if (elev >= columnWaveHeights[col]) {
          if (elevations[row][col] > 0) {
            wallBlocked[col] = true;
          }
          columnWaveHeights[col] = 0;
        } else if (elev > 0) {
          columnWaveHeights[col] -= elev;
        } else if (elev < 0) {
          const depth = effectiveLocal[row][col];
          if (depth <= 0) {
            // Saturated -- recede flows over.
          } else if (depth >= columnWaveHeights[col]) {
            puddleDelta[row][col] += columnWaveHeights[col];
            effectiveLocal[row][col] -= columnWaveHeights[col];
            columnWaveHeights[col] = 0;
          } else {
            puddleDelta[row][col] += depth;
            columnWaveHeights[col] -= depth;
            effectiveLocal[row][col] = 0;
          }
        }
      }

      if (col === castleCol && row === castleRow && recedeHeightMap[row][col] > 0) {
        castleFloodedOnRecede = true;
      }
    }

    // Redistribute absorbed water within pools (same row + one row up for recede)
    const poolsSeen = new Set<PoolInfo>();
    for (let col = 0; col < numCols; col++) {
      if (puddleDelta[row][col] <= 0) { continue; }
      const pool = poolMap.get(`${col}:${row}`);
      if (!pool || poolsSeen.has(pool)) { continue; }
      poolsSeen.add(pool);
      redistributePoolWater(pool, row, puddleDelta, effectiveLocal, elevations, row - 1, numRows);
    }

    for (let col = 0; col < numCols; col++) {
      columnWaveHeights[col] += bounceBack[row][col];
    }

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
        if (wallBlocked[n]) {
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
  poolMap: Map<string, PoolInfo>;
}

export interface WaveResult {
  advanceHeightMap: number[][];
  recedeHeightMap: number[][];
  advanceFrames: number[][][];
  recedeFrames: number[][][];
  /** Combined puddle deltas from both passes; apply to grid post-wave. */
  puddleDelta: number[][];
  wallErosionEvents: WallErosionEvent[][];
  castleFlooded: boolean;
}

export function simulateWave(input: SimulateWaveInput): WaveResult {
  const { elevations, puddleDepths, columnHeights, castleCol, castleRow, terrainSlope, poolMap } = input;
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

  const advance = simulateFlowAdvance({
    elevations,
    columnHeights,
    terrainSlope,
    effectiveHoleDepths,
    poolMap,
    castleCol,
    castleRow,
  });

  const effectiveAfterAdvance = effectiveHoleDepths.map((row, r) =>
    row.map((d, c) => Math.max(0, d - advance.puddleDelta[r][c])),
  );

  const recede = simulateFlowRecede({
    elevations,
    advanceGrid: advance.grid,
    terrainSlope,
    effectiveHoleDepths: effectiveAfterAdvance,
    poolMap,
    castleCol,
    castleRow,
  });

  const puddleDelta: number[][] = advance.puddleDelta.map((row, r) =>
    row.map((v, c) => v + recede.puddleDelta[r][c]),
  );

  return {
    advanceHeightMap: advance.maxWaterMap,
    recedeHeightMap: recede.maxWaterMap,
    advanceFrames: advance.snapshots,
    recedeFrames: recede.snapshots,
    puddleDelta,
    wallErosionEvents: advance.wallErosionEvents,
    castleFlooded: advance.castleFlooded || recede.castleFlooded,
  };
}

export function waveHeightForLevel(level: number): number {
  const heightBumps = Math.floor(level / 2);
  return WAVE_HEIGHT_START + heightBumps * WAVE_HEIGHT_INCREMENT;
}

export function wavesForLevel(level: number): number {
  const waveBumps = Math.floor((level - 1) / 2);
  return WAVES_BASE + waveBumps * WAVES_INCREMENT;
}
