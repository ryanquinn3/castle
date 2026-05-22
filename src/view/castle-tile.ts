import { Resources } from '../resources.ts';
import { TILE_SIZE } from '../config.ts';
import { Tile } from './tile.ts';

export class CastleTile extends Tile {
  override readonly isCastle = true;

  constructor(col: number, row: number) {
    super(col, row);
    this.updateVisual();
  }

  override updateVisual(): void {
    const sprite = Resources.Castle.toSprite();
    sprite.width = TILE_SIZE - 1;
    sprite.height = TILE_SIZE - 1;
    this.graphics.use(sprite);
  }
}
