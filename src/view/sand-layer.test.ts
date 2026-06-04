import { describe, expect, test } from 'vitest';
import { ImageSource, TileMap } from 'excalibur';
import { SandLayer } from './sand-layer.ts';
import { TILEMAP_OCEAN_ROWS } from '../config.ts';

function makeStubImage(): ImageSource {
  return { isLoaded: () => false, ready: Promise.resolve() } as unknown as ImageSource;
}

function makeSandLayerWithTilemap() {
  let captured: TileMap | undefined;
  const scene = {
    add: (item: unknown) => {
      if (item instanceof TileMap) {
        captured = item;
      }
    },
  } as unknown as import('excalibur').Scene;
  const layer = new SandLayer(scene, 0, 0, 1, makeStubImage());
  if (!captured) {
    throw new Error('TileMap was not added to scene');
  }
  return { layer, tilemap: captured };
}

describe('SandLayer', () => {
  test('game row 0 tile has no graphics', () => {
    const { tilemap } = makeSandLayerWithTilemap();
    const tilemapRow = 0 + TILEMAP_OCEAN_ROWS; // game row 0 → tilemap row 1
    const tile = tilemap.getTile(0, tilemapRow);
    expect(tile?.getGraphics()).toHaveLength(0);
  });

  test('game row 2 (transition row) tile has exactly 1 graphic', () => {
    const { tilemap } = makeSandLayerWithTilemap();
    const tilemapRow = 2 + TILEMAP_OCEAN_ROWS; // game row 2 → tilemap row 3
    const tile = tilemap.getTile(0, tilemapRow);
    expect(tile?.getGraphics()).toHaveLength(1);
  });

  test('game row 5 (moist zone) tile has exactly 1 graphic', () => {
    const { tilemap } = makeSandLayerWithTilemap();
    const tilemapRow = 5 + TILEMAP_OCEAN_ROWS; // game row 5 → tilemap row 6
    const tile = tilemap.getTile(0, tilemapRow);
    expect(tile?.getGraphics()).toHaveLength(1);
  });

  test('clearCell removes graphics from a moist tile', () => {
    const { layer, tilemap } = makeSandLayerWithTilemap();
    const gameRow = 5;
    const tilemapRow = gameRow + TILEMAP_OCEAN_ROWS;
    // Confirm the tile has a graphic before clearing
    expect(tilemap.getTile(0, tilemapRow)?.getGraphics()).toHaveLength(1);
    layer.clearCell(0, gameRow);
    expect(tilemap.getTile(0, tilemapRow)?.getGraphics()).toHaveLength(0);
  });
});
