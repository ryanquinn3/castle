import { Scene } from 'excalibur';
import { Tile } from './tile.ts';
import { CastleTile } from './castle-tile.ts';
import { GridModel } from '../model/grid-model.ts';
import type { WallErosionEvent } from '../model/wave-simulation.ts';


export class GridView {
  readonly model: GridModel;
  private tiles: Tile[][];

  constructor(model: GridModel, scene: Scene) {
    this.model = model;
    this.tiles = [];
    for (let row = 0; row < model.height; row++) {
      this.tiles[row] = [];
      for (let col = 0; col < model.width; col++) {
        const tile = model.isCastle(col, row)
          ? new CastleTile(col, row)
          : new Tile(col, row);
        this.tiles[row][col] = tile;
        scene.add(tile);
      }
    }
    this.refreshAllVisuals();
  }

  getTile(col: number, row: number): Tile | undefined {
    if (row < 0 || row >= this.model.height || col < 0 || col >= this.model.width) {
      return undefined;
    }
    return this.tiles[row][col];
  }

  getElevation(col: number, row: number): number {
    return this.model.getElevation(col, row);
  }

  getPuddleDepth(col: number, row: number): number {
    return this.model.getPuddleDepth(col, row);
  }

  effectiveHoleDepth(col: number, row: number): number {
    return this.model.effectiveHoleDepth(col, row);
  }

  getElevations(): number[][] {
    return this.model.getElevations();
  }

  setElevation(col: number, row: number, delta: number): void {
    this.model.setElevation(col, row, delta);
    this.refreshTileVisual(col, row);
    this.refreshTileVisual(col, row - 1);
    this.refreshTileVisual(col, row + 1);
    this.refreshTileVisual(col - 1, row);
    this.refreshTileVisual(col + 1, row);
  }

  applyPuddleDeltas(deltas: { col: number; row: number; depth: number }[]): void {
    this.model.applyPuddleDeltas(deltas);
    for (const delta of deltas) {
      this.refreshTileVisual(delta.col, delta.row);
    }
    this.refreshPoolVisuals();
  }

  applyErosion(advanceMap: number[][], recedeMap: number[][]): Tile[] {
    const results = this.model.applyErosion(advanceMap, recedeMap);
    this.refreshAllVisuals();
    const erodedTiles: Tile[] = [];
    for (const r of results) {
      const tile = this.getTile(r.col, r.row);
      if (tile) {
        erodedTiles.push(tile);
      }
    }
    return erodedTiles;
  }

  applySandRedistribution(events: WallErosionEvent[][]): void {
    this.model.applySandRedistribution(events);
    this.refreshAllVisuals();
  }

  resetHitCounts(): void {
    this.model.resetHitCounts();
  }

  getPoolMap(): Map<string, { id: number; members: { col: number; row: number }[] }> {
    return this.model.getPoolMap();
  }

  refreshTileVisual(col: number, row: number): void {
    const tile = this.getTile(col, row);
    if (!tile) {
      return;
    }
    tile.elevation = this.model.getElevation(col, row);
    tile.puddleDepth = this.model.getPuddleDepth(col, row);
    tile.waveHitCount = this.model.getHitCount(col, row);
    const neighbors = this.model.getPoolNeighbors(col, row);
    tile.updateVisual(neighbors ?? undefined);
  }

  refreshAllVisuals(): void {
    for (let row = 0; row < this.model.height; row++) {
      for (let col = 0; col < this.model.width; col++) {
        this.refreshTileVisual(col, row);
      }
    }
  }

  refreshPoolVisuals(): void {
    for (const pool of this.model.getPools()) {
      for (const { col, row } of pool.members) {
        this.refreshTileVisual(col, row);
      }
    }
  }
}
