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
const MOIST_COL = 1;
const MOIST_ROW = 9;
const TRANSITION_COL = 2;
const TRANSITION_ROW = 4;
const INITIAL_TRANSITION_GAME_ROW = 2;
const MOIST_START_GAME_ROW = INITIAL_TRANSITION_GAME_ROW + 1;
const SAND_LAYER_Z = -0.5;
const TILEMAP_GAME_ROWS = TILEMAP_ROWS - TILEMAP_OCEAN_ROWS;

type SandTileState = "moist" | "transition" | "cleared";

export class SandLayer {
  private readonly tilemap: TileMap;
  private readonly moistSprite: Sprite;
  private readonly transitionSprite: Sprite;
  private readonly states: SandTileState[][];

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

    const spriteSheet = SpriteSheet.fromImageSource({
      image,
      grid: {
        rows: TILESET_ROWS,
        columns: TILESET_COLS,
        spriteWidth: TILED_TILE_SIZE,
        spriteHeight: TILED_TILE_SIZE,
      },
    });
    const moistSprite = spriteSheet.getSprite(MOIST_COL, MOIST_ROW);
    const transitionSprite = spriteSheet.getSprite(
      TRANSITION_COL,
      TRANSITION_ROW,
    );
    if (!moistSprite || !transitionSprite) {
      throw new Error("SandLayer sprite indices out of range for tileset");
    }
    this.moistSprite = moistSprite;
    this.transitionSprite = transitionSprite;

    this.states = this.buildInitialStates();
    this.paintInitialTiles();

    scene.add(this.tilemap);
  }

  coverCell(col: number, gameRow: number): void {
    if (!this.inBounds(col, gameRow)) {
      return;
    }
    if (this.states[gameRow][col] !== "transition") {
      return;
    }
    this.setTile(col, gameRow, "cleared");
    const nextRow = gameRow + 1;
    if (this.inBounds(col, nextRow) && this.states[nextRow][col] === "moist") {
      this.setTile(col, nextRow, "transition");
    }
  }

  private buildInitialStates(): SandTileState[][] {
    const states: SandTileState[][] = [];
    for (let gameRow = 0; gameRow < TILEMAP_GAME_ROWS; gameRow++) {
      const rowStates: SandTileState[] = [];
      for (let col = 0; col < GRID_WIDTH; col++) {
        rowStates.push(this.initialStateFor(gameRow));
      }
      states.push(rowStates);
    }
    return states;
  }

  private initialStateFor(gameRow: number): SandTileState {
    if (gameRow === INITIAL_TRANSITION_GAME_ROW) {
      return "transition";
    }
    if (gameRow >= MOIST_START_GAME_ROW) {
      return "moist";
    }
    return "cleared";
  }

  private paintInitialTiles(): void {
    for (let gameRow = 0; gameRow < TILEMAP_GAME_ROWS; gameRow++) {
      for (let col = 0; col < GRID_WIDTH; col++) {
        this.paintTile(col, gameRow, this.states[gameRow][col]);
      }
    }
  }

  private setTile(col: number, gameRow: number, state: SandTileState): void {
    this.states[gameRow][col] = state;
    this.paintTile(col, gameRow, state);
  }

  private paintTile(col: number, gameRow: number, state: SandTileState): void {
    const tile = this.tilemap.getTile(col, gameRow + TILEMAP_OCEAN_ROWS);
    if (!tile) {
      return;
    }
    tile.clearGraphics();
    if (state === "transition") {
      tile.addGraphic(this.transitionSprite);
    } else if (state === "moist") {
      tile.addGraphic(this.moistSprite);
    }
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
