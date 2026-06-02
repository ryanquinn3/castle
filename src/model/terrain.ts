import { Color, type ImageSource, type Sprite } from 'excalibur';
import { MAX_ELEVATION, MIN_ELEVATION, TOWER_HITS_PER_EROSION } from '../config.ts';
import { Resources } from '../resources.ts';

const WALL_TEXTURE_SWATCH = 64;
const wallSwatches: (HTMLCanvasElement | null)[] = [null, null, null, null];

// Locked wall-rendering visual params (see .tmp/wall-mass-proto.html).
const WALL_BEVEL_STRENGTH = 0.58;
const WALL_BEVEL_WIDTH_PX = 3;
const WALL_CORNER_RADIUS_PX = 10;
const WALL_OUTLINE_DARKNESS = 0.34;
const WALL_DROP_SHADOW = 0.24;

function wallTextureFor(tierIndex: number): ImageSource {
  const textures = [
    Resources.WallLevel1,
    Resources.WallLevel2,
    Resources.WallLevel3,
    Resources.WallLevel4,
  ];
  return textures[tierIndex] ?? Resources.WallLevel1; // bounds-safe (tierIndex is 0..3)
}

// Builds (and caches) a 64x64 cropped swatch canvas from the tier texture.
// Returns null until the image has loaded; callers fall back to a flat color.
// The swatch (the expensive crop) is cached; each draw creates its own
// CanvasPattern from it so per-tile pattern transforms never share state.
function getWallSwatch(tierIndex: number): HTMLCanvasElement | null {
  const existing = wallSwatches[tierIndex];
  if (existing) {
    return existing;
  }
  const source = wallTextureFor(tierIndex);
  if (!source.isLoaded()) {
    return null;
  }
  const img = source.image;
  const swatch = document.createElement('canvas');
  swatch.width = WALL_TEXTURE_SWATCH;
  swatch.height = WALL_TEXTURE_SWATCH;
  const sctx = swatch.getContext('2d');
  if (!sctx) {
    return null;
  }
  sctx.imageSmoothingEnabled = false;
  const sx = Math.floor(img.width * 0.18);
  const sw = Math.floor(img.width * 0.64);
  const sy = Math.floor(img.height * 0.42);
  const sh = Math.floor(img.height * 0.5);
  sctx.drawImage(img, sx, sy, sw, sh, 0, 0, WALL_TEXTURE_SWATCH, WALL_TEXTURE_SWATCH);
  wallSwatches[tierIndex] = swatch;
  return swatch;
}

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
    return wallTextureFor(this.tierIndex);
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

  override connectsTo(other: Terrain | null): boolean {
    return other instanceof Wall || other instanceof Tower;
  }

  private get tierIndex(): number {
    if (this.height <= 5) { return 0; }
    if (this.height <= 10) { return 1; }
    if (this.height <= 15) { return 2; }
    return 3;
  }

  getRenderInfo(): TileRenderInfo {
    const tier = this.tierIndex;
    const nb = this.neighbors;
    const cN = this.connectsTo(nb.north);
    const cS = this.connectsTo(nb.south);
    const cE = this.connectsTo(nb.east);
    const cW = this.connectsTo(nb.west);
    const mask = `${+cN}${+cS}${+cE}${+cW}`;
    // Position is in the key because the grid-anchored pattern phase depends on it.
    const cacheKey = `wall:${tier}:${mask}:${this.col}:${this.row}`;

    return {
      sprite: null,
      tint: null,
      cacheKey,
      customDraw: (ctx, w, h) => {
        const tl = (!cN && !cW) ? WALL_CORNER_RADIUS_PX : 0;
        const tr = (!cN && !cE) ? WALL_CORNER_RADIUS_PX : 0;
        const br = (!cS && !cE) ? WALL_CORNER_RADIUS_PX : 0;
        const bl = (!cS && !cW) ? WALL_CORNER_RADIUS_PX : 0;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, [tl, tr, br, bl]);
        ctx.clip();

        const swatch = getWallSwatch(tier);
        const pattern = swatch ? ctx.createPattern(swatch, 'repeat') : null;
        if (pattern) {
          const phaseX = (this.col * w) % WALL_TEXTURE_SWATCH;
          const phaseY = (this.row * h) % WALL_TEXTURE_SWATCH;
          pattern.setTransform(new DOMMatrix().translateSelf(-phaseX, -phaseY));
          ctx.fillStyle = pattern;
        } else {
          const fallback = elevationToColor(this.height);
          ctx.fillStyle = `rgb(${fallback.r},${fallback.g},${fallback.b})`;
        }
        ctx.fillRect(0, 0, w, h);

        // Bevel: sun from the north. Highlight on exposed north edge; the south
        // sliver carries both the bevel shadow and the (folded-in) drop shadow.
        if (!cN) {
          ctx.fillStyle = `rgba(255,250,235,${WALL_BEVEL_STRENGTH})`;
          ctx.fillRect(0, 0, w, WALL_BEVEL_WIDTH_PX);
        }
        if (!cS) {
          ctx.fillStyle = `rgba(0,0,0,${Math.min(1, WALL_BEVEL_STRENGTH * 0.85 + WALL_DROP_SHADOW)})`;
          ctx.fillRect(0, h - WALL_BEVEL_WIDTH_PX, w, WALL_BEVEL_WIDTH_PX);
        }

        ctx.restore();

        // Outline each exposed edge as a straight segment (corners intentionally not arced — matches prototype).
        ctx.strokeStyle = `rgba(40,25,10,${WALL_OUTLINE_DARKNESS})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (!cN) { ctx.moveTo(tl, 0.5); ctx.lineTo(w - tr, 0.5); }
        if (!cS) { ctx.moveTo(bl, h - 0.5); ctx.lineTo(w - br, h - 0.5); }
        if (!cW) { ctx.moveTo(0.5, tl); ctx.lineTo(0.5, h - bl); }
        if (!cE) { ctx.moveTo(w - 0.5, tr); ctx.lineTo(w - 0.5, h - br); }
        ctx.stroke();
      },
    };
  }
}

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
        const color = elevationToColor(elevation);
        const r = color.r;
        const g = color.g;
        const b = color.b;
        const cornerRadius = Math.max(3, Math.floor(width * 0.2));

        const fillW = nr2 ? width : width - 1;
        const fillH = nbm ? height : height - 1;

        const tl = (!nt && !nl) ? cornerRadius : 0;
        const tr = (!nt && !nr2) ? cornerRadius : 0;
        const br = (!nbm && !nr2) ? cornerRadius : 0;
        const bl = (!nbm && !nl) ? cornerRadius : 0;
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
        if (!nbm) { ctx.fillRect(0, height - 2, fillW, 1); }
        if (!nr2) { ctx.fillRect(width - 2, 0, 1, fillH); }

        if (puddleDepth > 0 && elevation < 0) {
          const puddleAlpha = 0.25 + (puddleDepth / -elevation) * 0.45;
          ctx.fillStyle = `rgba(60, 130, 200, ${puddleAlpha})`;
          const px = nl ? 2 : 0;
          const py = nt ? 2 : 0;
          const pw = (nr2 ? width : width - 2) - px;
          const ph = (nbm ? height : height - 2) - py;
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

  override connectsTo(other: Terrain | null): boolean {
    return other instanceof Wall || other instanceof Tower;
  }

  getRenderInfo(): TileRenderInfo {
    return { sprite: Resources.TowerSprite.toSprite(), tint: null };
  }
}
