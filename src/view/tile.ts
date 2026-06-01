import { Actor, Canvas, Color, Graphic, Rectangle } from "excalibur";
import { computeLayout } from "../config.ts";
import type { Terrain } from "../model/terrain.ts";

const { tileSize: TILE_SIZE, gridLeft, gridTop } = computeLayout(window);

const graphicsCache = new Map<string, Graphic>();
const flatRect = new Rectangle({
  width: TILE_SIZE - 1,
  height: TILE_SIZE - 1,
  color: Color.Transparent,
});

export interface PoolNeighbors {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export class Tile extends Actor {
  elevation: number = 0;
  puddleDepth: number = 0;
  waveHitCount: number = 0;
  terrain: Terrain | null = null;
  readonly isCastle: boolean;
  readonly col: number;
  readonly row: number;

  constructor(col: number, row: number, isCastle = false) {
    const x = gridLeft + (col + 0.5) * TILE_SIZE;
    const y = gridTop + (row + 0.5) * TILE_SIZE;
    super({ x, y, width: TILE_SIZE, height: TILE_SIZE });
    this.col = col;
    this.row = row;
    this.isCastle = isCastle;
    this.updateVisual();
  }

  updateVisual(neighbors?: PoolNeighbors): void {
    if (!this.terrain || this.elevation === 0) {
      this.graphics.use(flatRect);
      return;
    }

    const info = this.terrain.getRenderInfo();

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
      const nKey = neighbors
        ? `${+neighbors.top}${+neighbors.bottom}${+neighbors.left}${+neighbors.right}`
        : "0000";
      const cacheKey = `${this.elevation}:${this.puddleDepth}:${nKey}`;
      const cached = graphicsCache.get(cacheKey);
      if (cached) {
        this.graphics.use(cached);
        return;
      }
      const canvas = new Canvas({
        width: TILE_SIZE,
        height: TILE_SIZE,
        cache: true,
        draw: (ctx) => info.customDraw!(ctx, TILE_SIZE, TILE_SIZE, neighbors),
      });
      graphicsCache.set(cacheKey, canvas);
      this.graphics.use(canvas);
      return;
    }

    this.graphics.use(flatRect);
  }
}
