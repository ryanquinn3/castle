import { describe, expect, test } from "vitest";
import { Actor, ImageSource, Sprite, TileMap, type Graphic } from "excalibur";
import { SandLayer } from "./sand-layer.ts";
import { GRID_WIDTH, TILEMAP_OCEAN_ROWS, TILEMAP_ROWS } from "../config.ts";

const INITIAL_MOIST_GAME_ROW = 2;
const TILEMAP_GAME_ROWS = TILEMAP_ROWS - TILEMAP_OCEAN_ROWS;

function makeStubImage(): ImageSource {
  return {
    isLoaded: () => false,
    ready: Promise.resolve(),
  } as unknown as ImageSource;
}

function makeLoadedTilesetImage(): ImageSource {
  const canvas = document.createElement("canvas");
  canvas.width = 16 * 12;
  canvas.height = 16 * 10;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create tileset context");
  }

  const tileX = 0;
  const tileY = 9 * 16;
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(tileX, tileY, 4, 16);
  ctx.fillStyle = "#00ff00";
  ctx.fillRect(tileX + 4, tileY, 4, 16);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(tileX + 8, tileY, 4, 16);
  ctx.fillStyle = "#ffff00";
  ctx.fillRect(tileX + 12, tileY, 4, 16);

  return {
    image: canvas,
    isLoaded: () => true,
    ready: Promise.resolve(),
  } as unknown as ImageSource;
}

function makeSandLayer() {
  let captured: TileMap | undefined;
  const actors: Actor[] = [];
  const scene = {
    add: (item: unknown) => {
      if (item instanceof TileMap) {
        captured = item;
        return;
      }
      if (item instanceof Actor) {
        actors.push(item);
      }
    },
  } as unknown as import("excalibur").Scene;
  const layer = new SandLayer(scene, 0, 0, 1, makeStubImage());
  if (!captured) {
    throw new Error("TileMap was not added to scene");
  }
  return { layer, tilemap: captured, actors };
}

function getGraphic(
  tilemap: TileMap,
  col: number,
  gameRow: number,
): Graphic | undefined {
  const tile = tilemap.getTile(col, gameRow + TILEMAP_OCEAN_ROWS);
  const graphics = tile?.getGraphics();
  return graphics && graphics.length > 0 ? graphics[0] : undefined;
}

function sourceCoord(graphic: Graphic | undefined): [number, number] | undefined {
  if (!(graphic instanceof Sprite)) {
    return undefined;
  }
  const view = graphic.sourceView;
  return [view.x / 16, view.y / 16];
}

describe("SandLayer", () => {
  describe("gradient rendering", () => {
    test("uses plain moist tiles at the shoreline", () => {
      const { tilemap } = makeSandLayer();
      expect(sourceCoord(getGraphic(tilemap, 0, INITIAL_MOIST_GAME_ROW))).toEqual([
        1, 9,
      ]);
    });

    test("does not keep sprite-edge internals around", () => {
      const { layer } = makeSandLayer();
      const internals = layer as unknown as {
        renderMode?: unknown;
        spriteFor?: unknown;
      };

      expect(internals.renderMode).toBeUndefined();
      expect(internals.spriteFor).toBeUndefined();
    });

    test("clears covered cells without changing deeper moist tiles", () => {
      const { layer, tilemap } = makeSandLayer();
      layer.coverCell(5, INITIAL_MOIST_GAME_ROW);

      expect(getGraphic(tilemap, 5, INITIAL_MOIST_GAME_ROW)).toBeUndefined();
      expect(sourceCoord(getGraphic(tilemap, 5, INITIAL_MOIST_GAME_ROW + 2))).toEqual([
        1, 9,
      ]);
    });

    test("creates one shared overlay actor", () => {
      const { layer, actors } = makeSandLayer();
      expect(actors).toHaveLength(1);

      layer.coverCell(5, INITIAL_MOIST_GAME_ROW);
      layer.coverCell(5, INITIAL_MOIST_GAME_ROW + 1);

      expect(actors).toHaveLength(1);
    });

    test("only stamps cleared cells on the moist boundary", () => {
      const { layer } = makeSandLayer();
      for (let gameRow = INITIAL_MOIST_GAME_ROW; gameRow <= INITIAL_MOIST_GAME_ROW + 2; gameRow++) {
        for (let col = 4; col <= 6; col++) {
          layer.coverCell(col, gameRow);
        }
      }

      const shouldDrawWetStamp = (
        layer as unknown as {
          shouldDrawWetStamp?: (col: number, gameRow: number) => boolean;
        }
      ).shouldDrawWetStamp;

      expect(shouldDrawWetStamp).toBeTypeOf("function");
      expect(shouldDrawWetStamp?.call(layer, 5, INITIAL_MOIST_GAME_ROW + 1)).toBe(
        false,
      );
      expect(shouldDrawWetStamp?.call(layer, 5, INITIAL_MOIST_GAME_ROW + 2)).toBe(
        true,
      );
    });

    test("builds its stamp texture from a repeated wet tile", () => {
      let captured: TileMap | undefined;
      const scene = {
        add: (item: unknown) => {
          if (item instanceof TileMap) {
            captured = item;
          }
        },
      } as unknown as import("excalibur").Scene;
      const layer = new SandLayer(scene, 0, 0, 1, makeLoadedTilesetImage());
      expect(captured).toBeDefined();

      const getWetTextureCanvas = (
        layer as unknown as {
          getWetTextureCanvas?: () => HTMLCanvasElement | null;
        }
      ).getWetTextureCanvas;

      expect(getWetTextureCanvas).toBeTypeOf("function");
      const texture = getWetTextureCanvas?.call(layer);
      expect(texture).not.toBeNull();
      expect(texture?.width).toBe(32);
      expect(texture?.height).toBe(32);
    });

    test("uses a square-centered mask for boundary stamps", () => {
      const { layer } = makeSandLayer();
      const stampOpacityAt = (
        layer as unknown as {
          stampOpacityAt?: (x: number, y: number) => number;
        }
      ).stampOpacityAt;

      expect(stampOpacityAt).toBeTypeOf("function");
      expect(stampOpacityAt?.call(layer, 16, 16)).toBe(1);
      expect(stampOpacityAt?.call(layer, 8.5, 8.5)).toBe(1);
      expect(stampOpacityAt?.call(layer, 6, 16)).toBeGreaterThan(0);
      expect(stampOpacityAt?.call(layer, 6, 16)).toBeLessThan(1);
      expect(stampOpacityAt?.call(layer, 0, 0)).toBe(0);
    });
  });

  describe("initial state", () => {
    test("rows above the moist region are empty", () => {
      const { tilemap } = makeSandLayer();
      for (let gameRow = 0; gameRow < INITIAL_MOIST_GAME_ROW; gameRow++) {
        for (let col = 0; col < GRID_WIDTH; col++) {
          expect(getGraphic(tilemap, col, gameRow)).toBeUndefined();
        }
      }
    });

    test("the top moist row renders as plain moist in every column", () => {
      const { tilemap } = makeSandLayer();
      for (let col = 0; col < GRID_WIDTH; col++) {
        const coord = sourceCoord(getGraphic(tilemap, col, INITIAL_MOIST_GAME_ROW));
        expect(coord).toEqual([1, 9]);
      }
    });

    test("rows below the top moist row render as plain moist", () => {
      const { tilemap } = makeSandLayer();
      const coord = sourceCoord(
        getGraphic(tilemap, 0, INITIAL_MOIST_GAME_ROW + 2),
      );
      expect(coord).toEqual([1, 9]);
    });
  });

  describe("coverCell", () => {
    test("covering the top moist row leaves the row below plain moist", () => {
      const { layer, tilemap } = makeSandLayer();
      layer.coverCell(0, INITIAL_MOIST_GAME_ROW);

      expect(getGraphic(tilemap, 0, INITIAL_MOIST_GAME_ROW)).toBeUndefined();
      const promoted = sourceCoord(
        getGraphic(tilemap, 0, INITIAL_MOIST_GAME_ROW + 1),
      );
      expect(promoted).toEqual([1, 9]);
    });

    test("covering a cleared row is a no-op", () => {
      const { layer, tilemap } = makeSandLayer();
      layer.coverCell(0, INITIAL_MOIST_GAME_ROW);
      const beforeNext = sourceCoord(getGraphic(tilemap, 0, INITIAL_MOIST_GAME_ROW + 1));

      layer.coverCell(0, INITIAL_MOIST_GAME_ROW);
      layer.coverCell(0, 0);

      const afterNext = sourceCoord(
        getGraphic(tilemap, 0, INITIAL_MOIST_GAME_ROW + 1),
      );
      expect(afterNext).toEqual(beforeNext);
    });

    test("covering the last row leaves nothing rendered in that column", () => {
      const { layer, tilemap } = makeSandLayer();
      for (let row = INITIAL_MOIST_GAME_ROW; row < TILEMAP_GAME_ROWS; row++) {
        layer.coverCell(0, row);
      }
      for (let row = INITIAL_MOIST_GAME_ROW; row < TILEMAP_GAME_ROWS; row++) {
        expect(getGraphic(tilemap, 0, row)).toBeUndefined();
      }
    });

    test("a shorter subsequent wave preserves the deeper wave's cleared region", () => {
      const { layer, tilemap } = makeSandLayer();
      // Wave 1: clear col 5 down to row 8
      for (let row = INITIAL_MOIST_GAME_ROW; row <= 8; row++) {
        layer.coverCell(5, row);
      }
      const afterWave1 = sourceCoord(getGraphic(tilemap, 5, 9));
      expect(afterWave1).toEqual([1, 9]);

      // Wave 2: shorter, only clears col 5 down to row 4. All targets already cleared.
      for (let row = INITIAL_MOIST_GAME_ROW; row <= 4; row++) {
        layer.coverCell(5, row);
      }

      expect(sourceCoord(getGraphic(tilemap, 5, 9))).toEqual(afterWave1);
      for (let row = INITIAL_MOIST_GAME_ROW; row <= 8; row++) {
        expect(getGraphic(tilemap, 5, row)).toBeUndefined();
      }
    });

    test("a later wave hitting a new column preserves neighboring moist tiles", () => {
      const { layer, tilemap } = makeSandLayer();
      for (let row = INITIAL_MOIST_GAME_ROW; row <= 7; row++) {
        layer.coverCell(4, row);
      }
      const beforeWave2 = sourceCoord(getGraphic(tilemap, 5, 5));
      expect(beforeWave2).toEqual([1, 9]);

      for (let row = INITIAL_MOIST_GAME_ROW; row <= 3; row++) {
        layer.coverCell(5, row);
      }
      expect(sourceCoord(getGraphic(tilemap, 5, 4))).toEqual([1, 9]);
      expect(sourceCoord(getGraphic(tilemap, 5, 5))).toEqual(beforeWave2);
      expect(sourceCoord(getGraphic(tilemap, 5, 7))).toEqual([1, 9]);
    });

    test("out-of-range coordinates do not throw", () => {
      const { layer } = makeSandLayer();
      expect(() =>
        layer.coverCell(-1, INITIAL_MOIST_GAME_ROW),
      ).not.toThrow();
      expect(() =>
        layer.coverCell(GRID_WIDTH, INITIAL_MOIST_GAME_ROW),
      ).not.toThrow();
      expect(() => layer.coverCell(0, -1)).not.toThrow();
      expect(() => layer.coverCell(0, TILEMAP_GAME_ROWS)).not.toThrow();
    });

    test("reset restores the initial moist shoreline after cells were cleared", () => {
      const { layer, tilemap } = makeSandLayer();
      for (let row = INITIAL_MOIST_GAME_ROW; row <= 6; row++) {
        layer.coverCell(5, row);
      }

      expect(getGraphic(tilemap, 5, 6)).toBeUndefined();

      const reset = (layer as SandLayer & { reset?: () => void }).reset;
      expect(reset).toBeTypeOf("function");
      reset?.call(layer);

      const topMoist = sourceCoord(getGraphic(tilemap, 5, INITIAL_MOIST_GAME_ROW));
      expect(topMoist).toEqual([1, 9]);
      expect(sourceCoord(getGraphic(tilemap, 5, INITIAL_MOIST_GAME_ROW + 4))).toEqual([1, 9]);
    });
  });
});
