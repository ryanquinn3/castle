import { Scene } from 'excalibur';
import { Tile } from './tile';
import { GRID_WIDTH, GRID_HEIGHT, CASTLE_COL, CASTLE_ROW, MIN_ELEVATION, MAX_ELEVATION } from './config';

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

  applyErosion(waveHeightMap: number[][]): Tile[] {
    const erodedTiles: Tile[] = [];
    for (let row = 0; row < waveHeightMap.length; row++) {
      for (let col = 0; col < waveHeightMap[row].length; col++) {
        if (waveHeightMap[row][col] <= 0) continue;
        const tile = this.getTile(col, row);
        if (!tile) continue;
        if (tile.isCastle) continue;
        tile.waveHitCount++;
        if (tile.waveHitCount >= 3) {
          if (tile.elevation > 0) {
            this.setElevation(col, row, -1);
            erodedTiles.push(tile);
          } else if (tile.elevation < 0) {
            this.setElevation(col, row, +1);
            erodedTiles.push(tile);
          }
          tile.waveHitCount = 0;
        }
      }
    }
    return erodedTiles;
  }
}
