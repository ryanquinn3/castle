import { Actor, Canvas, Color, Graphic, ImageSource, Rectangle } from 'excalibur';
import { computeLayout } from '../config.ts';
import { Resources } from '../resources.ts';

const { tileSize: TILE_SIZE, gridLeft, gridTop } = computeLayout(window);

const WALL_TIERS: { min: number; max: number; resource: ImageSource }[] = [
  { min: 1, max: 5, resource: Resources.WallLevel1 },
  { min: 6, max: 10, resource: Resources.WallLevel2 },
  { min: 11, max: 15, resource: Resources.WallLevel3 },
  { min: 16, max: 20, resource: Resources.WallLevel4 },
];

const graphicsCache = new Map<string, Graphic>();
const flatRect = new Rectangle({
  width: TILE_SIZE - 1,
  height: TILE_SIZE - 1,
  color: Color.Transparent,
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Anchor points for the earth-tone elevation palette.
 * Positive elevations: warm brown ramp (darker as height increases).
 * Negative elevations: cool dark brown ramp (darker as depth increases).
 * Elevation 0: sandy tan base.
 */
function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function elevationToColor(elevation: number): Color {
  if (elevation === 0) {
    return Color.fromRGB(210, 180, 140);
  }
  if (elevation > 0) {
    // Positive ramp anchors: +1 -> +5 -> +10
    // +1: (195, 150, 85)   +5: (160, 110, 50)   +10: (100, 65, 20)
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
  // elevation < 0: cool dark brown ramp
  // -1: (130, 105, 75)   -5: (80, 60, 40)   -10: (40, 30, 20)
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
  readonly isCastle: boolean = false;
  readonly col: number;
  readonly row: number;

  constructor(col: number, row: number) {
    const x = gridLeft + (col + 0.5) * TILE_SIZE;
    const y = gridTop + (row + 0.5) * TILE_SIZE;
    super({ x, y, width: TILE_SIZE, height: TILE_SIZE });
    this.col = col;
    this.row = row;
    this.updateVisual();
  }

  updateVisual(neighbors?: PoolNeighbors): void {
    const elevation = this.elevation;
    const puddleDepth = this.puddleDepth;

    if (elevation === 0) {
      this.graphics.use(flatRect);
      return;
    }

    for (const tier of WALL_TIERS) {
      if (elevation >= tier.min && elevation <= tier.max) {
        const cacheKey = `wall${tier.min}:${elevation}`;
        const cached = graphicsCache.get(cacheKey);
        if (cached) {
          this.graphics.use(cached);
          return;
        }
        const sprite = tier.resource.toSprite();
        sprite.width = TILE_SIZE - 1;
        sprite.height = TILE_SIZE - 1;
        const t = (elevation - tier.min) / (tier.max - tier.min);
        const r = 255;
        const g = Math.round(255 - t * 40);
        const b = Math.round(255 - t * 100);
        sprite.tint = Color.fromRGB(r, g, b);
        graphicsCache.set(cacheKey, sprite);
        this.graphics.use(sprite);
        return;
      }
    }

    const nKey = neighbors
      ? `${+neighbors.top}${+neighbors.bottom}${+neighbors.left}${+neighbors.right}`
      : '0000';
    const cacheKey = `${elevation}:${puddleDepth}:${nKey}`;
    const cached = graphicsCache.get(cacheKey);
    if (cached) {
      this.graphics.use(cached);
      return;
    }

    const color = elevationToColor(elevation);
    const r = color.r;
    const g = color.g;
    const b = color.b;
    const size = TILE_SIZE;
    const isHole = elevation < 0;
    const cornerRadius = Math.max(3, Math.floor(size * 0.2));
    const canvas = new Canvas({
      width: size,
      height: size,
      cache: true,
      draw(ctx: CanvasRenderingContext2D) {
        const nr2 = neighbors?.right ?? false;
        const nb = neighbors?.bottom ?? false;
        const fillW = nr2 ? size : size - 1;
        const fillH = nb ? size : size - 1;
        const nt = neighbors?.top ?? false;
        const nl = neighbors?.left ?? false;

        if (isHole) {
          const tl = (!nt && !nl) ? cornerRadius : 0;
          const tr = (!nt && !nr2) ? cornerRadius : 0;
          const br = (!nb && !nr2) ? cornerRadius : 0;
          const bl = (!nb && !nl) ? cornerRadius : 0;
          ctx.beginPath();
          ctx.roundRect(0, 0, fillW, fillH, [tl, tr, br, bl]);
          ctx.save();
          ctx.clip();
        }

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
        if (!nb) { ctx.fillRect(0, size - 2, fillW, 1); }
        if (!nr2) { ctx.fillRect(size - 2, 0, 1, fillH); }

        if (puddleDepth > 0 && elevation < 0) {
          const puddleAlpha = 0.25 + (puddleDepth / -elevation) * 0.45;
          ctx.fillStyle = `rgba(60, 130, 200, ${puddleAlpha})`;
          const px = nl ? 2 : 0;
          const py = nt ? 2 : 0;
          const pw = (nr2 ? size : size - 2) - px;
          const ph = (nb ? size : size - 2) - py;
          ctx.fillRect(px, py, pw, ph);
        }

        if (isHole) {
          ctx.restore();
        }
      },
    });
    graphicsCache.set(cacheKey, canvas);
    this.graphics.use(canvas);
  }
}
