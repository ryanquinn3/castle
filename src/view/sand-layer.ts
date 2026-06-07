import {
  Actor,
  Canvas,
  SpriteSheet,
  vec,
  type ImageSource,
  type Scene,
  type Sprite,
} from "excalibur";
import { GRID_WIDTH, TILEMAP_ROWS, TILEMAP_OCEAN_ROWS } from "../config.ts";

const TILED_TILE_SIZE = 16;
const TILESET_COLS = 12;
const TILESET_ROWS = 10;
const SAND_LAYER_Z = -0.5;
const TILEMAP_GAME_ROWS = TILEMAP_ROWS - TILEMAP_OCEAN_ROWS;
const INITIAL_MOIST_GAME_ROW = 2;

// The moist region is a grid of cells, so its boundary is naturally blocky. To
// avoid hard square tile-steps we render it through a coverage mask that is
// blurred (to round corners) then thresholded (to recover a defined edge). The
// blur radius is ~half a tile; the threshold turns the soft blur back into a
// crisp-but-rounded waterline.
const MOIST_BLUR_RADIUS = 7;
const MOIST_EDGE_MID = 0.5;
const MOIST_EDGE_SOFTNESS = 0.25;
// Pad the coverage and clamp its border outward before blurring so the board's
// outer edges stay flush; only the moist/dry seam rounds, not the board corners.
const MOIST_EDGE_PAD = MOIST_BLUR_RADIUS * 3;

type SandTileState = "moist" | "cleared";
type SpriteCoord = readonly [number, number];

const MOIST: SpriteCoord = [1, 9];

export class SandLayer {
  private readonly spriteSheet: SpriteSheet;
  private readonly states: SandTileState[][];
  private readonly overlay: Actor;
  private readonly boardWidth = GRID_WIDTH * TILED_TILE_SIZE;
  private readonly boardHeight = TILEMAP_ROWS * TILED_TILE_SIZE;
  private moistTexture: HTMLCanvasElement | null = null;
  private moistRender: HTMLCanvasElement | null = null;
  private dirty = true;

  constructor(
    scene: Scene,
    mapX: number,
    mapY: number,
    tileScale: number,
    image: ImageSource,
  ) {
    this.spriteSheet = SpriteSheet.fromImageSource({
      image,
      grid: {
        rows: TILESET_ROWS,
        columns: TILESET_COLS,
        spriteWidth: TILED_TILE_SIZE,
        spriteHeight: TILED_TILE_SIZE,
      },
    });

    this.states = this.buildInitialStates();
    this.overlay = this.buildOverlay(mapX, mapY, tileScale);
    scene.add(this.overlay);
  }

  coverCell(col: number, gameRow: number): void {
    if (!this.inBounds(col, gameRow)) {
      return;
    }
    if (this.states[gameRow][col] === "cleared") {
      return;
    }
    this.states[gameRow][col] = "cleared";
    this.dirty = true;
  }

  /** Force a re-render from current state. Used after a wave completes. */
  refresh(): void {
    this.dirty = true;
  }

  reset(): void {
    const initialStates = this.buildInitialStates();
    for (let gameRow = 0; gameRow < TILEMAP_GAME_ROWS; gameRow++) {
      for (let col = 0; col < GRID_WIDTH; col++) {
        this.states[gameRow][col] = initialStates[gameRow][col];
      }
    }
    this.dirty = true;
  }

  /** The smoothed moist render in board pixels, rebuilt on demand. Exposed so
   *  rendering can be asserted directly without scraping the live canvas. */
  renderToCanvas(): HTMLCanvasElement | null {
    if (this.dirty || !this.moistRender) {
      const built = this.buildMoistRender();
      if (built) {
        this.moistRender = built;
        this.dirty = false;
      }
    }
    return this.moistRender;
  }

  private buildInitialStates(): SandTileState[][] {
    const states: SandTileState[][] = [];
    for (let gameRow = 0; gameRow < TILEMAP_GAME_ROWS; gameRow++) {
      const rowStates: SandTileState[] = [];
      for (let col = 0; col < GRID_WIDTH; col++) {
        rowStates.push(gameRow >= INITIAL_MOIST_GAME_ROW ? "moist" : "cleared");
      }
      states.push(rowStates);
    }
    return states;
  }

  private buildOverlay(mapX: number, mapY: number, tileScale: number): Actor {
    const overlay = new Actor({
      pos: vec(
        mapX + (this.boardWidth * tileScale) / 2,
        mapY + (this.boardHeight * tileScale) / 2,
      ),
      width: this.boardWidth,
      height: this.boardHeight,
    });
    overlay.scale = vec(tileScale, tileScale);
    overlay.z = SAND_LAYER_Z;
    overlay.graphics.use(
      new Canvas({
        width: this.boardWidth,
        height: this.boardHeight,
        cache: false,
        draw: (ctx) => this.drawMoist(ctx),
      }),
    );
    return overlay;
  }

  private drawMoist(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.boardWidth, this.boardHeight);
    const render = this.renderToCanvas();
    if (render) {
      ctx.drawImage(render, 0, 0);
    }
  }

  private buildMoistRender(): HTMLCanvasElement | null {
    const texture = this.getMoistTexture();
    if (!texture) {
      return null;
    }

    const coverage = this.buildCoverageMask();
    const rounded = this.roundCoverage(coverage);
    if (!rounded) {
      return null;
    }

    // Paint the moist texture through the rounded mask.
    const render = this.createBoardCanvas();
    const renderCtx = render.getContext("2d");
    if (!renderCtx) {
      return null;
    }
    const pattern = renderCtx.createPattern(texture, "repeat");
    if (pattern) {
      renderCtx.fillStyle = pattern;
      renderCtx.fillRect(0, 0, this.boardWidth, this.boardHeight);
    }
    renderCtx.globalCompositeOperation = "destination-in";
    renderCtx.drawImage(rounded, 0, 0);
    return render;
  }

  // Solid coverage: one filled square per moist cell.
  private buildCoverageMask(): HTMLCanvasElement {
    const mask = this.createBoardCanvas();
    const ctx = mask.getContext("2d");
    if (!ctx) {
      return mask;
    }
    ctx.fillStyle = "#fff";
    for (let gameRow = 0; gameRow < TILEMAP_GAME_ROWS; gameRow++) {
      for (let col = 0; col < GRID_WIDTH; col++) {
        if (this.states[gameRow][col] !== "moist") {
          continue;
        }
        const y = (gameRow + TILEMAP_OCEAN_ROWS) * TILED_TILE_SIZE;
        ctx.fillRect(col * TILED_TILE_SIZE, y, TILED_TILE_SIZE, TILED_TILE_SIZE);
      }
    }
    return mask;
  }

  // Round the blocky coverage into a smooth edge: clamp the border outward into
  // a padding margin (so the board's own edges stay flush), blur to round the
  // corners, then threshold to recover a defined edge. Returns a board-sized
  // mask cropped back out of the padded working canvas.
  private roundCoverage(coverage: HTMLCanvasElement): HTMLCanvasElement | null {
    const pad = MOIST_EDGE_PAD;
    const w = this.boardWidth;
    const h = this.boardHeight;
    const padded = this.createCanvas(w + pad * 2, h + pad * 2);
    const pctx = padded.getContext("2d");
    if (!pctx) {
      return null;
    }
    pctx.drawImage(coverage, pad, pad);
    // Edge clamp: stretch the 1px borders and corners into the padding.
    pctx.drawImage(coverage, 0, 0, w, 1, pad, 0, w, pad);
    pctx.drawImage(coverage, 0, h - 1, w, 1, pad, pad + h, w, pad);
    pctx.drawImage(coverage, 0, 0, 1, h, 0, pad, pad, h);
    pctx.drawImage(coverage, w - 1, 0, 1, h, pad + w, pad, pad, h);
    pctx.drawImage(coverage, 0, 0, 1, 1, 0, 0, pad, pad);
    pctx.drawImage(coverage, w - 1, 0, 1, 1, pad + w, 0, pad, pad);
    pctx.drawImage(coverage, 0, h - 1, 1, 1, 0, pad + h, pad, pad);
    pctx.drawImage(coverage, w - 1, h - 1, 1, 1, pad + w, pad + h, pad, pad);

    const blurred = this.createCanvas(padded.width, padded.height);
    const bctx = blurred.getContext("2d");
    if (!bctx) {
      return null;
    }
    bctx.filter = `blur(${MOIST_BLUR_RADIUS}px)`;
    bctx.drawImage(padded, 0, 0);
    bctx.filter = "none";
    this.thresholdAlpha(blurred);

    const rounded = this.createBoardCanvas();
    const rctx = rounded.getContext("2d");
    if (!rctx) {
      return null;
    }
    rctx.drawImage(blurred, pad, pad, w, h, 0, 0, w, h);
    return rounded;
  }

  // Push each pixel's alpha away from the midpoint so a blurred mask becomes a
  // rounded but crisp edge.
  private thresholdAlpha(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    for (let i = 3; i < data.length; i += 4) {
      const alpha = data[i] / 255;
      const ramped = (alpha - MOIST_EDGE_MID) / MOIST_EDGE_SOFTNESS + 0.5;
      const clamped = Math.max(0, Math.min(1, ramped));
      data[i] = Math.round(clamped * 255);
    }
    ctx.putImageData(image, 0, 0);
  }

  private getMoistTexture(): HTMLCanvasElement | null {
    if (this.moistTexture) {
      return this.moistTexture;
    }
    const sprite = this.getSprite(MOIST);
    if (!sprite.image.isLoaded()) {
      return null;
    }
    const tile = document.createElement("canvas");
    tile.width = sprite.sourceView.width;
    tile.height = sprite.sourceView.height;
    const ctx = tile.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.drawImage(
      sprite.image.image,
      sprite.sourceView.x,
      sprite.sourceView.y,
      sprite.sourceView.width,
      sprite.sourceView.height,
      0,
      0,
      sprite.sourceView.width,
      sprite.sourceView.height,
    );
    this.moistTexture = tile;
    return tile;
  }

  private createBoardCanvas(): HTMLCanvasElement {
    return this.createCanvas(this.boardWidth, this.boardHeight);
  }

  private createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  private getSprite(coord: SpriteCoord): Sprite {
    const sprite = this.spriteSheet.getSprite(coord[0], coord[1]);
    if (!sprite) {
      throw new Error(`SandLayer sprite missing at ${coord[0]},${coord[1]}`);
    }
    return sprite;
  }

  private inBounds(col: number, gameRow: number): boolean {
    return (
      col >= 0 &&
      col < GRID_WIDTH &&
      gameRow >= 0 &&
      gameRow < TILEMAP_GAME_ROWS
    );
  }
}
