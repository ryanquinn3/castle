import {
  TileMap,
  SpriteSheet,
  vec,
  type ImageSource,
  type Scene,
} from "excalibur";
import { GRID_WIDTH, TILEMAP_ROWS, TILEMAP_OCEAN_ROWS } from "../config.ts";

const TILED_TILE_SIZE = 16;
const TILESET_COLS = 12;
const TILESET_ROWS = 10;
const MOIST_COL = 1;
const MOIST_ROW = 9;
const TRANSITION_COL = 2;
const TRANSITION_ROW = 4;
const TRANSITION_GAME_ROW = 2;
const MOIST_START_GAME_ROW = TRANSITION_GAME_ROW + 1;
const SAND_LAYER_Z = -0.5;

export class SandLayer {
  private tilemap: TileMap;

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

    for (let tilemapRow = 0; tilemapRow < TILEMAP_ROWS; tilemapRow++) {
      const gameRow = tilemapRow - TILEMAP_OCEAN_ROWS;
      for (let col = 0; col < GRID_WIDTH; col++) {
        const tile = this.tilemap.getTile(col, tilemapRow);
        if (!tile) {
          continue;
        }
        if (gameRow === TRANSITION_GAME_ROW && transitionSprite) {
          tile.addGraphic(transitionSprite);
        } else if (gameRow >= MOIST_START_GAME_ROW && moistSprite) {
          tile.addGraphic(moistSprite);
        }
      }
    }

    scene.add(this.tilemap);
  }

  clearCell(col: number, gameRow: number): void {
    const tilemapRow = gameRow + TILEMAP_OCEAN_ROWS;
    const tile = this.tilemap.getTile(col, tilemapRow);
    tile?.clearGraphics();
  }
}
