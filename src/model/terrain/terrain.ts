import {
  Actor,
  Canvas,
  Color,
  CollisionType,
  type Graphic,
  type ImageSource,
  Rectangle,
  type Sprite,
  type ActorArgs,
} from "excalibur";

import { computeLayout } from "../../config.ts";

// Since the terrain→Actor migration this module reads `window` and requires a browser context.
// It is intentionally no longer importable from pure Node (e.g. unit tests that run in jsdom are fine).
const {
  tileSize: TILE_SIZE,
  gridLeft: GRID_LEFT,
  gridTop: GRID_TOP,
} = computeLayout(window);

const graphicsCache = new Map<string, Graphic>();
const flatRect = new Rectangle({
  width: TILE_SIZE - 1,
  height: TILE_SIZE - 1,
  color: Color.Transparent,
});

export interface SerializedTerrain {
  type: string;
  height: number;
  [key: string]: unknown;
}

export interface CellStat {
  label: string;
  value: string;
}

export interface CellInfo {
  title: string;
  stats: CellStat[];
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

const NO_NEIGHBORS: Neighbors = {
  north: null,
  south: null,
  east: null,
  west: null,
};

export interface TileRenderInfo {
  sprite: Sprite | null;
  tint: Color | null;
  cacheKey?: string;
  customDraw?: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void;
}

export abstract class Terrain extends Actor {
  private grid: NeighborGrid | null = null;
  col = -1;
  row = -1;

  constructor(args?: ActorArgs) {
    const {
      width = TILE_SIZE,
      height = TILE_SIZE,
      collisionType = CollisionType.Passive,
    } = args ?? {};

    super({
      width,
      height,
      collisionType,
    });
  }

  attach(grid: NeighborGrid, col: number, row: number): void {
    this.grid = grid;
    this.col = col;
    this.row = row;
    this.pos.x = GRID_LEFT + (col + 0.5) * TILE_SIZE;
    this.pos.y = GRID_TOP + (row + 0.5) * TILE_SIZE;
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

  syncGraphic(): void {
    if (this.elevation === 0) {
      this.graphics.use(flatRect);
      return;
    }

    const info = this.getRenderInfo();

    if (info.sprite && !info.customDraw) {
      const sprite = info.sprite.clone();
      sprite.width = TILE_SIZE;
      sprite.height = TILE_SIZE;
      if (info.tint) {
        sprite.tint = info.tint;
      }
      this.graphics.use(sprite);
      return;
    }

    if (info.customDraw) {
      const cacheKey =
        info.cacheKey ?? `${this.col}:${this.row}:${this.elevation}`;
      const cached = graphicsCache.get(cacheKey);
      if (cached) {
        this.graphics.use(cached);
        return;
      }
      const canvas = new Canvas({
        width: TILE_SIZE,
        height: TILE_SIZE,
        quality: 3,
        cache: true,
        draw: (ctx) => info.customDraw!(ctx, TILE_SIZE, TILE_SIZE),
      });
      graphicsCache.set(cacheKey, canvas);
      this.graphics.use(canvas);
      return;
    }

    this.graphics.use(flatRect);
  }

  abstract get elevation(): number;
  abstract get sprite(): ImageSource | null;

  abstract applyHits(count: number): ErosionResult | null;
  abstract applyDelta(amount: number): Terrain;
  abstract resetHits(): void;
  abstract serialize(): SerializedTerrain;
  abstract getRenderInfo(): TileRenderInfo;
  abstract describe(): CellInfo;
}
