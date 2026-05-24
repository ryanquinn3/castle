import { SETTLE_STEPS } from '../config.ts';

export type WallEvent = 'overtopped' | 'blocked' | null;

export interface RowSettleInput {
  rowWater: number[];
  elevations: number[];
  holeDepths: number[];
  terrainSlope: number;
  blocked?: boolean[];
  blockedWater?: number[];
}

export interface RowSettleResult {
  waterLevels: number[];
  absorbed: number[];
}

export interface RowSolver {
  settle(input: RowSettleInput): RowSettleResult;
}

export class LegacyRowSolver implements RowSolver {
  spreadFactor: number;
  spreadThreshold: number;

  constructor(spreadFactor: number, spreadThreshold: number) {
    this.spreadFactor = spreadFactor;
    this.spreadThreshold = spreadThreshold;
  }

  settle(input: RowSettleInput): RowSettleResult {
    const { rowWater, elevations, blocked = [], blockedWater = [] } = input;
    const waterLevels = rowWater.slice();
    const absorbed = new Array(waterLevels.length).fill(0);
    const numCols = waterLevels.length;

    for (let col = 0; col < numCols; col++) {
      if (!blocked[col] || (blockedWater[col] ?? 0) <= 0) {
        continue;
      }

      const neighbors: number[] = [];
      if (col > 0 && !blocked[col - 1] && elevations[col - 1] <= 0) {
        neighbors.push(col - 1);
      }
      if (col < numCols - 1 && !blocked[col + 1] && elevations[col + 1] <= 0) {
        neighbors.push(col + 1);
      }

      if (neighbors.length === 0) {
        continue;
      }

      const share = blockedWater[col] / neighbors.length;
      for (const n of neighbors) {
        waterLevels[n] += share;
      }
    }

    if (this.spreadFactor > 0) {
      for (let col = 0; col < numCols - 1; col++) {
        const diff = waterLevels[col] - waterLevels[col + 1];
        if (Math.abs(diff) > this.spreadThreshold) {
          const transfer = (diff - Math.sign(diff) * this.spreadThreshold) * this.spreadFactor;
          waterLevels[col] -= transfer;
          waterLevels[col + 1] += transfer;
        }
      }
    }

    return { waterLevels, absorbed };
  }
}

export class EqualizingRowSolver implements RowSolver {
  settleSteps: number;

  constructor(settleSteps: number) {
    this.settleSteps = settleSteps;
  }

  settle(input: RowSettleInput): RowSettleResult {
    const { rowWater, elevations, holeDepths, terrainSlope, blocked = [], blockedWater = [] } = input;
    const waterLevels = rowWater.slice();
    const absorbed = new Array(waterLevels.length).fill(0);
    const numCols = waterLevels.length;

    for (let col = 0; col < numCols; col++) {
      if ((blockedWater[col] ?? 0) <= 0) {
        continue;
      }

      const neighbors: number[] = [];
      if (col > 0 && !blocked[col - 1] && elevations[col - 1] <= 0 && rowWater[col - 1] > 0) {
        neighbors.push(col - 1);
      }
      if (col < numCols - 1 && !blocked[col + 1] && elevations[col + 1] <= 0 && rowWater[col + 1] > 0) {
        neighbors.push(col + 1);
      }

      if (neighbors.length === 0) {
        continue;
      }

      const share = blockedWater[col] / neighbors.length;
      for (const n of neighbors) {
        waterLevels[n] += share;
      }
    }

    for (let step = 0; step < this.settleSteps; step++) {
      let transferred = false;

      for (let col = 0; col < numCols - 1; col++) {
        if ((elevations[col] > 0 && rowWater[col] === 0) ||
            (elevations[col + 1] > 0 && rowWater[col + 1] === 0)) {
          continue;
        }

        const surfaceLeft = Math.max(0, terrainSlope + elevations[col]) + waterLevels[col];
        const surfaceRight = Math.max(0, terrainSlope + elevations[col + 1]) + waterLevels[col + 1];
        const diff = surfaceLeft - surfaceRight;

        if (Math.abs(diff) <= 1) {
          continue;
        }

        const transfer = Math.floor(Math.abs(diff) / 2);
        if (transfer === 0) {
          continue;
        }

        if (diff > 0) {
          const actual = Math.min(transfer, waterLevels[col]);
          waterLevels[col] -= actual;
          waterLevels[col + 1] += actual;
          if (actual > 0) {
            transferred = true;
          }
        } else {
          const actual = Math.min(transfer, waterLevels[col + 1]);
          waterLevels[col + 1] -= actual;
          waterLevels[col] += actual;
          if (actual > 0) {
            transferred = true;
          }
        }
      }

      if (!transferred) {
        break;
      }
    }

    for (let col = 0; col < numCols; col++) {
      if (elevations[col] > 0) {
        waterLevels[col] = 0;
      }
    }

    const holeDepthsCopy = holeDepths.slice();
    absorbIntoPoolGroups(waterLevels, elevations, holeDepthsCopy, absorbed);

    return { waterLevels, absorbed };
  }
}

export interface AdvanceInput {
  elevations: number[][];
  columnHeights: number[];
  terrainSlope: number;
  effectiveHoleDepths: number[][];
  castleCol: number;
  castleRow: number;
  rowSolver?: RowSolver;
}

export interface AdvanceResult {
  snapshots: number[][][];
  maxWaterMap: number[][];
  puddleDelta: number[][];
  wallEvents: WallEvent[][];
  castleFlooded: boolean;
}

export interface RecedeInput {
  elevations: number[][];
  advanceWaterMap: number[][];
  terrainSlope: number;
  effectiveHoleDepths: number[][];
  castleCol: number;
  castleRow: number;
  rowSolver?: RowSolver;
}

export interface RecedeResult {
  snapshots: number[][][];
  maxWaterMap: number[][];
  puddleDelta: number[][];
  wallEvents: WallEvent[][];
  castleFlooded: boolean;
}

function makeGrid(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

function absorbIntoPoolGroups(
  rowWater: number[],
  elevations: number[],
  holeDepths: number[],
  puddleDelta: number[],
): void {
  const numCols = elevations.length;
  let groupStart = -1;

  for (let col = 0; col <= numCols; col++) {
    const isHole = col < numCols && elevations[col] < 0;

    if (isHole && groupStart === -1) {
      groupStart = col;
    } else if (!isHole && groupStart !== -1) {
      absorbPoolGroup(groupStart, col, rowWater, holeDepths, puddleDelta);
      groupStart = -1;
    }
  }
}

function absorbPoolGroup(
  start: number,
  end: number,
  rowWater: number[],
  holeDepths: number[],
  puddleDelta: number[],
): void {
  let totalWater = 0;
  const depths: { col: number; depth: number }[] = [];

  for (let col = start; col < end; col++) {
    totalWater += rowWater[col];
    depths.push({ col, depth: holeDepths[col] });
  }

  if (totalWater <= 0) {
    return;
  }

  // Sort by remaining depth descending (deepest floor first)
  const sorted = [...depths].sort((a, b) => b.depth - a.depth);

  // Fill from bottom up: find the water surface level
  let waterLeft = totalWater;
  let surfaceLevel = -sorted[0].depth;

  for (let i = 0; i < sorted.length; i++) {
    const nextLevel = i < sorted.length - 1 ? -sorted[i + 1].depth : 0;
    const cellsBelow = i + 1;
    const space = (nextLevel - surfaceLevel) * cellsBelow;

    if (waterLeft <= space) {
      surfaceLevel += waterLeft / cellsBelow;
      waterLeft = 0;
      break;
    }

    waterLeft -= space;
    surfaceLevel = nextLevel;
  }

  const h = waterLeft > 0 ? 0 : surfaceLevel;

  let totalAbsorbed = 0;
  for (const { col, depth } of depths) {
    const floor = -depth;
    const absorbed = Math.max(0, Math.min(depth, h - floor));
    puddleDelta[col] += absorbed;
    holeDepths[col] -= absorbed;
    totalAbsorbed += absorbed;
  }

  const remaining = totalWater - totalAbsorbed;
  const perCell = remaining / (end - start);
  for (let col = start; col < end; col++) {
    rowWater[col] = perCell;
  }
}

export function simulateAdvance(input: AdvanceInput): AdvanceResult {
  const { elevations, columnHeights, terrainSlope, castleCol, castleRow } = input;
  const solver = input.rowSolver ?? new EqualizingRowSolver(SETTLE_STEPS);
  const numRows = elevations.length;
  const numCols = elevations[0].length;

  const holeDepths = input.effectiveHoleDepths.map(r => r.slice());
  const puddleDelta = makeGrid(numRows, numCols);
  const wallEvents: WallEvent[][] = Array.from({ length: numRows }, () =>
    new Array(numCols).fill(null),
  );
  const maxWaterMap = makeGrid(numRows, numCols);
  const snapshots: number[][][] = [];
  let castleFlooded = false;

  // Cumulative water state: each snapshot includes all rows processed so far
  const waterState = makeGrid(numRows, numCols);
  let currentHeights = columnHeights.slice();

  for (let row = 0; row < numRows; row++) {
    const rowWater = new Array(numCols).fill(0);
    const blocked = new Array(numCols).fill(false);
    const blockedWater = new Array(numCols).fill(0);

    for (let col = 0; col < numCols; col++) {
      let incoming = currentHeights[col];
      if (incoming <= 0) {
        continue;
      }

      const rawElev = elevations[row][col];
      const effectiveElev = terrainSlope + rawElev;

      if (effectiveElev >= incoming) {
        if (rawElev > 0) {
          blocked[col] = true;
          blockedWater[col] = incoming;
          wallEvents[row][col] = 'blocked';
        }
        continue;
      }

      if (effectiveElev > 0) {
        incoming -= effectiveElev;
        if (rawElev > 0) {
          wallEvents[row][col] = 'overtopped';
        }
      }

      rowWater[col] = incoming;
    }

    absorbIntoPoolGroups(rowWater, elevations[row], holeDepths[row], puddleDelta[row]);

    const settled = solver.settle({
      rowWater,
      elevations: elevations[row],
      holeDepths: holeDepths[row],
      terrainSlope,
      blocked,
      blockedWater,
    });
    for (let col = 0; col < numCols; col++) {
      rowWater[col] = settled.waterLevels[col];
      if (settled.absorbed[col] > 0) {
        puddleDelta[row][col] += settled.absorbed[col];
        holeDepths[row][col] -= settled.absorbed[col];
      }
    }

    // Update cumulative water state and take snapshot
    for (let col = 0; col < numCols; col++) {
      waterState[row][col] = rowWater[col];
      if (rowWater[col] > maxWaterMap[row][col]) {
        maxWaterMap[row][col] = rowWater[col];
      }
    }
    snapshots.push(waterState.map(r => r.slice()));

    if (row === castleRow && rowWater[castleCol] > 0) {
      castleFlooded = true;
    }

    // Carry forward for next row
    currentHeights = rowWater.slice();
  }

  return { snapshots, maxWaterMap, puddleDelta, wallEvents, castleFlooded };
}

export function simulateRecede(input: RecedeInput): RecedeResult {
  const { elevations, advanceWaterMap, terrainSlope, castleCol, castleRow } = input;
  const solver = input.rowSolver ?? new EqualizingRowSolver(SETTLE_STEPS);
  const numRows = elevations.length;
  const numCols = elevations[0].length;

  const holeDepths = input.effectiveHoleDepths.map(r => r.slice());
  const puddleDelta = makeGrid(numRows, numCols);
  const maxWaterMap = makeGrid(numRows, numCols);
  const wallEvents: WallEvent[][] = Array.from({ length: numRows }, () =>
    new Array(numCols).fill(null),
  );
  const snapshots: number[][][] = [];
  let castleFlooded = false;

  // Cumulative water state: starts with advanceWaterMap, rows drain from bottom up
  const waterState = advanceWaterMap.map(r => r.slice());

  for (let row = numRows - 1; row >= 0; row--) {
    // Drain this row from the visible state
    for (let col = 0; col < numCols; col++) {
      waterState[row][col] = 0;
    }

    // Receding water passes through the row above (hole absorption, wall blocking)
    if (row > 0) {
      for (let col = 0; col < numCols; col++) {
        let incoming = advanceWaterMap[row][col];
        if (incoming <= 0) {
          continue;
        }

        const rawElev = elevations[row - 1][col];
        const effectiveElev = terrainSlope + rawElev;

        if (effectiveElev >= incoming) {
          if (rawElev > 0) {
            wallEvents[row - 1][col] = 'blocked';
          }
          continue;
        }

        if (effectiveElev > 0) {
          incoming -= effectiveElev;
          if (rawElev > 0) {
            wallEvents[row - 1][col] = 'overtopped';
          }
        }

        if (incoming > 0) {
          waterState[row - 1][col] = Math.max(waterState[row - 1][col], incoming);
          if (incoming > maxWaterMap[row - 1][col]) {
            maxWaterMap[row - 1][col] = incoming;
          }
        }
      }

      absorbIntoPoolGroups(
        waterState[row - 1],
        elevations[row - 1],
        holeDepths[row - 1],
        puddleDelta[row - 1],
      );

      const rowWater = waterState[row - 1].slice();
      const settled = solver.settle({
        rowWater,
        elevations: elevations[row - 1],
        holeDepths: holeDepths[row - 1],
        terrainSlope,
      });
      for (let col = 0; col < numCols; col++) {
        waterState[row - 1][col] = settled.waterLevels[col];
        if (settled.absorbed[col] > 0) {
          puddleDelta[row - 1][col] += settled.absorbed[col];
          holeDepths[row - 1][col] -= settled.absorbed[col];
        }
        if (waterState[row - 1][col] > maxWaterMap[row - 1][col]) {
          maxWaterMap[row - 1][col] = waterState[row - 1][col];
        }
      }
    }

    snapshots.push(waterState.map(r => r.slice()));

    for (let col = 0; col < numCols; col++) {
      if (waterState[row][col] > maxWaterMap[row][col]) {
        maxWaterMap[row][col] = waterState[row][col];
      }
    }

    if (row === castleRow && waterState[row][castleCol] > 0) {
      castleFlooded = true;
    }
  }

  return { snapshots, maxWaterMap, puddleDelta, wallEvents, castleFlooded };
}
