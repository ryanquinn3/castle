export type WallEvent = 'overtopped' | 'blocked' | null;

export interface AdvanceInput {
  elevations: number[][];
  columnHeights: number[];
  terrainSlope: number;
  effectiveHoleDepths: number[][];
  castleCol: number;
  castleRow: number;
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

function makeSnapshot(rows: number, cols: number, row: number, rowWater: number[]): number[][] {
  const snap = makeGrid(rows, cols);
  for (let c = 0; c < cols; c++) {
    snap[row][c] = rowWater[c];
  }
  return snap;
}

export function simulateAdvance(input: AdvanceInput): AdvanceResult {
  const { elevations, columnHeights, terrainSlope, castleCol, castleRow } = input;
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

      const elev = terrainSlope + elevations[row][col];

      if (elev >= incoming) {
        blocked[col] = true;
        blockedWater[col] = incoming;
        if (elevations[row][col] > 0) {
          wallEvents[row][col] = 'blocked';
        }
        continue;
      }

      if (elev > 0) {
        incoming -= elev;
        if (elevations[row][col] > 0) {
          wallEvents[row][col] = 'overtopped';
        }
      } else if (elev < 0) {
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
      if (col > 0 && !blocked[col - 1]) {
        neighbors.push(col - 1);
      }
      if (col < numCols - 1 && !blocked[col + 1]) {
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

    // Build snapshot and update tracking
    snapshots.push(makeSnapshot(numRows, numCols, row, rowWater));

    for (let col = 0; col < numCols; col++) {
      if (rowWater[col] > maxWaterMap[row][col]) {
        maxWaterMap[row][col] = rowWater[col];
      }
    }

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

  // Start with per-column heights from the bottom row of advanceWaterMap
  let currentHeights = new Array(numCols).fill(0);
  for (let col = 0; col < numCols; col++) {
    currentHeights[col] = advanceWaterMap[numRows - 1][col];
  }

  for (let row = numRows - 1; row >= 0; row--) {
    const rowWater = new Array(numCols).fill(0);

    for (let col = 0; col < numCols; col++) {
      let incoming = currentHeights[col];
      if (incoming <= 0) {
        continue;
      }

      const elev = terrainSlope + elevations[row][col];

      if (elev >= incoming) {
        if (elevations[row][col] > 0) {
          // Wall blocks during recede too, but no event tracking needed
        }
        continue;
      }

      if (elev > 0) {
        incoming -= elev;
      } else if (elev < 0) {
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

    const snap = makeSnapshot(numRows, numCols, row, rowWater);
    snapshots.unshift(snap);

    for (let col = 0; col < numCols; col++) {
      if (rowWater[col] > maxWaterMap[row][col]) {
        maxWaterMap[row][col] = rowWater[col];
      }
    }

    if (row === castleRow && rowWater[castleCol] > 0) {
      castleFlooded = true;
    }

    // Carry upward: use this row's advanceWaterMap as source for next iteration
    if (row > 0) {
      currentHeights = new Array(numCols).fill(0);
      for (let col = 0; col < numCols; col++) {
        currentHeights[col] = advanceWaterMap[row - 1][col];
      }
    }
  }

  return { snapshots, maxWaterMap, puddleDelta, castleFlooded };
}
