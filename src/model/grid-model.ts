import { MIN_ELEVATION, MAX_ELEVATION } from '../config';
import { WallErosionEvent } from './wave-simulation';

export { WallErosionEvent };

export interface GridModelInput {
  width: number;
  height: number;
  castleCol: number;
  castleRow: number;
}

export interface PuddleDelta {
  col: number;
  row: number;
  depth: number;
}

export interface Pool {
  id: number;
  members: { col: number; row: number }[];
}

export interface ErosionResult {
  col: number;
  row: number;
  newElevation: number;
}

export interface PoolNeighbors {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export class GridModel {
  readonly width: number;
  readonly height: number;
  readonly castleCol: number;
  readonly castleRow: number;

  private elevations: number[][];
  private puddleDepths: number[][];
  private hitCounts: number[][];
  private pools: Pool[] = [];
  private poolMap = new Map<string, Pool>();

  private minElevation = MIN_ELEVATION;
  private maxElevation = MAX_ELEVATION;

  constructor(input: GridModelInput) {
    this.width = input.width;
    this.height = input.height;
    this.castleCol = input.castleCol;
    this.castleRow = input.castleRow;

    this.elevations = this.makeGrid(0);
    this.puddleDepths = this.makeGrid(0);
    this.hitCounts = this.makeGrid(0);
    this.detectPools();
  }

  private makeGrid(value: number): number[][] {
    return Array.from({ length: this.height }, () =>
      new Array(this.width).fill(value),
    );
  }

  private inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.width && row >= 0 && row < this.height;
  }

  setElevationBounds(min: number, max: number): void {
    this.minElevation = min;
    this.maxElevation = max;
  }

  isCastle(col: number, row: number): boolean {
    return col === this.castleCol && row === this.castleRow;
  }

  getElevation(col: number, row: number): number {
    if (!this.inBounds(col, row)) {
      return 0;
    }
    return this.elevations[row][col];
  }

  getElevations(): number[][] {
    return this.elevations.map(row => [...row]);
  }

  setElevation(col: number, row: number, delta: number): void {
    if (!this.inBounds(col, row)) {
      return;
    }
    const clamped = Math.max(
      this.minElevation,
      Math.min(this.maxElevation, this.elevations[row][col] + delta),
    );
    this.elevations[row][col] = clamped;

    if (clamped >= 0) {
      this.puddleDepths[row][col] = 0;
    } else {
      this.puddleDepths[row][col] = Math.min(
        this.puddleDepths[row][col],
        -clamped,
      );
    }
    this.detectPools();
  }

  getPuddleDepth(col: number, row: number): number {
    if (!this.inBounds(col, row)) {
      return 0;
    }
    return this.puddleDepths[row][col];
  }

  effectiveHoleDepth(col: number, row: number): number {
    if (!this.inBounds(col, row)) {
      return 0;
    }
    const elev = this.elevations[row][col];
    if (elev >= 0) {
      return 0;
    }
    return Math.max(0, -elev - this.puddleDepths[row][col]);
  }

  applyPuddleDeltas(deltas: PuddleDelta[]): void {
    for (const delta of deltas) {
      if (!this.inBounds(delta.col, delta.row)) {
        continue;
      }
      const elev = this.elevations[delta.row][delta.col];
      if (elev >= 0) {
        continue;
      }
      const maxDepth = -elev;
      this.puddleDepths[delta.row][delta.col] = Math.min(
        maxDepth,
        this.puddleDepths[delta.row][delta.col] + delta.depth,
      );
    }
    this.detectPools();
  }

  getHitCount(col: number, row: number): number {
    if (!this.inBounds(col, row)) {
      return 0;
    }
    return this.hitCounts[row][col];
  }

  incrementHitCount(col: number, row: number, amount: number): void {
    if (!this.inBounds(col, row)) {
      return;
    }
    this.hitCounts[row][col] += amount;
  }

  resetHitCounts(): void {
    for (const row of this.hitCounts) {
      row.fill(0);
    }
  }

  applyErosion(
    advanceMap: number[][],
    recedeMap: number[][],
  ): ErosionResult[] {
    const results: ErosionResult[] = [];

    for (let row = 0; row < advanceMap.length; row++) {
      for (let col = 0; col < advanceMap[row].length; col++) {
        if (!this.inBounds(col, row)) {
          continue;
        }
        if (this.isCastle(col, row)) {
          continue;
        }
        const elev = this.elevations[row][col];
        let hits = 0;
        if (advanceMap[row][col] > 0 && advanceMap[row][col] - elev >= 2) {
          hits++;
        }
        if (recedeMap[row][col] > 0 && recedeMap[row][col] - elev >= 2) {
          hits++;
        }
        if (hits === 0) {
          continue;
        }
        this.hitCounts[row][col] += hits;

        while (this.hitCounts[row][col] >= 3) {
          const currentElev = this.elevations[row][col];
          if (currentElev > 0) {
            this.setElevation(col, row, -1);
            results.push({ col, row, newElevation: this.elevations[row][col] });
          } else if (currentElev < 0) {
            this.setElevation(col, row, +1);
            results.push({ col, row, newElevation: this.elevations[row][col] });
          } else {
            break;
          }
          this.hitCounts[row][col] -= 3;
        }
      }
    }
    return results;
  }

  applySandRedistribution(events: WallErosionEvent[][]): void {
    for (let row = 0; row < events.length; row++) {
      for (let col = 0; col < events[row].length; col++) {
        if (events[row][col] === null) {
          continue;
        }
        if (this.isCastle(col, row)) {
          continue;
        }
        if (!this.inBounds(col, row)) {
          continue;
        }
        this.setElevation(col, row, -1);

        const upRow = row - 1;
        if (
          !this.inBounds(col, upRow) ||
          this.isCastle(col, upRow) ||
          this.elevations[upRow][col] >= 0
        ) {
          continue;
        }
        this.setElevation(col, upRow, +1);
      }
    }
  }

  detectPools(): void {
    this.pools = [];
    this.poolMap.clear();
    const visited = new Set<string>();
    let nextId = 0;

    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        if (this.elevations[row][col] >= 0) {
          continue;
        }
        const key = `${col}:${row}`;
        if (visited.has(key)) {
          continue;
        }

        const pool: Pool = { id: nextId++, members: [] };
        const queue = [{ col, row }];
        visited.add(key);

        while (queue.length > 0) {
          const cur = queue.shift()!;
          pool.members.push(cur);
          this.poolMap.set(`${cur.col}:${cur.row}`, pool);

          for (const [dc, dr] of [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0],
          ]) {
            const nc = cur.col + dc;
            const nr = cur.row + dr;
            const nk = `${nc}:${nr}`;
            if (visited.has(nk)) {
              continue;
            }
            if (!this.inBounds(nc, nr)) {
              continue;
            }
            if (this.elevations[nr][nc] >= 0) {
              continue;
            }
            visited.add(nk);
            queue.push({ col: nc, row: nr });
          }
        }
        this.pools.push(pool);
      }
    }
  }

  getPool(col: number, row: number): Pool | undefined {
    return this.poolMap.get(`${col}:${row}`);
  }

  getPools(): Pool[] {
    return this.pools;
  }

  getPoolMap(): Map<string, Pool> {
    return this.poolMap;
  }

  getPoolNeighbors(col: number, row: number): PoolNeighbors | undefined {
    const pool = this.getPool(col, row);
    if (!pool) {
      return undefined;
    }
    return {
      top: this.getPool(col, row - 1) === pool,
      bottom: this.getPool(col, row + 1) === pool,
      left: this.getPool(col - 1, row) === pool,
      right: this.getPool(col + 1, row) === pool,
    };
  }

  reset(): void {
    this.elevations = this.makeGrid(0);
    this.puddleDepths = this.makeGrid(0);
    this.hitCounts = this.makeGrid(0);
    this.pools = [];
    this.poolMap.clear();
    this.detectPools();
  }
}
