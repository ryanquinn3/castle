import { Actor, Color, Vector, type Scene } from 'excalibur';
import type { Terrain } from '../model/terrain/terrain.ts';
import { TILE_SIZE, GRID_LEFT, GRID_TOP } from '../config.ts';

export async function flashErodedTiles(
  scene: Scene,
  tiles: Terrain[],
  delay: (ms: number) => Promise<void>,
): Promise<void> {
  if (tiles.length === 0) {
    return;
  }

  const actors: Actor[] = [];
  for (const tile of tiles) {
    const actor = new Actor({
      pos: new Vector(
        GRID_LEFT + tile.col * TILE_SIZE + TILE_SIZE / 2,
        GRID_TOP + tile.row * TILE_SIZE + TILE_SIZE / 2,
      ),
      width: TILE_SIZE - 1,
      height: TILE_SIZE - 1,
      color: Color.fromRGB(255, 140, 0, 0.7),
    });
    scene.add(actor);
    actors.push(actor);
  }

  await delay(350);

  for (const actor of actors) {
    scene.remove(actor);
  }
}
