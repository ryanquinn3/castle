export type WallEvent = 'overtopped' | 'blocked' | null;

export interface AdvanceInput {
  elevations: number[][];
  columnHeights: number[];
  terrainSlope: number;
  effectiveHoleDepths: number[][];
  castleCol: number;
  castleRow: number;
  spreadFactor?: number;
  spreadThreshold?: number;
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
}

export interface RecedeResult {
  snapshots: number[][][];
  maxWaterMap: number[][];
  puddleDelta: number[][];
  castleFlooded: boolean;
}

function makeGrid(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

export function simulateAdvance(input: AdvanceInput): AdvanceResult {
  const {
    elevations, columnHeights, terrainSlope, castleCol, castleRow,
    spreadFactor = 0, spreadThreshold = 1,
  } = input;
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
      } else if (effectiveElev < 0) {
        const depth = holeDepths[row][col];
        if (depth > 0) {
          const absorbed = Math.min(incoming, depth);
          puddleDelta[row][col] += absorbed;
          holeDepths[row][col] -= absorbed;
          incoming -= absorbed;
        }
      }

      rowWater[col] = incoming;
    }

    // Lateral redistribution: blocked columns split water to adjacent unblocked columns
    for (let col = 0; col < numCols; col++) {
      if (!blocked[col] || blockedWater[col] <= 0) {
        continue;
      }

      const neighbors: number[] = [];
      if (col > 0 && !blocked[col - 1] && elevations[row][col - 1] <= 0) {
        neighbors.push(col - 1);
      }
      if (col < numCols - 1 && !blocked[col + 1] && elevations[row][col + 1] <= 0) {
        neighbors.push(col + 1);
      }

      if (neighbors.length === 0) {
        continue;
      }

      const share = blockedWater[col] / neighbors.length;
      for (const n of neighbors) {
        rowWater[n] += share;
      }
    }

    // Lateral spreading: equalize water between adjacent columns when difference > threshold
    if (spreadFactor > 0) {
      for (let col = 0; col < numCols - 1; col++) {
        const diff = rowWater[col] - rowWater[col + 1];
        if (Math.abs(diff) > spreadThreshold) {
          const transfer = (diff - Math.sign(diff) * spreadThreshold) * spreadFactor;
          rowWater[col] -= transfer;
          rowWater[col + 1] += transfer;
        }
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
  const numRows = elevations.length;
  const numCols = elevations[0].length;

  const holeDepths = input.effectiveHoleDepths.map(r => r.slice());
  const puddleDelta = makeGrid(numRows, numCols);
  const maxWaterMap = makeGrid(numRows, numCols);
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

        const elev = terrainSlope + elevations[row - 1][col];

        if (elev >= incoming) {
          continue;
        }

        if (elev > 0) {
          incoming -= elev;
        } else if (elev < 0) {
          const depth = holeDepths[row - 1][col];
          if (depth > 0) {
            const absorbed = Math.min(incoming, depth);
            puddleDelta[row - 1][col] += absorbed;
            holeDepths[row - 1][col] -= absorbed;
            incoming -= absorbed;
          }
        }

        if (incoming > 0) {
          waterState[row - 1][col] = Math.max(waterState[row - 1][col], incoming);
          if (incoming > maxWaterMap[row - 1][col]) {
            maxWaterMap[row - 1][col] = incoming;
          }
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

  return { snapshots, maxWaterMap, puddleDelta, castleFlooded };
}
