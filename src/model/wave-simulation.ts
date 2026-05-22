import { simulateAdvance, simulateRecede, type RowSolver } from './flow-field.ts';

export interface PoolInfo {
  members: { col: number; row: number }[];
}

export type WallErosionEvent = 'overtopped' | 'blocked' | null;

export function generateWaveCurve(
  numCols: number,
  peakHeight: number,
  valleyFraction: number,
  peakPhase: number,
  numPeaks: number,
): number[] {
  return Array.from({ length: numCols }, (_, col) => {
    const x = col / (numCols - 1) * numPeaks + peakPhase;
    const wFactor = Math.abs(Math.sin(Math.PI * x));
    return peakHeight * valleyFraction + (peakHeight - peakHeight * valleyFraction) * wFactor;
  });
}

export interface SimulateWaveInput {
  elevations: number[][];
  puddleDepths: number[][];
  columnHeights: number[];
  castleCol: number;
  castleRow: number;
  maxRows: number;
  terrainSlope: number;
  poolMap: Map<string, PoolInfo>;
  rowSolver?: RowSolver;
}

export interface WaveResult {
  advanceHeightMap: number[][];
  recedeHeightMap: number[][];
  advanceFrames: number[][][];
  recedeFrames: number[][][];
  puddleDelta: number[][];
  wallErosionEvents: WallErosionEvent[][];
  castleFlooded: boolean;
}

export function simulateWave(input: SimulateWaveInput): WaveResult {
  const { elevations, puddleDepths, columnHeights, castleCol, castleRow, terrainSlope } = input;
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
    terrainSlope,
    effectiveHoleDepths,
    castleCol,
    castleRow,
    rowSolver: input.rowSolver,
  });

  const effectiveAfterAdvance = effectiveHoleDepths.map((row, r) =>
    row.map((d, c) => Math.max(0, d - advance.puddleDelta[r][c])),
  );

  const recede = simulateRecede({
    elevations,
    advanceWaterMap: advance.maxWaterMap,
    terrainSlope,
    effectiveHoleDepths: effectiveAfterAdvance,
    castleCol,
    castleRow,
    rowSolver: input.rowSolver,
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
    wallErosionEvents: advance.wallEvents,
    castleFlooded: advance.castleFlooded || recede.castleFlooded,
  };
}
