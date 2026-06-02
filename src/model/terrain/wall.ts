import { type ImageSource } from 'excalibur';
import { MAX_ELEVATION, MIN_ELEVATION } from '../../config.ts';
import { Resources } from '../../resources.ts';
import type { WaterColumn } from '../water-column.ts';
import { Terrain, type CardinalDirection, type ErosionResult, type SerializedTerrain, type TileRenderInfo, type WallEvent } from './terrain.ts';
import { FlatGround } from './flat-ground.ts';
import { Hole } from './hole.ts';
import { Tower } from './tower.ts';
import { elevationToColor } from './utils.ts';

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
