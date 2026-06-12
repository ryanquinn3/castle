/**
 * Mixed module: contains both live and deprecated exports.
 *
 * STILL IN USE (do NOT remove):
 * - `generateWaveCurve` — imported by `src/wave/wave-spawner.ts`.
 * - `WallErosionEvent` — imported by `src/model/grid-model.ts` and
 *   `src/view/wave-renderer.ts`.
 *
 * @deprecated (partial)
 * `simulateWave`, `SimulateWaveInput`, and `WaveResult` are the legacy
 * deterministic wave orchestration layer. They delegate to the dead
 * `flow-field.ts` solver and are not used by the live game. Scheduled for
 * removal in the same follow-up change that removes `flow-field.ts`. Do not
 * extend or maintain them.
 */
import { simulateAdvance, simulateRecede, type RowSolver } from './flow-field.ts';
import type { Terrain } from './terrain/terrain.ts';
import { Hole } from './terrain/hole.ts';

interface PoolInfo {
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

/** @deprecated Part of the dead deterministic wave path. See module-level note. */
export interface SimulateWaveInput {
  cells: Terrain[][];
  columnHeights: number[];
  castleCol: number;
  castleRow: number;
  castleWidth: number;
  castleHeight: number;
  maxRows: number;
  terrainSlope: number;
  poolMap: Map<string, PoolInfo>;
  rowSolver?: RowSolver;
}

/** @deprecated Part of the dead deterministic wave path. See module-level note. */
export interface WaveResult {
  advanceHeightMap: number[][];
  recedeHeightMap: number[][];
  advanceFrames: number[][][];
  recedeFrames: number[][][];
  puddleDelta: number[][];
  wallErosionEvents: WallErosionEvent[][];
  castleFlooded: boolean;
}

/** @deprecated Part of the dead deterministic wave path. See module-level note. */
export function simulateWave(input: SimulateWaveInput): WaveResult {
  const { cells, columnHeights, castleCol, castleRow, castleWidth, castleHeight, terrainSlope } = input;

  const elevations = cells.map(row => row.map(cell => cell.elevation));
  const effectiveHoleDepths: number[][] = cells.map(row =>
    row.map(cell => (cell instanceof Hole ? cell.effectiveDepth : 0)),
  );

  const advance = simulateAdvance({
    elevations,
    columnHeights,
    terrainSlope,
    effectiveHoleDepths,
    castleCol,
    castleRow,
    castleWidth,
    castleHeight,
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
    castleWidth,
    castleHeight,
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
    wallErosionEvents: advance.wallEvents.map((row, r) =>
      row.map((event, c) => event ?? recede.wallEvents[r][c]),
    ),
    castleFlooded: advance.castleFlooded || recede.castleFlooded,
  };
}
