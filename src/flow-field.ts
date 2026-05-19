import {
  FLOW_MIN_WATER,
  FLOW_RATE,
  MOMENTUM_DECAY,
  MOMENTUM_REDIRECT_FACTOR,
  PRESSURE_BUILDUP_RATE,
  PRESSURE_OVERTOP_FACTOR,
} from './config';

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

export interface EqualizeInput {
  grid: FlowCell[][];
  elevations: number[][];
  terrainSlope: number;
  effectiveHoleDepths: number[][];
}

export interface EqualizeResult {
  puddleDelta: number[][];
}

const DIRS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

export function equalizeStep(input: EqualizeInput): EqualizeResult {
  const { grid, elevations, terrainSlope, effectiveHoleDepths } = input;
  const rows = grid.length;
  const cols = grid[0].length;
  const puddleDelta: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  // Read phase: compute outflows for each cell
  const outflows: number[][][][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => DIRS.map(() => 0)),
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.waterLevel < FLOW_MIN_WATER) {
        continue;
      }
      const surfaceHere = terrainSlope + elevations[r][c] + cell.waterLevel;

      for (let d = 0; d < DIRS.length; d++) {
        const { dr, dc } = DIRS[d];
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
          continue;
        }

        const neighborRawElev = terrainSlope + elevations[nr][nc];
        if (neighborRawElev >= surfaceHere) {
          continue;
        }

        const neighborSurface = neighborRawElev + grid[nr][nc].waterLevel;
        const surfaceDiff = surfaceHere - neighborSurface;
        if (surfaceDiff <= 0) {
          continue;
        }

        let flow = surfaceDiff * FLOW_RATE;

        // Momentum bias: flow more in the direction of momentum
        const alignment = cell.momentum.dx * dc + cell.momentum.dy * dr;
        if (alignment > 0) {
          flow += alignment * 0.1;
        }

        // Cap at 1/4 of cell's water per direction
        flow = Math.min(flow, cell.waterLevel / 4);

        outflows[r][c][d] = flow;
      }
    }
  }

  // Write phase: apply outflows and transfer momentum
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (let d = 0; d < DIRS.length; d++) {
        const flow = outflows[r][c][d];
        if (flow <= 0) {
          continue;
        }
        const nr = r + DIRS[d].dr;
        const nc = c + DIRS[d].dc;
        const src = grid[r][c];
        const dst = grid[nr][nc];

        src.waterLevel -= flow;

        // Momentum transfer: weighted average
        const dstWater = dst.waterLevel;
        const totalWeight = dstWater + flow;

        // Check if destination is a hole with remaining capacity
        const holeCapacity = effectiveHoleDepths[nr][nc];
        if (holeCapacity > 0) {
          const absorbed = Math.min(flow, holeCapacity);
          puddleDelta[nr][nc] += absorbed;
          effectiveHoleDepths[nr][nc] -= absorbed;
          const remainder = flow - absorbed;
          if (remainder > 0) {
            dst.waterLevel += remainder;
          }
        } else {
          dst.waterLevel += flow;
        }

        // Mix momentum: B's new = weighted avg of B's existing + A's momentum
        if (totalWeight > 0) {
          dst.momentum.dx = (dst.momentum.dx * dstWater + src.momentum.dx * flow) / totalWeight;
          dst.momentum.dy = (dst.momentum.dy * dstWater + src.momentum.dy * flow) / totalWeight;
        }
      }
    }
  }

  // Wall redirect: if momentum points toward a wall, redirect to perpendicular
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.waterLevel < FLOW_MIN_WATER) {
        continue;
      }
      const surfaceHere = terrainSlope + elevations[r][c] + cell.waterLevel;

      // Check dy direction
      if (cell.momentum.dy !== 0) {
        const wallRow = r + Math.sign(cell.momentum.dy);
        if (wallRow < 0 || wallRow >= rows ||
            terrainSlope + elevations[wallRow][c] >= surfaceHere) {
          const blocked = Math.abs(cell.momentum.dy);
          cell.momentum.dx += blocked * MOMENTUM_REDIRECT_FACTOR * 0.5;
          cell.momentum.dy = 0;
        }
      }

      // Check dx direction
      if (cell.momentum.dx !== 0) {
        const wallCol = c + Math.sign(cell.momentum.dx);
        if (wallCol < 0 || wallCol >= cols ||
            terrainSlope + elevations[r][wallCol] >= surfaceHere) {
          const blocked = Math.abs(cell.momentum.dx);
          cell.momentum.dy += blocked * MOMENTUM_REDIRECT_FACTOR * 0.5;
          cell.momentum.dx = 0;
        }
      }
    }
  }

  // Decay momentum and cleanup
  for (const row of grid) {
    for (const cell of row) {
      if (cell.waterLevel < FLOW_MIN_WATER) {
        cell.waterLevel = 0;
        cell.momentum.dx = 0;
        cell.momentum.dy = 0;
      } else {
        cell.momentum.dx *= MOMENTUM_DECAY;
        cell.momentum.dy *= MOMENTUM_DECAY;
      }
    }
  }

  return { puddleDelta };
}
