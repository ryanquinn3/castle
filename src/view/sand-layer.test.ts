import { describe, expect, test } from "vitest";
import { ImageSource, TileMap, type Graphic } from "excalibur";
import { SandLayer } from "./sand-layer.ts";
import { GRID_WIDTH, TILEMAP_OCEAN_ROWS, TILEMAP_ROWS } from "../config.ts";

const INITIAL_TRANSITION_GAME_ROW = 2;
const TILEMAP_GAME_ROWS = TILEMAP_ROWS - TILEMAP_OCEAN_ROWS;

function makeStubImage(): ImageSource {
  return { isLoaded: () => false, ready: Promise.resolve() } as unknown as ImageSource;
}

function makeSandLayer() {
  let captured: TileMap | undefined;
  const scene = {
    add: (item: unknown) => {
      if (item instanceof TileMap) {
        captured = item;
      }
    },
  } as unknown as import("excalibur").Scene;
  const layer = new SandLayer(scene, 0, 0, 1, makeStubImage());
  if (!captured) {
    throw new Error("TileMap was not added to scene");
  }
  return { layer, tilemap: captured };
}

function getGraphic(tilemap: TileMap, col: number, gameRow: number): Graphic | undefined {
  const tile = tilemap.getTile(col, gameRow + TILEMAP_OCEAN_ROWS);
  const graphics = tile?.getGraphics();
  return graphics && graphics.length > 0 ? graphics[0] : undefined;
}

function topmostGraphicRow(tilemap: TileMap, col: number): number | undefined {
  for (let gameRow = 0; gameRow < TILEMAP_GAME_ROWS; gameRow++) {
    if (getGraphic(tilemap, col, gameRow)) {
      return gameRow;
    }
  }
  return undefined;
}

describe("SandLayer", () => {
  describe("initial state", () => {
    test("rows above the transition row are empty", () => {
      const { tilemap } = makeSandLayer();
      for (let gameRow = 0; gameRow < INITIAL_TRANSITION_GAME_ROW; gameRow++) {
        expect(getGraphic(tilemap, 0, gameRow)).toBeUndefined();
      }
    });

    test("the transition row is the topmost non-empty row in each column", () => {
      const { tilemap } = makeSandLayer();
      for (let col = 0; col < GRID_WIDTH; col++) {
        expect(topmostGraphicRow(tilemap, col)).toBe(INITIAL_TRANSITION_GAME_ROW);
      }
    });

    test("moist and transition sprites differ", () => {
      const { tilemap } = makeSandLayer();
      const transition = getGraphic(tilemap, 0, INITIAL_TRANSITION_GAME_ROW);
      const moist = getGraphic(tilemap, 0, INITIAL_TRANSITION_GAME_ROW + 3);
      expect(transition).toBeDefined();
      expect(moist).toBeDefined();
      expect(transition).not.toBe(moist);
    });
  });

  describe("coverCell", () => {
    test("covering the active transition row clears it and promotes the next row", () => {
      const { layer, tilemap } = makeSandLayer();
      const transitionSprite = getGraphic(tilemap, 0, INITIAL_TRANSITION_GAME_ROW);

      layer.coverCell(0, INITIAL_TRANSITION_GAME_ROW);

      expect(getGraphic(tilemap, 0, INITIAL_TRANSITION_GAME_ROW)).toBeUndefined();
      expect(getGraphic(tilemap, 0, INITIAL_TRANSITION_GAME_ROW + 1)).toBe(transitionSprite);
      expect(topmostGraphicRow(tilemap, 0)).toBe(INITIAL_TRANSITION_GAME_ROW + 1);
    });

    test("invariant: topmost non-empty row stays at exactly one transition tile as the wave advances", () => {
      const { layer, tilemap } = makeSandLayer();
      const transitionSprite = getGraphic(tilemap, 0, INITIAL_TRANSITION_GAME_ROW);

      for (let row = INITIAL_TRANSITION_GAME_ROW; row < TILEMAP_GAME_ROWS - 1; row++) {
        layer.coverCell(0, row);
        const top = topmostGraphicRow(tilemap, 0);
        expect(top).toBe(row + 1);
        expect(getGraphic(tilemap, 0, row + 1)).toBe(transitionSprite);
      }
    });

    test("covering a cleared row is a no-op", () => {
      const { layer, tilemap } = makeSandLayer();
      layer.coverCell(0, INITIAL_TRANSITION_GAME_ROW);
      const beforeTop = topmostGraphicRow(tilemap, 0);

      layer.coverCell(0, INITIAL_TRANSITION_GAME_ROW);
      layer.coverCell(0, 0);

      expect(topmostGraphicRow(tilemap, 0)).toBe(beforeTop);
    });

    test("covering a moist row before its turn is a no-op", () => {
      const { layer, tilemap } = makeSandLayer();
      const futureRow = INITIAL_TRANSITION_GAME_ROW + 4;
      const moistBefore = getGraphic(tilemap, 0, futureRow);

      layer.coverCell(0, futureRow);

      expect(getGraphic(tilemap, 0, futureRow)).toBe(moistBefore);
      expect(topmostGraphicRow(tilemap, 0)).toBe(INITIAL_TRANSITION_GAME_ROW);
    });

    test("covering the last row leaves no transition tile behind", () => {
      const { layer, tilemap } = makeSandLayer();
      for (let row = INITIAL_TRANSITION_GAME_ROW; row < TILEMAP_GAME_ROWS; row++) {
        layer.coverCell(0, row);
      }
      expect(topmostGraphicRow(tilemap, 0)).toBeUndefined();
    });

    test("each column tracks its own transition row independently", () => {
      const { layer, tilemap } = makeSandLayer();
      layer.coverCell(0, INITIAL_TRANSITION_GAME_ROW);
      layer.coverCell(0, INITIAL_TRANSITION_GAME_ROW + 1);

      expect(topmostGraphicRow(tilemap, 0)).toBe(INITIAL_TRANSITION_GAME_ROW + 2);
      expect(topmostGraphicRow(tilemap, 1)).toBe(INITIAL_TRANSITION_GAME_ROW);
    });

    test("out-of-range coordinates do not throw", () => {
      const { layer } = makeSandLayer();
      expect(() => layer.coverCell(-1, INITIAL_TRANSITION_GAME_ROW)).not.toThrow();
      expect(() => layer.coverCell(GRID_WIDTH, INITIAL_TRANSITION_GAME_ROW)).not.toThrow();
      expect(() => layer.coverCell(0, -1)).not.toThrow();
      expect(() => layer.coverCell(0, TILEMAP_GAME_ROWS)).not.toThrow();
    });
  });
});
