import { MIN_ELEVATION, MAX_ELEVATION } from '../config.ts';
import { Terrain, FlatGround, Wall, Hole } from './terrain.ts';
import type { WallErosionEvent } from './wave-simulation.ts';

export type { WallErosionEvent };
export { Terrain };

export interface GridModelInput {
  width: number;
  height: number;
  castleCol: number;
  castleRow: number;
  castleWidth: number;
  castleHeight: number;
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

export interface SerializeInput {
  columnHeights?: number[];
}

export class GridModel {
  readonly width: number;
  readonly height: number;
  readonly castleCol: number;
  readonly castleRow: number;
  readonly castleWidth: number;
  readonly castleHeight: number;

  private cells: Terrain[][];
  private pools: Pool[] = [];
  private poolMap = new Map<string, Pool>();

  private minElevation = MIN_ELEVATION;
  private maxElevation = MAX_ELEVATION;

  constructor(input: GridModelInput) {
    this.width = input.width;
    this.height = input.height;
    this.castleCol = input.castleCol;
    this.castleRow = input.castleRow;
    this.castleWidth = input.castleWidth;
    this.castleHeight = input.castleHeight;

    this.cells = this.makeFlatGrid();
    this.detectPools();
  }

  private makeFlatGrid(): Terrain[][] {
    return Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => new FlatGround()),
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
    return (
      col >= this.castleCol &&
      col < this.castleCol + this.castleWidth &&
      row >= this.castleRow &&
      row < this.castleRow + this.castleHeight
    );
  }

  getCell(col: number, row: number): Terrain {
    if (!this.inBounds(col, row)) {
      return new FlatGround();
    }
    return this.cells[row][col];
  }

  getCells(): Terrain[][] {
    return this.cells;
  }

  getElevation(col: number, row: number): number {
    return this.getCell(col, row).elevation;
  }

  getElevations(): number[][] {
    return this.cells.map(row => row.map(cell => cell.elevation));
  }

  setElevation(col: number, row: number, delta: number): void {
    if (!this.inBounds(col, row)) {
      return;
    }
    const currentElev = this.cells[row][col].elevation;
    const targetElev = Math.max(
      this.minElevation,
      Math.min(this.maxElevation, currentElev + delta),
    );
    const clampedDelta = targetElev - currentElev;
    this.cells[row][col] = this.cells[row][col].applyDelta(clampedDelta);
    this.detectPools();
  }

  getPuddleDepth(col: number, row: number): number {
    const cell = this.getCell(col, row);
    if (cell instanceof Hole) {
      return cell.puddleDepth;
    }
    return 0;
  }

  getPuddleDepths(): number[][] {
    return this.cells.map(row =>
      row.map(cell => (cell instanceof Hole ? cell.puddleDepth : 0)),
    );
  }

  effectiveHoleDepth(col: number, row: number): number {
    const cell = this.getCell(col, row);
    if (cell instanceof Hole) {
      return cell.effectiveDepth;
    }
    return 0;
  }

  applyPuddleDeltas(deltas: PuddleDelta[]): void {
    for (const delta of deltas) {
      if (!this.inBounds(delta.col, delta.row)) {
        continue;
      }
      const cell = this.cells[delta.row][delta.col];
      if (cell instanceof Hole) {
        cell.addPuddle(delta.depth);
      }
    }
    this.detectPools();
  }

  getHitCount(col: number, row: number): number {
    const cell = this.getCell(col, row);
    if (cell instanceof Wall) {
      return cell.hitCount;
    }
    if (cell instanceof Hole) {
      return cell.hitCount;
    }
    return 0;
  }

  incrementHitCount(col: number, row: number, amount: number): void {
    if (!this.inBounds(col, row)) {
      return;
    }
    const cell = this.cells[row][col];
    if (cell instanceof Wall) {
      cell.hitCount += amount;
    } else if (cell instanceof Hole) {
      cell.hitCount += amount;
    }
  }

  resetHitCounts(): void {
    for (const row of this.cells) {
      for (const cell of row) {
        cell.resetHits();
      }
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
        const cell = this.cells[row][col];
        const elev = cell.elevation;
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
        const result = cell.applyHits(hits);
        if (result) {
          results.push({ col, row, newElevation: result.newElevation });
          if (cell.elevation === 0) {
            this.cells[row][col] = new FlatGround();
          }
        }
      }
    }
    if (results.length > 0) {
      this.detectPools();
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
          !(this.cells[upRow][col] instanceof Hole)
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
        if (!(this.cells[row][col] instanceof Hole)) {
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
            if (!(this.cells[nr][nc] instanceof Hole)) {
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

  serialize(input?: SerializeInput): string {
    return JSON.stringify({
      castleCol: this.castleCol,
      castleRow: this.castleRow,
      elevations: this.cells.map(row => row.map(cell => cell.elevation)),
      columnHeights: input?.columnHeights ?? [],
      puddleDepths: this.cells.map(row =>
        row.map(cell => (cell instanceof Hole ? cell.puddleDepth : 0)),
      ),
    });
  }

  reset(): void {
    this.cells = this.makeFlatGrid();
    this.pools = [];
    this.poolMap.clear();
    this.detectPools();
  }
}
