import type { ImageSource } from "excalibur";
import { MIN_ELEVATION } from "../../config.ts";
import type { WaterColumn } from "../water-column.ts";
import {
  Terrain,
  type CardinalDirection,
  type ErosionResult,
  type SerializedTerrain,
  type TileRenderInfo,
  type WallEvent,
} from "./terrain.ts";
import { FlatGround } from "./flat-ground.ts";
import { clamp, elevationToColor } from "./utils.ts";

export class Hole extends Terrain {
  depth: number;
  puddleDepth: number = 0;
  hitCount: number = 0;

  constructor(depth: number) {
    super();
    this.depth = Math.min(depth, -MIN_ELEVATION);
  }

  get elevation(): number {
    return -this.depth;
  }

  get effectiveDepth(): number {
    return Math.max(0, this.depth - this.puddleDepth);
  }

  get sprite(): ImageSource | null {
    return null;
  }

  addPuddle(amount: number): void {
    this.puddleDepth = Math.min(this.depth, this.puddleDepth + amount);
  }

  onWaterHit(_column: WaterColumn, _direction: CardinalDirection): WallEvent {
    return null;
  }

  applyHits(count: number): ErosionResult | null {
    this.hitCount += count;
    let eroded = false;
    while (this.hitCount >= 3 && this.depth > 0) {
      this.hitCount -= 3;
      this.depth -= 1;
      eroded = true;
    }
    this.puddleDepth = Math.min(this.puddleDepth, this.depth);
    return eroded ? { newElevation: this.elevation } : null;
  }

  applyDelta(amount: number): Terrain {
    const newElevation = this.elevation + amount;
    if (newElevation >= 0) {
      return new FlatGround();
    }
    this.depth = Math.min(-newElevation, -MIN_ELEVATION);
    this.puddleDepth = Math.min(this.puddleDepth, this.depth);
    return this;
  }

  serialize(): SerializedTerrain {
    return {
      type: "hole",
      height: this.elevation,
      puddleDepth: this.puddleDepth,
    };
  }

  resetHits(): void {
    this.hitCount = 0;
  }

  getRenderInfo(): TileRenderInfo {
    const nb = this.neighbors;
    const nt = nb.north instanceof Hole;
    const nbm = nb.south instanceof Hole;
    const nl = nb.west instanceof Hole;
    const nr2 = nb.east instanceof Hole;
    const cacheKey = `hole:${this.elevation}:${this.puddleDepth}:${+nt}${+nbm}${+nl}${+nr2}`;
    return {
      sprite: null,
      tint: null,
      cacheKey,
      customDraw: (ctx, width, height) => {
        const elevation = this.elevation;
        const puddleDepth = this.puddleDepth;
        const { r, g, b } = elevationToColor(elevation);
        const cornerRadius = Math.max(3, Math.floor(width * 0.2));

        const fillW = nr2 ? width : width - 1;
        const fillH = nbm ? height : height - 1;

        const tl = !nt && !nl ? cornerRadius : 0;
        const tr = !nt && !nr2 ? cornerRadius : 0;
        const br = !nbm && !nr2 ? cornerRadius : 0;
        const bl = !nbm && !nl ? cornerRadius : 0;
        ctx.beginPath();
        ctx.roundRect(0, 0, fillW, fillH, [tl, tr, br, bl]);
        ctx.save();
        ctx.clip();

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, 0, fillW, fillH);

        const shadowR = clamp(r - 60, 0, 255);
        const shadowG = clamp(g - 60, 0, 255);
        const shadowB = clamp(b - 60, 0, 255);
        const diffuseR = clamp(r + 30, 0, 255);
        const diffuseG = clamp(g + 30, 0, 255);
        const diffuseB = clamp(b + 30, 0, 255);

        ctx.fillStyle = `rgb(${shadowR},${shadowG},${shadowB})`;
        if (!nt) {
          ctx.fillRect(0, 0, fillW, 2);
        }
        if (!nl) {
          ctx.fillRect(0, 0, 2, fillH);
        }

        ctx.fillStyle = `rgb(${diffuseR},${diffuseG},${diffuseB})`;
        if (!nbm) {
          ctx.fillRect(0, height - 2, fillW, 1);
        }
        if (!nr2) {
          ctx.fillRect(width - 2, 0, 1, fillH);
        }

        if (puddleDepth > 0 && elevation < 0) {
          const puddleAlpha = 0.25 + (puddleDepth / -elevation) * 0.45;
          ctx.fillStyle = `rgba(60, 130, 200, ${puddleAlpha})`;
          ctx.fillRect(0, 0, width, height);
        }

        ctx.restore();
      },
    };
  }
}
