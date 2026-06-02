import { type Color, type ImageSource, type Sprite } from 'excalibur';

import type { WaterColumn } from '../water-column.ts';

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';
export type WallEvent = 'overtopped' | 'blocked' | null;

export interface SerializedTerrain {
  type: string;
  height: number;
  [key: string]: unknown;
}

export interface ErosionResult {
  newElevation: number;
}

export type Neighbors = {
  north: Terrain | null;
  south: Terrain | null;
  east: Terrain | null;
  west: Terrain | null;
};

// The grid owns the n/s/e/w direction arithmetic and bounds checking.
export interface NeighborGrid {
  neighborsOf(col: number, row: number): Neighbors;
}

const NO_NEIGHBORS: Neighbors = { north: null, south: null, east: null, west: null };

export interface TileRenderInfo {
  sprite: Sprite | null;
  tint: Color | null;
  cacheKey?: string;
  customDraw?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

export abstract class Terrain {
  private grid: NeighborGrid | null = null;
  col = -1;
  row = -1;

  attach(grid: NeighborGrid, col: number, row: number): void {
    this.grid = grid;
    this.col = col;
    this.row = row;
  }

  get neighbors(): Neighbors {
    if (!this.grid) {
      return NO_NEIGHBORS;
    }
    return this.grid.neighborsOf(this.col, this.row);
  }

  connectsTo(_other: Terrain | null): boolean {
    return false;
  }

  abstract get elevation(): number;
  abstract get sprite(): ImageSource | null;

  abstract onWaterHit(
    column: WaterColumn,
    direction: CardinalDirection,
  ): WallEvent;
  abstract applyHits(count: number): ErosionResult | null;
  abstract applyDelta(amount: number): Terrain;
  abstract resetHits(): void;
  abstract serialize(): SerializedTerrain;
  abstract getRenderInfo(): TileRenderInfo;
}
