import {
  Actor,
  Canvas,
  TileMap,
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
const WET_STAMP_SIZE = 24;
const WET_STAMP_RADIUS = WET_STAMP_SIZE / 2;
const WET_STAMP_FADE = 4;
const WET_STAMP_INSET = (WET_STAMP_SIZE - TILED_TILE_SIZE) / 2;

type SandTileState = "moist" | "cleared";
type SpriteCoord = readonly [number, number];
export type SandLayerRenderMode = "spriteEdges" | "wetPaint";

interface SandLayerOptions {
  renderMode?: SandLayerRenderMode;
}

const MOIST: SpriteCoord = [1, 9];
const N_EDGES: readonly SpriteCoord[] = [
  [1, 4],
  [2, 4],
];
const W_EDGES: readonly SpriteCoord[] = [
  [6, 3],
  [6, 4],
];
const E_EDGES: readonly SpriteCoord[] = [
  [7, 3],
  [7, 4],
];
const NW_OUTER: SpriteCoord = [3, 4];
const NE_OUTER: SpriteCoord = [0, 4];
const WET: SpriteCoord = [2, 9];

export class SandLayer {
  private readonly tilemap: TileMap;
  private readonly spriteSheet: SpriteSheet;
  private readonly states: SandTileState[][];
  private readonly spriteCache = new Map<string, Sprite>();
  private readonly renderMode: SandLayerRenderMode;
  private readonly overlayActor: Actor | null;
  private wetStampCanvas: HTMLCanvasElement | null = null;

  constructor(
    scene: Scene,
    mapX: number,
    mapY: number,
    tileScale: number,
    image: ImageSource,
    options: SandLayerOptions = {},
  ) {
    this.renderMode = options.renderMode ?? "wetPaint";
    this.tilemap = new TileMap({
      tileWidth: TILED_TILE_SIZE,
      tileHeight: TILED_TILE_SIZE,
      columns: GRID_WIDTH,
      rows: TILEMAP_ROWS,
    });
    this.tilemap.pos = vec(mapX, mapY);
    this.tilemap.scale = vec(tileScale, tileScale);
    this.tilemap.z = SAND_LAYER_Z;

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
    this.repaintAll();

    scene.add(this.tilemap);

    this.overlayActor =
      this.renderMode === "wetPaint"
        ? this.buildOverlayActor(mapX, mapY, tileScale)
        : null;
    if (this.overlayActor) {
      scene.add(this.overlayActor);
    }
  }

  coverCell(col: number, gameRow: number): void {
    if (!this.inBounds(col, gameRow)) {
      return;
    }
    if (this.states[gameRow][col] === "cleared") {
      return;
    }
    this.states[gameRow][col] = "cleared";
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        this.repaintCell(col + dc, gameRow + dr);
      }
    }
  }

  /** Full repaint from current state. Use after a wave completes to guarantee
   *  the rendered tiles reflect the cumulative cleared region, not just cells
   *  the most recent wave happened to touch. */
  refresh(): void {
    this.repaintAll();
  }

  reset(): void {
    const initialStates = this.buildInitialStates();
    for (let gameRow = 0; gameRow < TILEMAP_GAME_ROWS; gameRow++) {
      for (let col = 0; col < GRID_WIDTH; col++) {
        this.states[gameRow][col] = initialStates[gameRow][col];
      }
    }
    this.repaintAll();
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

  private repaintAll(): void {
    for (let gameRow = 0; gameRow < TILEMAP_GAME_ROWS; gameRow++) {
      for (let col = 0; col < GRID_WIDTH; col++) {
        this.repaintCell(col, gameRow);
      }
    }
  }

  private repaintCell(col: number, gameRow: number): void {
    if (!this.inBounds(col, gameRow)) {
      return;
    }
    const tile = this.tilemap.getTile(col, gameRow + TILEMAP_OCEAN_ROWS);
    if (!tile) {
      return;
    }
    tile.clearGraphics();
    if (this.states[gameRow][col] === "cleared") {
      return;
    }
    if (this.renderMode === "wetPaint") {
      tile.addGraphic(this.getSprite(MOIST));
      return;
    }
    tile.addGraphic(this.getSprite(this.spriteFor(col, gameRow)));
  }

  private buildOverlayActor(
    mapX: number,
    mapY: number,
    tileScale: number,
  ): Actor {
    const width = GRID_WIDTH * TILED_TILE_SIZE;
    const height = TILEMAP_ROWS * TILED_TILE_SIZE;
    const overlay = new Actor({
      pos: vec(mapX + (width * tileScale) / 2, mapY + (height * tileScale) / 2),
      width,
      height,
    });
    overlay.scale = vec(tileScale, tileScale);
    overlay.z = SAND_LAYER_Z + 0.01;
    overlay.graphics.use(
      new Canvas({
        width,
        height,
        cache: false,
        draw: (ctx) => this.drawOverlay(ctx, width, height),
      }),
    );
    return overlay;
  }

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    ctx.clearRect(0, 0, width, height);
    for (let gameRow = 0; gameRow < TILEMAP_GAME_ROWS; gameRow++) {
      for (let col = 0; col < GRID_WIDTH; col++) {
        if (!this.shouldDrawWetStamp(col, gameRow)) {
          continue;
        }
        this.drawWetStamp(ctx, col, gameRow);
      }
    }
  }

  private drawWetStamp(
    ctx: CanvasRenderingContext2D,
    col: number,
    gameRow: number,
  ): void {
    const stamp = this.getWetStampCanvas();
    if (!stamp) {
      return;
    }
    const x = col * TILED_TILE_SIZE + TILED_TILE_SIZE / 2;
    const y =
      (gameRow + TILEMAP_OCEAN_ROWS) * TILED_TILE_SIZE + TILED_TILE_SIZE / 2;
    ctx.drawImage(stamp, x - WET_STAMP_RADIUS, y - WET_STAMP_RADIUS);
  }

  private shouldDrawWetStamp(col: number, gameRow: number): boolean {
    return (
      this.inBounds(col, gameRow) &&
      this.states[gameRow][col] === "cleared" &&
      this.hasMoistNeighbor(col, gameRow)
    );
  }

  private hasMoistNeighbor(col: number, gameRow: number): boolean {
    return (
      this.isMoistAt(col, gameRow - 1) ||
      this.isMoistAt(col + 1, gameRow) ||
      this.isMoistAt(col, gameRow + 1) ||
      this.isMoistAt(col - 1, gameRow)
    );
  }

  private isMoistAt(col: number, gameRow: number): boolean {
    return this.inBounds(col, gameRow) && this.states[gameRow][col] === "moist";
  }

  private getWetStampCanvas(): HTMLCanvasElement | null {
    if (this.wetStampCanvas) {
      return this.wetStampCanvas;
    }
    const texture = this.getWetTextureCanvas();
    if (!texture) {
      return null;
    }
    const stamp = document.createElement("canvas");
    stamp.width = WET_STAMP_SIZE;
    stamp.height = WET_STAMP_SIZE;
    const stampCtx = stamp.getContext("2d");
    if (!stampCtx) {
      return null;
    }

    stampCtx.drawImage(texture, 0, 0);
    stampCtx.globalCompositeOperation = "destination-in";
    const mask = stampCtx.createImageData(WET_STAMP_SIZE, WET_STAMP_SIZE);
    for (let y = 0; y < WET_STAMP_SIZE; y++) {
      for (let x = 0; x < WET_STAMP_SIZE; x++) {
        const alpha = this.stampOpacityAt(x + 0.5, y + 0.5);
        const index = (y * WET_STAMP_SIZE + x) * 4;
        mask.data[index] = 0;
        mask.data[index + 1] = 0;
        mask.data[index + 2] = 0;
        mask.data[index + 3] = Math.round(alpha * 255);
      }
    }
    stampCtx.putImageData(mask, 0, 0);

    stampCtx.globalCompositeOperation = "source-over";
    this.wetStampCanvas = stamp;
    return stamp;
  }

  private stampOpacityAt(x: number, y: number): number {
    const left = WET_STAMP_INSET;
    const top = WET_STAMP_INSET;
    const right = WET_STAMP_INSET + TILED_TILE_SIZE;
    const bottom = WET_STAMP_INSET + TILED_TILE_SIZE;
    const dx = Math.max(left - x, 0, x - right);
    const dy = Math.max(top - y, 0, y - bottom);
    const distance = Math.hypot(dx, dy);
    if (distance <= 0) {
      return 1;
    }
    if (distance >= WET_STAMP_FADE) {
      return 0;
    }
    const t = 1 - distance / WET_STAMP_FADE;
    return t * t * (3 - 2 * t);
  }

  private getWetTextureCanvas(): HTMLCanvasElement | null {
    const sprite = this.getSprite(WET);
    if (!sprite.image.isLoaded()) {
      return null;
    }
    const tile = document.createElement("canvas");
    tile.width = sprite.sourceView.width;
    tile.height = sprite.sourceView.height;
    const tileCtx = tile.getContext("2d");
    if (!tileCtx) {
      return null;
    }

    tileCtx.drawImage(
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

    const texture = document.createElement("canvas");
    texture.width = WET_STAMP_SIZE;
    texture.height = WET_STAMP_SIZE;
    const textureCtx = texture.getContext("2d");
    if (!textureCtx) {
      return null;
    }
    const pattern = textureCtx.createPattern(tile, "repeat");
    if (pattern) {
      textureCtx.fillStyle = pattern;
      textureCtx.fillRect(0, 0, WET_STAMP_SIZE, WET_STAMP_SIZE);
      return texture;
    }

    for (let y = 0; y < WET_STAMP_SIZE; y += tile.height) {
      for (let x = 0; x < WET_STAMP_SIZE; x += tile.width) {
        textureCtx.drawImage(tile, x, y);
      }
    }
    return texture;
  }

  private spriteFor(col: number, gameRow: number): SpriteCoord {
    const n = this.isClearedAt(col, gameRow - 1);
    const w = this.isClearedAt(col - 1, gameRow);
    const e = this.isClearedAt(col + 1, gameRow);

    // Corners only fire when N is cleared and exactly one side is cleared. The
    // tileset lacks 3-sided/inner-corner sprites, so peninsulas (N+W+E) and
    // diagonal-only cases fall back to edges/plain moist for a blockier look.
    if (n && w && !e) {
      return NW_OUTER;
    }
    if (n && e && !w) {
      return NE_OUTER;
    }
    if (n) {
      return this.variant(col, gameRow, N_EDGES);
    }
    if (w && !e) {
      return this.variant(col, gameRow, W_EDGES);
    }
    if (e && !w) {
      return this.variant(col, gameRow, E_EDGES);
    }
    return MOIST;
  }

  private variant(
    col: number,
    gameRow: number,
    options: readonly SpriteCoord[],
  ): SpriteCoord {
    return options[Math.abs(col * 31 + gameRow * 17) % options.length];
  }

  private isClearedAt(col: number, gameRow: number): boolean {
    if (gameRow < 0) {
      return true;
    }
    if (!this.inBounds(col, gameRow)) {
      return false;
    }
    return this.states[gameRow][col] === "cleared";
  }

  private getSprite(coord: SpriteCoord): Sprite {
    const key = `${coord[0]},${coord[1]}`;
    let sprite = this.spriteCache.get(key);
    if (!sprite) {
      const fetched = this.spriteSheet.getSprite(coord[0], coord[1]);
      if (!fetched) {
        throw new Error(`SandLayer sprite missing at ${key}`);
      }
      sprite = fetched;
      this.spriteCache.set(key, sprite);
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
