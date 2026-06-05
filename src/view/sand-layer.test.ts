import { describe, expect, test } from 'vitest';
import { ImageSource, TileMap } from 'excalibur';
import { SandLayer } from './sand-layer.ts';
import { GRID_WIDTH, TILEMAP_OCEAN_ROWS, TILEMAP_ROWS } from '../config.ts';

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

function getGraphic(tilemap: TileMap, col: number, gameRow: number) {
  const tile = tilemap.getTile(col, gameRow + TILEMAP_OCEAN_ROWS);
  const graphics = tile?.getGraphics();
  return graphics && graphics.length > 0 ? graphics[0] : undefined;
}

describe('SandLayer', () => {
  test('game row 0 tile has no graphics', () => {
    const { tilemap } = makeSandLayerWithTilemap();
    const tilemapRow = 0 + TILEMAP_OCEAN_ROWS;
    const tile = tilemap.getTile(0, tilemapRow);
    expect(tile?.getGraphics()).toHaveLength(0);
  });

  test('game row 2 (transition row) tile has the transition sprite', () => {
    const { tilemap } = makeSandLayerWithTilemap();
    const tilemapRow = 2 + TILEMAP_OCEAN_ROWS;
    const tile = tilemap.getTile(0, tilemapRow);
    expect(tile?.getGraphics()).toHaveLength(1);
  });

  test('game row 5 (moist zone) tile has the moist sprite', () => {
    const { tilemap } = makeSandLayerWithTilemap();
    const tilemapRow = 5 + TILEMAP_OCEAN_ROWS;
    const tile = tilemap.getTile(0, tilemapRow);
    expect(tile?.getGraphics()).toHaveLength(1);
  });

  test('moist and transition rows use distinct sprites', () => {
    const { tilemap } = makeSandLayerWithTilemap();
    const transitionGraphic = getGraphic(tilemap, 0, 2);
    const moistGraphic = getGraphic(tilemap, 0, 5);
    expect(transitionGraphic).toBeDefined();
    expect(moistGraphic).toBeDefined();
    expect(transitionGraphic).not.toBe(moistGraphic);
  });

  test('coverCell on a moist tile installs the transition sprite, then clears on second call', () => {
    const { layer, tilemap } = makeSandLayerWithTilemap();
    const gameRow = 5;
    const tilemapRow = gameRow + TILEMAP_OCEAN_ROWS;
    const transitionGraphic = getGraphic(tilemap, 0, 2);

    layer.coverCell(0, gameRow);
    expect(tilemap.getTile(0, tilemapRow)?.getGraphics()).toHaveLength(1);
    expect(getGraphic(tilemap, 0, gameRow)).toBe(transitionGraphic);

    layer.coverCell(0, gameRow);
    expect(tilemap.getTile(0, tilemapRow)?.getGraphics()).toHaveLength(0);
  });

  test('coverCell on the initial transition row clears graphics', () => {
    const { layer, tilemap } = makeSandLayerWithTilemap();
    const gameRow = 2;
    const tilemapRow = gameRow + TILEMAP_OCEAN_ROWS;
    expect(tilemap.getTile(0, tilemapRow)?.getGraphics()).toHaveLength(1);
    layer.coverCell(0, gameRow);
    expect(tilemap.getTile(0, tilemapRow)?.getGraphics()).toHaveLength(0);
  });

  test('coverCell on an already-cleared tile is a no-op', () => {
    const { layer, tilemap } = makeSandLayerWithTilemap();
    const gameRow = 0;
    const tilemapRow = gameRow + TILEMAP_OCEAN_ROWS;
    expect(tilemap.getTile(0, tilemapRow)?.getGraphics()).toHaveLength(0);
    layer.coverCell(0, gameRow);
    expect(tilemap.getTile(0, tilemapRow)?.getGraphics()).toHaveLength(0);
  });

  test('coverCell with out-of-range coordinates does not throw', () => {
    const { layer } = makeSandLayerWithTilemap();
    expect(() => layer.coverCell(-1, 5)).not.toThrow();
    expect(() => layer.coverCell(GRID_WIDTH, 5)).not.toThrow();
    expect(() => layer.coverCell(0, -TILEMAP_OCEAN_ROWS - 1)).not.toThrow();
    expect(() => layer.coverCell(0, TILEMAP_ROWS)).not.toThrow();
  });
});
