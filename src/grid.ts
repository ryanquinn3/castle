import { Scene } from 'excalibur';
import { Tile } from './tile';
import { GRID_WIDTH, GRID_HEIGHT, CASTLE_COL, CASTLE_ROW, MIN_ELEVATION, MAX_ELEVATION } from './config';
import { WallErosionEvent } from './wave';

export interface PuddleDelta {
  col: number;
  row: number;
  depth: number;
}

export class TileGrid {
  private tiles: Tile[][];

  constructor(scene: Scene) {
    this.tiles = [];
    for (let row = 0; row < GRID_HEIGHT; row++) {
      this.tiles[row] = [];
      for (let col = 0; col < GRID_WIDTH; col++) {
        const isCastle = col === CASTLE_COL && row === CASTLE_ROW;
        const tile = new Tile(col, row, isCastle);
        this.tiles[row][col] = tile;
        scene.add(tile);
      }
    }
  }

  getTile(col: number, row: number): Tile | undefined {
    if (row < 0 || row >= GRID_HEIGHT || col < 0 || col >= GRID_WIDTH) {
      return undefined;
    }
    return this.tiles[row][col];
  }

  getElevation(col: number, row: number): number {
    return this.getTile(col, row)?.elevation ?? 0;
  }

  getPuddleDepth(col: number, row: number): number {
    return this.getTile(col, row)?.puddleDepth ?? 0;
  }

  effectiveHoleDepth(col: number, row: number): number {
    const tile = this.getTile(col, row);
    if (!tile) {
      return 0;
    }
    if (tile.elevation >= 0) {
      return 0;
    }
    return Math.max(0, (-tile.elevation) - tile.puddleDepth);
  }

  applyPuddleDeltas(deltas: PuddleDelta[]): void {
    for (const delta of deltas) {
      const tile = this.getTile(delta.col, delta.row);
      if (!tile) {
        continue;
      }
      if (tile.elevation >= 0) {
        continue;
      }
      const maxDepth = -tile.elevation;
      tile.puddleDepth = Math.min(maxDepth, tile.puddleDepth + delta.depth);
    }
  }

  setElevation(col: number, row: number, delta: number): void {
    const tile = this.getTile(col, row);
    if (!tile) return;
    tile.elevation = Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, tile.elevation + delta));
    tile.updateVisual();
  }

  getElevations(): number[][] {
    return this.tiles.map(row => row.map(tile => tile.elevation));
  }

  resetHitCounts(): void {
    for (let row = 0; row < this.tiles.length; row++) {
      for (let col = 0; col < this.tiles[row].length; col++) {
        this.tiles[row][col].waveHitCount = 0;
      }
    }
  }

  applySandRedistribution(events: WallErosionEvent[][]): void {
    for (let row = 0; row < events.length; row++) {
      for (let col = 0; col < events[row].length; col++) {
        if (events[row][col] === null) {
          continue;
        }
        const wall = this.getTile(col, row);
        if (!wall || wall.isCastle) {
          continue;
        }
        // Drop wall by 1.
        this.setElevation(col, row, -1);

        // Raise tile directly upstream (row - 1) if it exists, isn't castle, and isn't capped.
        const upstream = this.getTile(col, row - 1);
        if (!upstream || upstream.isCastle) {
          continue;
        }
        if (upstream.elevation >= MAX_ELEVATION) {
          continue;
        }
        this.setElevation(col, row - 1, +1);
      }
    }
  }

  applyErosion(advanceMap: number[][], recedeMap: number[][]): Tile[] {
    const erodedTiles: Tile[] = [];
    for (let row = 0; row < advanceMap.length; row++) {
      for (let col = 0; col < advanceMap[row].length; col++) {
        const tile = this.getTile(col, row);
        if (!tile) {
          continue;
        }
        if (tile.isCastle) {
          continue;
        }
        let hits = 0;
        if (advanceMap[row][col] - tile.elevation >= 2) {
          hits++;
        }
        if (recedeMap[row][col] - tile.elevation >= 2) {
          hits++;
        }
        if (hits === 0) {
          continue;
        }
        tile.waveHitCount += hits;
        while (tile.waveHitCount >= 3) {
          if (tile.elevation > 0) {
            this.setElevation(col, row, -1);
            erodedTiles.push(tile);
          } else if (tile.elevation < 0) {
            this.setElevation(col, row, +1);
            erodedTiles.push(tile);
          } else {
            // Flat tile — counter accumulates but no elevation change. Break to avoid infinite loop.
            break;
          }
          tile.waveHitCount -= 3;
        }
      }
    }
    return erodedTiles;
  }
}
