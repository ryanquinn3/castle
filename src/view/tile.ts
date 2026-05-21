import { Actor, Canvas, Color, Graphic, Rectangle } from 'excalibur';
import { TILE_SIZE, GRID_LEFT, GRID_TOP } from '../config';

const gridLeft = GRID_LEFT;
const gridTop = GRID_TOP;

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

export function elevationToColor(elevation: number): Color {
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
    const canvas = new Canvas({
      width: size,
      height: size,
      cache: true,
      draw(ctx: CanvasRenderingContext2D) {
        const nr2 = neighbors?.right ?? false;
        const nb = neighbors?.bottom ?? false;
        const fillW = nr2 ? size : size - 1;
        const fillH = nb ? size : size - 1;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, 0, fillW, fillH);

        if (elevation > 0) {
          const lightR = clamp(r + 60, 0, 255);
          const lightG = clamp(g + 60, 0, 255);
          const lightB = clamp(b + 60, 0, 255);
          const darkR = clamp(r - 60, 0, 255);
          const darkG = clamp(g - 60, 0, 255);
          const darkB = clamp(b - 60, 0, 255);

          ctx.fillStyle = `rgb(${lightR},${lightG},${lightB})`;
          ctx.fillRect(0, 0, size - 1, 2);
          ctx.fillRect(0, 0, 2, size - 1);

          ctx.fillStyle = `rgb(${darkR},${darkG},${darkB})`;
          ctx.fillRect(0, size - 3, size - 1, 2);
          ctx.fillRect(size - 3, 0, 2, size - 1);
        } else {
          const shadowR = clamp(r - 60, 0, 255);
          const shadowG = clamp(g - 60, 0, 255);
          const shadowB = clamp(b - 60, 0, 255);
          const diffuseR = clamp(r + 30, 0, 255);
          const diffuseG = clamp(g + 30, 0, 255);
          const diffuseB = clamp(b + 30, 0, 255);

          const nt = neighbors?.top ?? false;
          const nl = neighbors?.left ?? false;

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
        }
      },
    });
    graphicsCache.set(cacheKey, canvas);
    this.graphics.use(canvas);
  }
}
