import { FLOW_MIN_WATER } from './config';

export interface FlowCell {
  waterLevel: number;
  momentum: { dx: number; dy: number };
  pressure: number;
}

export function createFlowGrid(cols: number, rows: number): FlowCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      waterLevel: 0,
      momentum: { dx: 0, dy: 0 },
      pressure: 0,
    })),
  );
}

export type WallEvent = 'overtopped' | 'blocked' | null;

export interface InjectRowInput {
  grid: FlowCell[][];
  row: number;
  columnHeights: number[];
  elevations: number[][];
  terrainSlope: number;
  effectiveHoleDepths: number[][];
}

export interface InjectRowResult {
  puddleDelta: number[];
  wallEvents: WallEvent[];
  blocked: boolean[];
}

export function injectRow(input: InjectRowInput): InjectRowResult {
  const { grid, row, columnHeights, elevations, terrainSlope, effectiveHoleDepths } = input;
  const numCols = columnHeights.length;
  const puddleDelta: number[] = new Array(numCols).fill(0);
  const wallEvents: WallEvent[] = new Array(numCols).fill(null);
  const blocked: boolean[] = new Array(numCols).fill(false);

  for (let col = 0; col < numCols; col++) {
    let incoming = columnHeights[col];
    if (incoming <= 0) {
      continue;
    }

    const elev = terrainSlope + elevations[row][col];

    if (elev >= incoming) {
      blocked[col] = true;
      if (elevations[row][col] > 0) {
        wallEvents[col] = 'blocked';
      }
      continue;
    }

    if (elev > 0) {
      incoming -= elev;
      if (elevations[row][col] > 0) {
        wallEvents[col] = 'overtopped';
      }
    } else if (elev < 0) {
      const depth = effectiveHoleDepths[row][col];
      if (depth > 0) {
        const absorbed = Math.min(incoming, depth);
        puddleDelta[col] = absorbed;
        incoming -= absorbed;
      }
    }

    if (incoming >= FLOW_MIN_WATER) {
      grid[row][col].waterLevel = incoming;
      grid[row][col].momentum.dy = incoming;
      grid[row][col].momentum.dx = 0;
    }
  }

  return { puddleDelta, wallEvents, blocked };
}
