import { describe, expect, test } from "vitest";
import { ImageSource, Sprite, TileMap, type Graphic } from "excalibur";
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
  describe("initial state", () => {
    test("rows above the moist region are empty", () => {
      const { tilemap } = makeSandLayer();
      for (let gameRow = 0; gameRow < INITIAL_MOIST_GAME_ROW; gameRow++) {
        for (let col = 0; col < GRID_WIDTH; col++) {
          expect(getGraphic(tilemap, col, gameRow)).toBeUndefined();
        }
      }
    });

    test("the top moist row renders as an N-edge tile in every column", () => {
      const { tilemap } = makeSandLayer();
      for (let col = 0; col < GRID_WIDTH; col++) {
        const coord = sourceCoord(getGraphic(tilemap, col, INITIAL_MOIST_GAME_ROW));
        expect(coord?.[1]).toBe(3);
        expect([1, 2]).toContain(coord?.[0]);
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
    test("covering the top moist row promotes the row below to N-edge", () => {
      const { layer, tilemap } = makeSandLayer();
      layer.coverCell(0, INITIAL_MOIST_GAME_ROW);

      expect(getGraphic(tilemap, 0, INITIAL_MOIST_GAME_ROW)).toBeUndefined();
      const promoted = sourceCoord(
        getGraphic(tilemap, 0, INITIAL_MOIST_GAME_ROW + 1),
      );
      expect(promoted?.[1]).toBe(3);
      expect([1, 2]).toContain(promoted?.[0]);
    });

    test("a column cleared deeper than its neighbor produces a W-edge in the neighbor", () => {
      const { layer, tilemap } = makeSandLayer();
      const col = 5;
      const depth = INITIAL_MOIST_GAME_ROW + 3;
      for (let row = INITIAL_MOIST_GAME_ROW; row <= depth; row++) {
        layer.coverCell(col, row);
      }
      // east neighbor at the same row should show a W-edge (cleared to the W)
      const coord = sourceCoord(getGraphic(tilemap, col + 1, depth));
      expect(coord?.[0]).toBe(7);
      expect([3, 4]).toContain(coord?.[1]);
    });

    test("a column cleared deeper than its neighbor produces an E-edge on the west side", () => {
      const { layer, tilemap } = makeSandLayer();
      const col = 5;
      const depth = INITIAL_MOIST_GAME_ROW + 3;
      for (let row = INITIAL_MOIST_GAME_ROW; row <= depth; row++) {
        layer.coverCell(col, row);
      }
      const coord = sourceCoord(getGraphic(tilemap, col - 1, depth));
      expect(coord?.[0]).toBe(6);
      expect([3, 4]).toContain(coord?.[1]);
    });

    test("a column cleared one row deeper than its west neighbor produces an NW outer corner", () => {
      const { layer, tilemap } = makeSandLayer();
      // clear col 4 to row 3, col 5 to row 4
      layer.coverCell(4, 2);
      layer.coverCell(4, 3);
      layer.coverCell(5, 2);
      layer.coverCell(5, 3);
      layer.coverCell(5, 4);
      // cell (col=5, row=4) is cleared so check (col=5, row=5) which should be NW-outer-corner-ish... wait
      // Actually after clearing those, (col=5, row=5) has N=cleared (5,4), W=(4,5) moist. → N-edge
      // Re-pick: clear col=4 deeper so col=5 has cleared N and W:
      // After clearing (4,4): cell (5,4) is cleared, so check (5,5): N=(5,4) cleared, W=(4,5) moist → N-edge.
      // We want a moist cell with cleared N and W. After clearing (4,2..4) and (5,2..3):
      // cell (5,4): N=(5,3) cleared, W=(4,4)? (4,4) is moist since col 4 only cleared to row 3. → only N → N-edge.
      // Need col 4 cleared at (4,4) too:
      layer.coverCell(4, 4);
      // Now cell (5,5) is moist: N=(5,4) cleared, W=(4,5) moist. Still only N.
      // Need a moist tile (col=X, row=Y) where col X is moist at row Y but cleared at row Y-1, and col X-1 is cleared at row Y.
      // So col=5, row=5: clear (5,4) (already done), need (4,5) cleared. Clear (4,5):
      layer.coverCell(4, 5);
      // Now (5,5) is moist: N=(5,4) cleared, W=(4,5) cleared → NW outer corner.
      const coord = sourceCoord(getGraphic(tilemap, 5, 5));
      expect(coord).toEqual([0, 3]);
    });

    test("a moist cell with only diagonal NW cleared gets an NW inner corner", () => {
      const { layer, tilemap } = makeSandLayer();
      // clear col 4 down to row 4 but leave col 5 cleared only to the standard row 2
      for (let row = INITIAL_MOIST_GAME_ROW; row <= 4; row++) {
        layer.coverCell(4, row);
      }
      // cell (5, 5): N=(5,4) moist, W=(4,5) moist, NW=(4,4) cleared. → inner NW corner
      const coord = sourceCoord(getGraphic(tilemap, 5, 5));
      expect(coord).toEqual([4, 3]);
    });

    test("a moist cell with only diagonal NE cleared gets an NE inner corner", () => {
      const { layer, tilemap } = makeSandLayer();
      for (let row = INITIAL_MOIST_GAME_ROW; row <= 4; row++) {
        layer.coverCell(6, row);
      }
      // cell (5, 5): N=(5,4) moist, E=(6,5) moist, NE=(6,4) cleared. → inner NE
      const coord = sourceCoord(getGraphic(tilemap, 5, 5));
      expect(coord).toEqual([5, 3]);
    });

    test("covering a cleared row is a no-op", () => {
      const { layer, tilemap } = makeSandLayer();
      layer.coverCell(0, INITIAL_MOIST_GAME_ROW);
      const beforeNext = sourceCoord(
        getGraphic(tilemap, 0, INITIAL_MOIST_GAME_ROW + 1),
      );

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
  });
});
