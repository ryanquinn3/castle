import { expect, test } from "../test/excalibur-browser-shared-test.ts";
import { EventEmitter, type Scene } from "excalibur";
import { WaterComponent } from "./water-component.ts";
import { WaveDynamicSystem, type WaterFieldEvents } from "./wave-dynamic-system.ts";

const drive = (clock: { step(ms: number): void }, frames: number, ms = 16) => {
  for (let i = 0; i < frames; i++) {
    clock.step(ms);
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
    groundLevelAt: (_col, row) => 0.5 * row,
    gridLeft: 0,
    gridTop: 32,
    tileSize: 16,
    surgeWindowMs,
    onComplete,
    events,
  });

test("spawns WaterCell actors that mirror the simulated field", async ({ scene, clock }) => {
  scene.world.add(makeSystem(scene));

  drive(clock, 60);

  const entities = scene.world.query([WaterComponent]).entities;
  expect(entities.length).toBeGreaterThan(0);
  const row0 = entities.map((e) => e.get(WaterComponent)!).filter((w) => w.row === 0);
  expect(row0.length).toBeGreaterThan(0);
  expect(Math.max(...row0.map((w) => w.depth))).toBeGreaterThan(2);
});

test("emits WaterCellAdded for each cell that becomes wet", async ({ scene, clock }) => {
  const events = new EventEmitter<WaterFieldEvents>();
  const seen = new Set<string>();
  events.on("WaterCellAdded", ({ col, row }) => seen.add(`${col}:${row}`));

  scene.world.add(makeSystem(scene, undefined, 100_000, events));

  drive(clock, 60);

  // Every live water cell should have announced itself.
  const live = scene.world
    .query([WaterComponent])
    .entities.map((e) => e.get(WaterComponent)!);
  expect(live.length).toBeGreaterThan(0);
  for (const w of live) {
    expect(seen.has(`${w.col}:${w.row}`)).toBe(true);
  }
  // Including the row-0 source cells.
  expect([...seen].some((k) => k.endsWith(":0"))).toBe(true);
});

test("fires onComplete and kills all actors after the surge window + drain", async ({ scene, clock }) => {
  let completed = false;
  scene.world.add(makeSystem(scene, () => {
    completed = true;
  }, 200));

  drive(clock, 800);

  expect(completed).toBe(true);
  expect(scene.world.query([WaterComponent]).entities.length).toBe(0);
});

test("drains water trapped in a wall-enclosed basin so the wave resolves", async ({ scene, clock }) => {
  // 1-wide column: elev [0, 2, 0, 2]. Row 0 is the open source; the elev-2 cell
  // at row 1 is a crest that, once the source closes, blocks the row-2 basin from
  // draining north to the ocean. Without seepage the basin holds ~depth 2 forever.
  const ground = [0, 2, 0, 2];
  let completed = false;
  scene.world.add(
    new WaveDynamicSystem({
      scene,
      width: 1,
      height: 4,
      sourceDepths: [4],
      groundAt: (_col, row) => ground[row],
      groundLevelAt: (_col, _row) => 0,
      gridLeft: 0,
      gridTop: 32,
      tileSize: 16,
      surgeWindowMs: 200,
      onComplete: () => {
        completed = true;
      },
    }),
  );

  // Surge (~12 steps) fills the column; then a long recede must fully drain it.
  drive(clock, 600);

  expect(completed).toBe(true);
  expect(scene.world.query([WaterComponent]).entities.length).toBe(0);
});

test("onResolveCells.done forces completion even while water remains", async ({ scene, clock }) => {
  let completed = false;
  scene.world.add(
    new WaveDynamicSystem({
      scene,
      width: 3,
      height: 12,
      sourceDepths: [4, 4, 4],
      groundAt: (_col, row) => 0.5 * row,
      groundLevelAt: (_col, row) => 0.5 * row,
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

  drive(clock, 5);

  expect(completed).toBe(true);
});
