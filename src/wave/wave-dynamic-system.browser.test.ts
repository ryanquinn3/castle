import { expect, test } from "../test/excalibur-browser-test.ts";
import { EventEmitter, type Scene } from "excalibur";
import { WaterComponent } from "./water-component.ts";
import { WaveDynamicSystem, type WaterFieldEvents } from "./wave-dynamic-system.ts";

const drive = (ctx: { step(ms: number): void }, frames: number, ms = 16) => {
  for (let i = 0; i < frames; i++) {
    ctx.step(ms);
  }
};

const makeSystem = (
  scene: Scene,
  onComplete?: () => void,
  surgeWindowMs = 100_000,
  events?: EventEmitter<WaterFieldEvents>,
) =>
  new WaveDynamicSystem({
    scene,
    width: 3,
    height: 12,
    sourceDepths: [4, 4, 4],
    groundAt: (_col, row) => 0.5 * row,
    gridLeft: 0,
    gridTop: 32,
    tileSize: 16,
    surgeWindowMs,
    onComplete,
    events,
  });

test("spawns WaterCell actors that mirror the simulated field", async ({ ctx }) => {
  ctx.scene.world.add(makeSystem(ctx.scene));

  drive(ctx, 60);

  const entities = ctx.scene.world.query([WaterComponent]).entities;
  expect(entities.length).toBeGreaterThan(0);
  const row0 = entities.map((e) => e.get(WaterComponent)!).filter((w) => w.row === 0);
  expect(row0.length).toBeGreaterThan(0);
  expect(Math.max(...row0.map((w) => w.depth))).toBeGreaterThan(2);
});

test("emits WaterCellAdded for each cell that becomes wet", async ({ ctx }) => {
  const events = new EventEmitter<WaterFieldEvents>();
  const seen = new Set<string>();
  events.on("WaterCellAdded", ({ col, row }) => seen.add(`${col}:${row}`));

  ctx.scene.world.add(makeSystem(ctx.scene, undefined, 100_000, events));

  drive(ctx, 60);

  // Every live water cell should have announced itself.
  const live = ctx.scene.world
    .query([WaterComponent])
    .entities.map((e) => e.get(WaterComponent)!);
  expect(live.length).toBeGreaterThan(0);
  for (const w of live) {
    expect(seen.has(`${w.col}:${w.row}`)).toBe(true);
  }
  // Including the row-0 source cells.
  expect([...seen].some((k) => k.endsWith(":0"))).toBe(true);
});

test("fires onComplete and kills all actors after the surge window + drain", async ({ ctx }) => {
  let completed = false;
  ctx.scene.world.add(makeSystem(ctx.scene, () => {
    completed = true;
  }, 200));

  drive(ctx, 800);

  expect(completed).toBe(true);
  expect(ctx.scene.world.query([WaterComponent]).entities.length).toBe(0);
});

test("onResolveCells.done forces completion even while water remains", async ({ ctx }) => {
  let completed = false;
  ctx.scene.world.add(
    new WaveDynamicSystem({
      scene: ctx.scene,
      width: 3,
      height: 12,
      sourceDepths: [4, 4, 4],
      groundAt: (_col, row) => 0.5 * row,
      gridLeft: 0,
      gridTop: 32,
      tileSize: 16,
      surgeWindowMs: 100_000, // source stays open, so water never drains on its own
      onResolveCells: (cells) => ({ cells, done: true }),
      onComplete: () => {
        completed = true;
      },
    }),
  );

  drive(ctx, 5);

  expect(completed).toBe(true);
});
