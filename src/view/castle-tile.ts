import { Vector } from 'excalibur';
import { Resources } from '../resources.ts';
import { computeLayout, CASTLE_WIDTH, CASTLE_HEIGHT } from '../config.ts';

const { tileSize: TILE_SIZE } = computeLayout(window);
import { Tile } from './tile.ts';

const CASTLE_OFFSET = new Vector(
  (CASTLE_WIDTH - 1) * TILE_SIZE * 0.5,
  (CASTLE_HEIGHT - 1) * TILE_SIZE * 0.5,
);

export class CastleTile extends Tile {
  constructor(col: number, row: number) {
    super(col, row, true);
  }

  override updateVisual(): void {
    const sprite = Resources.Castle.toSprite();
    sprite.width = TILE_SIZE * CASTLE_WIDTH - 1;
    sprite.height = TILE_SIZE * CASTLE_HEIGHT - 1;
    this.graphics.use(sprite);
    this.graphics.offset = CASTLE_OFFSET;
  }
}
