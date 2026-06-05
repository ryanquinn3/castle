import {
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

type SandTileState = "moist" | "cleared";
type SpriteCoord = readonly [number, number];

const MOIST: SpriteCoord = [1, 9];
const N_EDGES: readonly SpriteCoord[] = [
  [1, 3],
  [2, 3],
];
const W_EDGES: readonly SpriteCoord[] = [
  [7, 3],
  [7, 4],
];
const E_EDGES: readonly SpriteCoord[] = [
  [6, 3],
  [6, 4],
];
const NW_OUTER: SpriteCoord = [0, 3];
const NE_OUTER: SpriteCoord = [3, 3];
const NW_INNER: SpriteCoord = [4, 3];
const NE_INNER: SpriteCoord = [5, 3];

export class SandLayer {
  private readonly tilemap: TileMap;
  private readonly spriteSheet: SpriteSheet;
  private readonly states: SandTileState[][];
  private readonly spriteCache = new Map<string, Sprite>();

  constructor(
    scene: Scene,
    mapX: number,
    mapY: number,
    tileScale: number,
    image: ImageSource,
  ) {
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
    tile.addGraphic(this.getSprite(this.spriteFor(col, gameRow)));
  }

  private spriteFor(col: number, gameRow: number): SpriteCoord {
    const n = this.isClearedAt(col, gameRow - 1);
    const w = this.isClearedAt(col - 1, gameRow);
    const e = this.isClearedAt(col + 1, gameRow);
    const nw = this.isClearedAt(col - 1, gameRow - 1);
    const ne = this.isClearedAt(col + 1, gameRow - 1);

    if (n && w) {
      return NW_OUTER;
    }
    if (n && e) {
      return NE_OUTER;
    }
    if (n) {
      return this.variant(col, gameRow, N_EDGES);
    }
    if (w) {
      return this.variant(col, gameRow, W_EDGES);
    }
    if (e) {
      return this.variant(col, gameRow, E_EDGES);
    }
    if (nw) {
      return NW_INNER;
    }
    if (ne) {
      return NE_INNER;
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
