import { type ImageSource } from 'excalibur';
import { WALL_LEVEL_ELEVATION, WALL_LEVEL_HP, MAX_WALL_LEVEL } from '../../config.ts';
import { Resources } from '../../resources.ts';
import { Terrain, type CellInfo, type ErosionResult, type SerializedTerrain, type TileRenderInfo } from './terrain.ts';
import { Tower } from './tower.ts';
import { elevationToColor } from './utils.ts';

// Resolution we rasterize each swatch source into. Higher keeps more source
// detail; the pattern is scaled down to WALL_TEXTURE_PERIOD at draw time.
const WALL_SWATCH_RESOLUTION = 512;
// On-screen repeat period in tile-logical px. Controls the texture's feature
// scale (how many tiles before it repeats), independent of source detail.
const WALL_TEXTURE_PERIOD = 32;
const wallSwatches: (HTMLCanvasElement | null)[] = [null, null, null, null];

// Locked wall-rendering visual params (see .tmp/wall-mass-proto.html).
const WALL_BEVEL_STRENGTH = 0.58;
const WALL_BEVEL_WIDTH_PX = 3;
const WALL_CORNER_RADIUS_PX = 10;
const WALL_OUTLINE_DARKNESS = 0.34;
const WALL_DROP_SHADOW = 0.24;

function wallTextureFor(tierIndex: number): ImageSource {
  const textures = [
    Resources.WallSwatch1,
    Resources.WallSwatch2,
    Resources.WallSwatch3,
    Resources.WallSwatch4,
  ];
  return textures[tierIndex] ?? Resources.WallSwatch1; // bounds-safe (tierIndex is 0..3)
}

// Builds and caches a canvas from the prebuilt swatch texture.
// Returns null until the image has loaded; callers fall back to a flat color.
// Each draw creates its own CanvasPattern so per-tile pattern transforms never share state.
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
  swatch.width = WALL_SWATCH_RESOLUTION;
  swatch.height = WALL_SWATCH_RESOLUTION;
  const sctx = swatch.getContext('2d');
  if (!sctx) {
    return null;
  }
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, WALL_SWATCH_RESOLUTION, WALL_SWATCH_RESOLUTION);
  wallSwatches[tierIndex] = swatch;
  return swatch;
}

export class Wall extends Terrain {
  // 1..4 normally; set to 0 only as a transient destroyed sentinel so the grid's
  // `elevation === 0 -> FlatGround` path removes it.
  level: number;
  hp: number;

  constructor(level: number) {
    super();
    this.level = Math.max(1, Math.min(MAX_WALL_LEVEL, Math.round(level)));
    this.hp = WALL_LEVEL_HP[this.level - 1];
  }

  get elevation(): number {
    if (this.level <= 0) {
      return 0;
    }
    return WALL_LEVEL_ELEVATION[this.level - 1];
  }

  get sprite(): ImageSource | null {
    return wallTextureFor(this.tierIndex);
  }

  applyHits(count: number): ErosionResult | null {
    this.hp -= count;
    if (this.hp > 0) {
      return null;
    }
    this.level = 0;
    return { newElevation: 0 };
  }

  applyDelta(_amount: number): Terrain {
    return this;
  }

  resetHits(): void {
    // HP persists across waves and levels; no reset.
  }

  describe(): CellInfo {
    return {
      title: `Wall L${this.level}`,
      stats: [
        { label: "Height", value: String(this.elevation) },
        { label: "HP", value: String(this.hp) },
      ],
    };
  }

  serialize(): SerializedTerrain {
    return { type: 'wall', height: this.elevation, level: this.level, hp: this.hp };
  }

  override connectsTo(other: Terrain | null): boolean {
    return other instanceof Wall || other instanceof Tower;
  }

  private get tierIndex(): number {
    return Math.max(0, this.level - 1);
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
          // Scale the high-res swatch down to the on-screen repeat period, and
          // grid-anchor the phase (in logical px) so the texture is continuous
          // across adjacent tiles of the same wall mass.
          const scale = WALL_TEXTURE_PERIOD / WALL_SWATCH_RESOLUTION;
          const phaseX = (this.col * w) % WALL_TEXTURE_PERIOD;
          const phaseY = (this.row * h) % WALL_TEXTURE_PERIOD;
          pattern.setTransform(new DOMMatrix().translateSelf(-phaseX, -phaseY).scaleSelf(scale));
          ctx.imageSmoothingEnabled = true;
          ctx.fillStyle = pattern;
        } else {
          const fallback = elevationToColor(this.elevation);
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
