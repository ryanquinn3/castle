import { Actor, Scene, Vector } from "excalibur";
import { CASTLE_HEIGHT, CASTLE_WIDTH, computeLayout } from "../config.ts";
import { Resources } from "../resources.ts";

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);
const CASTLE_OFFSET = new Vector(
  (CASTLE_WIDTH - 1) * TILE_SIZE * 0.5,
  (CASTLE_HEIGHT - 1) * TILE_SIZE * 0.5,
);

export class CastleActor extends Actor {
  constructor(col: number, row: number) {
    super({
      x: GRID_LEFT + (col + 0.5) * TILE_SIZE,
      y: GRID_TOP + (row + 0.5) * TILE_SIZE,
      z: 1,
    });
    const sprite = Resources.Castle.toSprite();
    sprite.width = TILE_SIZE * CASTLE_WIDTH - 1;
    sprite.height = TILE_SIZE * CASTLE_HEIGHT - 1;
    this.graphics.use(sprite);
    this.graphics.offset = CASTLE_OFFSET;
  }
}

// Removes any prior castle overlay from the scene and adds a fresh one. Returns the new actor.
export function placeCastle(scene: Scene, prior: CastleActor | null, col: number, row: number): CastleActor {
  if (prior) {
    scene.remove(prior);
  }
  const actor = new CastleActor(col, row);
  scene.add(actor);
  return actor;
}
