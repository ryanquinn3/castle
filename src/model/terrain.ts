import { Color, type ImageSource } from 'excalibur';
import { MAX_ELEVATION, MIN_ELEVATION, TOWER_HITS_PER_EROSION } from '../config.ts';
import { Resources } from '../resources.ts';
import type { WaterColumn } from './water-column.ts';

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

export interface PoolNeighborFlags {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export interface TileRenderInfo {
  sprite: ImageSource | null;
  tint: Color | null;
  customDraw?: (ctx: CanvasRenderingContext2D, width: number, height: number, neighbors?: PoolNeighborFlags) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function elevationToColor(elevation: number): Color {
  if (elevation === 0) {
    return Color.fromRGB(210, 180, 140);
  }
  if (elevation > 0) {
    if (elevation <= 5) {
      const t = (elevation - 1) / 4;
      return Color.fromRGB(
        lerpChannel(195, 160, t),
        lerpChannel(150, 110, t),
        lerpChannel(85, 50, t),
      );
    } else {
      const t = (elevation - 5) / 5;
      return Color.fromRGB(
        lerpChannel(160, 100, t),
        lerpChannel(110, 65, t),
        lerpChannel(50, 20, t),
      );
    }
  }
  const depth = -elevation;
  if (depth <= 5) {
    const t = (depth - 1) / 4;
    return Color.fromRGB(
      lerpChannel(130, 80, t),
      lerpChannel(105, 60, t),
      lerpChannel(75, 40, t),
    );
  } else {
    const t = (depth - 5) / 5;
    return Color.fromRGB(
      lerpChannel(80, 40, t),
      lerpChannel(60, 30, t),
      lerpChannel(40, 20, t),
    );
  }
}

export abstract class Terrain {
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

export class FlatGround extends Terrain {
  get elevation(): number {
    return 0;
  }

  get sprite(): ImageSource | null {
    return null;
  }

  onWaterHit(
    _column: WaterColumn,
    _direction: CardinalDirection,
  ): WallEvent {
    return null;
  }

  applyHits(_count: number): ErosionResult | null {
    return null;
  }

  applyDelta(amount: number): Terrain {
    if (amount > 0) {
      return new Wall(amount);
    }
    if (amount < 0) {
      return new Hole(-amount);
    }
    return new FlatGround();
  }

  resetHits(): void {}

  serialize(): SerializedTerrain {
    return { type: 'flat', height: 0 };
  }

  getRenderInfo(): TileRenderInfo {
    return { sprite: null, tint: null };
  }
}

export class Wall extends Terrain {
  height: number;
  hitCount: number = 0;

  constructor(height: number) {
    super();
    this.height = Math.min(height, MAX_ELEVATION);
  }

  get elevation(): number {
    return this.height;
  }

  get sprite(): ImageSource | null {
    if (this.height <= 5) {
      return Resources.WallLevel1;
    }
    if (this.height <= 10) {
      return Resources.WallLevel2;
    }
    if (this.height <= 15) {
      return Resources.WallLevel3;
    }
    return Resources.WallLevel4;
  }

  onWaterHit(
    column: WaterColumn,
    _direction: CardinalDirection,
  ): WallEvent {
    if (column.isEmpty()) {
      return null;
    }

    let event: WallEvent = null;

    if (this.height >= column.surfaceLevel) {
      column.surfaceLevel = column.floorLevel;
      event = 'blocked';
    } else if (this.height > column.floorLevel) {
      column.floorLevel = this.height;
      event = 'overtopped';
    }

    if (column.surfaceLevel - this.height >= 2) {
      this.hitCount += 1;
      if (this.hitCount >= 3) {
        this.hitCount -= 3;
        this.height -= 1;
      }
    }

    return event;
  }

  applyHits(count: number): ErosionResult | null {
    this.hitCount += count;
    let eroded = false;
    while (this.hitCount >= 3 && this.height > 0) {
      this.hitCount -= 3;
      this.height -= 1;
      eroded = true;
    }
    return eroded ? { newElevation: this.height } : null;
  }

  applyDelta(amount: number): Terrain {
    const newHeight = this.height + amount;
    if (newHeight <= 0) {
      if (newHeight < 0) {
        return new Hole(Math.min(-newHeight, -MIN_ELEVATION));
      }
      return new FlatGround();
    }
    this.height = Math.min(newHeight, MAX_ELEVATION);
    return this;
  }

  serialize(): SerializedTerrain {
    return { type: 'wall', height: this.height };
  }

  resetHits(): void {
    this.hitCount = 0;
  }

  getRenderInfo(): TileRenderInfo {
    const tiers = [
      { min: 1, max: 5, resource: Resources.WallLevel1 },
      { min: 6, max: 10, resource: Resources.WallLevel2 },
      { min: 11, max: 15, resource: Resources.WallLevel3 },
      { min: 16, max: 20, resource: Resources.WallLevel4 },
    ];
    for (const tier of tiers) {
      if (this.height >= tier.min && this.height <= tier.max) {
        const t = (this.height - tier.min) / (tier.max - tier.min);
        const r = 255;
        const g = Math.round(255 - t * 40);
        const b = Math.round(255 - t * 100);
        return { sprite: tier.resource, tint: Color.fromRGB(r, g, b) };
      }
    }
    return { sprite: null, tint: null };
  }
}

export class Hole extends Terrain {
  depth: number;
  puddleDepth: number = 0;
  hitCount: number = 0;
  neighbors: PoolNeighborFlags = { top: false, bottom: false, left: false, right: false };

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

  onWaterHit(
    _column: WaterColumn,
    _direction: CardinalDirection,
  ): WallEvent {
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
      if (newElevation > 0) {
        return new Wall(Math.min(newElevation, MAX_ELEVATION));
      }
      return new FlatGround();
    }
    this.depth = Math.min(-newElevation, -MIN_ELEVATION);
    this.puddleDepth = Math.min(this.puddleDepth, this.depth);
    return this;
  }

  serialize(): SerializedTerrain {
    return { type: 'hole', height: this.elevation, puddleDepth: this.puddleDepth };
  }

  resetHits(): void {
    this.hitCount = 0;
  }

  getRenderInfo(): TileRenderInfo {
    return {
      sprite: null,
      tint: null,
      customDraw: (ctx, width, height, neighbors) => {
        const elevation = this.elevation;
        const puddleDepth = this.puddleDepth;
        const color = elevationToColor(elevation);
        const r = color.r;
        const g = color.g;
        const b = color.b;
        const cornerRadius = Math.max(3, Math.floor(width * 0.2));

        const nr2 = neighbors?.right ?? false;
        const nb = neighbors?.bottom ?? false;
        const fillW = nr2 ? width : width - 1;
        const fillH = nb ? height : height - 1;
        const nt = neighbors?.top ?? false;
        const nl = neighbors?.left ?? false;

        const tl = (!nt && !nl) ? cornerRadius : 0;
        const tr = (!nt && !nr2) ? cornerRadius : 0;
        const br = (!nb && !nr2) ? cornerRadius : 0;
        const bl = (!nb && !nl) ? cornerRadius : 0;
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
        if (!nt) { ctx.fillRect(0, 0, fillW, 2); }
        if (!nl) { ctx.fillRect(0, 0, 2, fillH); }

        ctx.fillStyle = `rgb(${diffuseR},${diffuseG},${diffuseB})`;
        if (!nb) { ctx.fillRect(0, height - 2, fillW, 1); }
        if (!nr2) { ctx.fillRect(width - 2, 0, 1, fillH); }

        if (puddleDepth > 0 && elevation < 0) {
          const puddleAlpha = 0.25 + (puddleDepth / -elevation) * 0.45;
          ctx.fillStyle = `rgba(60, 130, 200, ${puddleAlpha})`;
          const px = nl ? 2 : 0;
          const py = nt ? 2 : 0;
          const pw = (nr2 ? width : width - 2) - px;
          const ph = (nb ? height : height - 2) - py;
          ctx.fillRect(px, py, pw, ph);
        }

        ctx.restore();
      },
    };
  }
}

export class Tower extends Terrain {
  height: number;
  hitCount: number = 0;

  constructor(height: number) {
    super();
    this.height = Math.min(height, MAX_ELEVATION);
  }

  get elevation(): number {
    return this.height;
  }

  get sprite(): ImageSource | null {
    return Resources.TowerSprite;
  }

  onWaterHit(
    column: WaterColumn,
    _direction: CardinalDirection,
  ): WallEvent {
    if (column.isEmpty()) {
      return null;
    }

    let event: WallEvent = null;

    if (this.height >= column.surfaceLevel) {
      column.surfaceLevel = column.floorLevel;
      event = 'blocked';
    } else if (this.height > column.floorLevel) {
      column.floorLevel = this.height;
      event = 'overtopped';
    }

    if (column.surfaceLevel - this.height >= 2) {
      this.hitCount += 1;
      if (this.hitCount >= TOWER_HITS_PER_EROSION) {
        this.hitCount -= TOWER_HITS_PER_EROSION;
        this.height -= 1;
      }
    }

    return event;
  }

  applyHits(count: number): ErosionResult | null {
    this.hitCount += count;
    let eroded = false;
    while (this.hitCount >= TOWER_HITS_PER_EROSION && this.height > 0) {
      this.hitCount -= TOWER_HITS_PER_EROSION;
      this.height -= 1;
      eroded = true;
    }
    return eroded ? { newElevation: this.height } : null;
  }

  applyDelta(_amount: number): Terrain {
    return this;
  }

  serialize(): SerializedTerrain {
    return { type: 'tower', height: this.height };
  }

  resetHits(): void {
    this.hitCount = 0;
  }

  getRenderInfo(): TileRenderInfo {
    return { sprite: Resources.TowerSprite, tint: null };
  }
}
