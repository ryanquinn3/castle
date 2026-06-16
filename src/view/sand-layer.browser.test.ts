import { Color } from "excalibur";
import { page } from "vitest/browser";
import { expect, test } from "../test/excalibur-browser-shared-test.ts";
import { SandLayer } from "./sand-layer.ts";
import { Resources } from "../resources.ts";
import { GRID_WIDTH, TILEMAP_OCEAN_ROWS, TILEMAP_ROWS } from "../config.ts";

const SAND_ROWS = TILEMAP_ROWS - TILEMAP_OCEAN_ROWS;

// SandLayer renders the moist region through a blurred + thresholded coverage
// mask so its boundary is a smooth rounded edge rather than blocky tile steps.
// We assert on the rendered output (cell opacity), driving only the public API.
// Boundary cells are intentionally not asserted: rounding makes them ambiguous,
// so we sample well inside moist or cleared regions.

async function makeLayer(scene: import("excalibur").Scene): Promise<SandLayer> {
  await Resources.BeachTileset.load();
  return new SandLayer(scene, 0, 0, 1, Resources.BeachTileset);
}

function moistAlpha(layer: SandLayer, col: number, gameRow: number): number {
  const canvas = layer.renderToCanvas();
  if (!canvas) {
    throw new Error("SandLayer produced no render");
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("no 2d context");
  }
  const x = col * 16 + 8;
  const y = (gameRow + TILEMAP_OCEAN_ROWS) * 16 + 8;
  return ctx.getImageData(x, y, 1, 1).data[3];
}

function isMoist(layer: SandLayer, col: number, gameRow: number): boolean {
  return moistAlpha(layer, col, gameRow) > 128;
}

test("renders moist sand below the shoreline and clear water above", async ({
  scene,
}) => {
  const layer = await makeLayer(scene);
  for (let col = 0; col < GRID_WIDTH; col++) {
    expect(isMoist(layer, col, SAND_ROWS - 1)).toBe(true);
    expect(isMoist(layer, col, 0)).toBe(false);
  }
});

test("clearing a wide region renders its interior as open water", async ({
  scene,
}) => {
  const layer = await makeLayer(scene);
  const clearedCols = { start: 3, end: 12 };
  for (let col = clearedCols.start; col <= clearedCols.end; col++) {
    for (let row = 0; row < SAND_ROWS; row++) {
      layer.coverCell(col, row);
    }
  }

  // Deep inside the cleared block: open water.
  expect(isMoist(layer, 7, SAND_ROWS - 1)).toBe(false);
  // A column far from the cleared block keeps its moist sand.
  expect(isMoist(layer, 0, SAND_ROWS - 1)).toBe(true);
});

test("reset restores moist sand after a region was cleared", async ({ scene }) => {
  const layer = await makeLayer(scene);
  for (let col = 3; col <= 12; col++) {
    for (let row = 0; row < SAND_ROWS; row++) {
      layer.coverCell(col, row);
    }
  }
  expect(isMoist(layer, 7, SAND_ROWS - 1)).toBe(false);

  layer.reset();
  expect(isMoist(layer, 7, SAND_ROWS - 1)).toBe(true);
});

test("covering out-of-bounds or already-cleared cells is a safe no-op", async ({
  scene,
}) => {
  const layer = await makeLayer(scene);
  expect(() => {
    layer.coverCell(-1, 0);
    layer.coverCell(GRID_WIDTH, 0);
    layer.coverCell(0, -1);
    layer.coverCell(0, SAND_ROWS);
    layer.coverCell(0, SAND_ROWS - 1);
    layer.coverCell(0, SAND_ROWS - 1);
  }).not.toThrow();
  expect(layer.renderToCanvas()).not.toBeNull();
});

test("smooths the blocky seam into a rounded boundary", async ({ game, scene, clock }) => {
  game.backgroundColor = Color.fromHex("#e3cda0");
  const layer = await makeLayer(scene);
  const topMoistRow = [4, 4, 3, 3, 2, 2, 1, 1, 2, 2, 3, 3, 4, 4, 3, 3];
  for (let col = 0; col < GRID_WIDTH; col++) {
    for (let row = 0; row < topMoistRow[col]; row++) {
      layer.coverCell(col, row);
    }
  }
  clock.step(16);
  clock.step(16);
  await page.screenshot();
});
