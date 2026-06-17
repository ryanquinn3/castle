import type { Scene } from 'excalibur';
import { MIN_ELEVATION, MAX_ELEVATION, TOWER_HEIGHT } from '../config.ts';
import { Terrain, type NeighborGrid, type Neighbors } from './terrain/terrain.ts';
import { FlatGround } from './terrain/flat-ground.ts';
import { Wall } from './terrain/wall.ts';
import { Hole } from './terrain/hole.ts';
import { Tower } from './terrain/tower.ts';
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

export class GridModel implements NeighborGrid {
  readonly width: number;
  readonly height: number;
  readonly castleCol: number;
  readonly castleRow: number;
  readonly castleWidth: number;
  readonly castleHeight: number;

  private cells: Terrain[][];
  private pools: Pool[] = [];
  private poolMap = new Map<string, Pool>();
  private readonly scene: Scene;

  private minElevation = MIN_ELEVATION;
  private maxElevation = MAX_ELEVATION;

  constructor(input: GridModelInput, scene: Scene) {
    this.width = input.width;
    this.height = input.height;
    this.castleCol = input.castleCol;
    this.castleRow = input.castleRow;
    this.castleWidth = input.castleWidth;
    this.castleHeight = input.castleHeight;
    this.scene = scene;

    this.cells = [];
    this.initFlatGrid();
    this.detectPools();
  }

  private initFlatGrid(): void {
    this.cells = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => new FlatGround()),
    );
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const cell = this.cells[row][col];
        cell.attach(this, col, row);
        this.scene.add(cell);
        cell.syncGraphic();
      }
    }
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

  private cellOrNull(col: number, row: number): Terrain | null {
    if (!this.inBounds(col, row)) {
      return null;
    }
    return this.cells[row][col];
  }

  neighborsOf(col: number, row: number): Neighbors {
    return {
      north: this.cellOrNull(col, row - 1),
      south: this.cellOrNull(col, row + 1),
      east: this.cellOrNull(col + 1, row),
      west: this.cellOrNull(col - 1, row),
    };
  }

  private setCell(col: number, row: number, next: Terrain): void {
    const prev = this.cells[row][col];
    if (next !== prev) {
      this.scene.remove(prev);
      next.attach(this, col, row);
      this.cells[row][col] = next;
      this.scene.add(next);
    }
    this.refreshGraphics(col, row);
  }

  private refreshGraphics(col: number, row: number): void {
    for (const [c, r] of [[col, row], [col, row - 1], [col, row + 1], [col - 1, row], [col + 1, row]]) {
      if (this.inBounds(c, r)) {
        this.cells[r][c].syncGraphic();
      }
    }
  }

  private refreshPoolGraphics(): void {
    for (const pool of this.pools) {
      for (const { col, row } of pool.members) {
        this.cells[row][col].syncGraphic();
      }
    }
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
    this.setCell(col, row, this.cells[row][col].applyDelta(clampedDelta));
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
    this.refreshPoolGraphics();
  }

  applyPuddleDelta(col: number, row: number, depth: number): void {
    this.applyPuddleDeltas([{ col, row, depth }]);
  }

  placeTower(col: number, row: number): boolean {
    if (!this.inBounds(col, row)) {
      return false;
    }
    if (this.isCastle(col, row)) {
      return false;
    }
    if (!(this.cells[row][col] instanceof FlatGround)) {
      return false;
    }
    this.setCell(col, row, new Tower(TOWER_HEIGHT));
    return true;
  }

  placeWall(col: number, row: number, level: number): boolean {
    if (!this.inBounds(col, row) || this.isCastle(col, row)) {
      return false;
    }
    const cell = this.cells[row][col];
    if (level === 1) {
      if (!(cell instanceof FlatGround)) {
        return false;
      }
    } else if (!(cell instanceof Wall) || cell.level !== level - 1) {
      return false;
    }
    this.setCell(col, row, new Wall(level));
    this.detectPools();
    return true;
  }

  clearCell(col: number, row: number): void {
    if (!this.inBounds(col, row) || this.isCastle(col, row)) {
      return;
    }
    this.setCell(col, row, new FlatGround());
    this.detectPools();
  }

  getHitCount(col: number, row: number): number {
    const cell = this.getCell(col, row);
    if (cell instanceof Hole || cell instanceof Tower) {
      return cell.hitCount;
    }
    return 0;
  }

  incrementHitCount(col: number, row: number, amount: number): void {
    if (!this.inBounds(col, row)) {
      return;
    }
    const cell = this.cells[row][col];
    if (cell instanceof Hole || cell instanceof Tower) {
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

  /**
   * Applies a discrete erosion hit count to a wall/tower, bypassing the depth
   * gate (the pressure field's velocity charge is the gate). Swaps to FlatGround
   * at elevation 0, else refreshes graphics; always re-detects pools.
   */
  applyErosionHits(col: number, row: number, hits: number): ErosionResult | null {
    if (hits <= 0 || !this.inBounds(col, row) || this.isCastle(col, row)) {
      return null;
    }

    const cell = this.cells[row][col];
    const result = cell.applyHits(hits);
    if (!result) {
      return null;
    }

    if (cell.elevation === 0) {
      this.setCell(col, row, new FlatGround());
    } else {
      this.refreshGraphics(col, row);
    }
    this.detectPools();
    return { col, row, newElevation: result.newElevation };
  }

  commitHoleWave(col: number, row: number, pooledWater: number): ErosionResult | null {
    if (!this.inBounds(col, row) || this.isCastle(col, row)) {
      return null;
    }
    const cell = this.cells[row][col];
    if (!(cell instanceof Hole)) {
      return null;
    }
    const result = cell.commitWave(pooledWater);
    if (!result) {
      return null;
    }
    if (cell.elevation === 0) {
      this.setCell(col, row, new FlatGround());
    } else {
      this.refreshGraphics(col, row);
    }
    this.detectPools();
    return { col, row, newElevation: result.newElevation };
  }

  applySandRedistributionAt(col: number, row: number): boolean {
    if (!this.inBounds(col, row) || this.isCastle(col, row)) {
      return false;
    }

    if (this.cells[row][col] instanceof Wall) {
      return false;
    }

    this.setElevation(col, row, -1);

    const upRow = row - 1;
    if (
      this.inBounds(col, upRow) &&
      !this.isCastle(col, upRow) &&
      this.cells[upRow][col] instanceof Hole
    ) {
      this.setElevation(col, upRow, +1);
    }

    return true;
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
            this.setCell(col, row, new FlatGround());
          } else {
            // Cell mutated in-place; setCell wasn't called so we need explicit refresh
            this.refreshGraphics(col, row);
          }
        }
      }
    }
    if (results.length > 0) {
      this.detectPools();
    }
    return results;
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
      castle: {
        col: this.castleCol,
        row: this.castleRow,
        width: this.castleWidth,
        height: this.castleHeight,
      },
      cells: this.cells.map(row => row.map(cell => cell.serialize())),
      columnHeights: input?.columnHeights ?? [],
    });
  }

  reset(): void {
    for (const row of this.cells) {
      for (const cell of row) {
        this.scene.remove(cell);
      }
    }
    this.initFlatGrid();
    this.pools = [];
    this.poolMap.clear();
    this.detectPools();
  }
}
