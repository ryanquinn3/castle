# Shared Engine Browser Test Fixture

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce browser test overhead by sharing one Excalibur engine per test file instead of creating/disposing one per test.

**Architecture:** A file-scoped `game` fixture (Vitest 3.2 `{ scope: 'file' }`) creates the engine once. Per-test `scene` and `clock` fixtures swap in a fresh `ex.Scene` and grab the test clock. Tests destructure only what they need: `{ scene }`, `{ scene, clock }`, `{ game, scene, clock }`.

**Tech Stack:** Vitest 3.2 fixture scoping, Excalibur.js engine/scene lifecycle

**Spec:** `docs/notes/shared-engine-browser-fixture.md`

---

### Task 1: Add `createSharedEngine` and create the shared fixture

**Files:**
- Modify: `src/test/excalibur-browser-test-utils.ts`
- Create: `src/test/excalibur-browser-shared-test.ts`

**Step 1: Add `createSharedEngine` to utils**

Add a new export to `src/test/excalibur-browser-test-utils.ts` that returns just the engine (no bundled context). Same options as `createExcaliburBrowserTestContext` but stops before scene/clock setup:

```ts
export async function createSharedEngine(
  options: ex.EngineOptions = {},
): Promise<ex.Engine> {
  ex.Debug.clear();
  ex.Flags._reset();
  ex.Flags.enable("suppress-obsolete-message");

  const game = new ex.Engine({
    width: 500,
    height: 500,
    suppressConsoleBootMessage: true,
    enableCanvasTransparency: true,
    suppressMinimumBrowserFeatureDetection: true,
    suppressHiDPIScaling: true,
    suppressPlayButton: true,
    snapToPixel: false,
    antialiasing: false,
    displayMode: ex.DisplayMode.Fixed,
    ...options,
  });

  game.canvas.style.display = "block";
  game.canvas.style.position = "absolute";
  game.canvas.style.top = "0px";

  await game.start();
  (ex.WebAudio as any)._UNLOCKED = true;
  return game;
}
```

Note: `game.start()` is called without a scene name since scenes are added per-test.

**Step 2: Create the shared fixture**

Create `src/test/excalibur-browser-shared-test.ts`:

```ts
import * as ex from "excalibur";
import { expect, test as baseTest } from "vitest";
import { createSharedEngine } from "./excalibur-browser-test-utils.ts";

export const test = baseTest
  .extend("game", { scope: "file" }, async ({}, { onCleanup }) => {
    const game = await createSharedEngine();
    onCleanup(() => {
      game.stop();
      game.dispose();
    });
    return game;
  })
  .extend("scene", async ({ game }, { onCleanup }) => {
    const scene = new ex.Scene();
    game.addScene("test", scene);
    await game.goToScene("test");
    onCleanup(() => {
      scene.clear(false);
      game.removeScene("test");
    });
    return scene;
  })
  .extend("clock", async ({ game }) => {
    return game.debug.useTestClock();
  });

export { expect };
```

**Step 3: Run static checks**

Run: `node --run static-check`

Expected: PASS (no tests use the new fixture yet, just verifying no syntax/type errors)

**Step 4: Commit**

```
feat(test): add shared-engine browser test fixture

File-scoped engine fixture avoids creating/disposing an Excalibur
engine per test. Per-test scene and clock fixtures swap in fresh state.
```

---

### Task 2: Migrate model tests

**Files:**
- Modify: `src/model/grid-model-erosion.browser.test.ts`
- Modify: `src/model/grid-model.browser.test.ts`
- Modify: `src/model/terrain/terrain-render.browser.test.ts`

**Migration pattern for all three:**

1. Change import from `excalibur-browser-test` to `excalibur-browser-shared-test`
2. Replace `{ ctx }` destructuring with the specific fixtures each test needs
3. Replace `ctx.scene` with `scene`, `ctx.step(n)` with `clock.step(n)`

**Step 1: Migrate `grid-model-erosion.browser.test.ts`**

Import change:
```ts
// before
import { expect, test } from "../test/excalibur-browser-test.ts";
// after
import { expect, test } from "../test/excalibur-browser-shared-test.ts";
```

Tests only use `ctx.scene`, so destructure `{ scene }`:
```ts
// before
test("applyErosionHits drops a wall to flat ground once HP is exhausted", async ({ ctx }) => {
  const grid = buildGrid(ctx.scene);
// after
test("applyErosionHits drops a wall to flat ground once HP is exhausted", async ({ scene }) => {
  const grid = buildGrid(scene);
```

Same for the second test.

**Step 2: Migrate `grid-model.browser.test.ts`**

Import change: same pattern as above.

Tests use `ctx.scene` and `ctx.step(16)`. Destructure `{ scene, clock }`:
```ts
// before
test("adds a terrain actor per cell to the scene", async ({ ctx }) => {
  makeModel(ctx.scene);
  ctx.step(16);
// after
test("adds a terrain actor per cell to the scene", async ({ scene, clock }) => {
  makeModel(scene);
  clock.step(16);
```

Tests that only use `ctx.scene` (all the `describe` block tests) destructure just `{ scene }`.

**Step 3: Migrate `terrain-render.browser.test.ts`**

Import change: `../../test/excalibur-browser-test.ts` to `../../test/excalibur-browser-shared-test.ts`.

Tests only use `ctx.scene`. Destructure `{ scene }`:
```ts
// before
test("wall syncs a Canvas graphic", async ({ ctx }) => {
  // ...
  ctx.scene.add(wall);
// after
test("wall syncs a Canvas graphic", async ({ scene }) => {
  // ...
  scene.add(wall);
```

**Step 4: Run browser tests for these files**

Run: `npx vitest run --project browser src/model/grid-model-erosion.browser.test.ts src/model/grid-model.browser.test.ts src/model/terrain/terrain-render.browser.test.ts`

Expected: all tests PASS

**Step 5: Commit**

```
refactor(test): migrate model browser tests to shared engine fixture
```

---

### Task 3: Migrate view tests

**Files:**
- Modify: `src/view/castle-actor.browser.test.ts`
- Modify: `src/view/sand-layer.browser.test.ts`

**Step 1: Migrate `castle-actor.browser.test.ts`**

Import change: `../test/excalibur-browser-test.ts` to `../test/excalibur-browser-shared-test.ts`.

Test only uses `ctx.scene`. Destructure `{ scene }`:
```ts
// before
test("castle actor renders the castle sprite", async ({ ctx }) => {
  // ...
  ctx.scene.add(castle);
// after
test("castle actor renders the castle sprite", async ({ scene }) => {
  // ...
  scene.add(castle);
```

**Step 2: Migrate `sand-layer.browser.test.ts`**

Import change: same pattern.

The `makeLayer` helper takes a scene parameter, so update calls. Most tests use `ctx.scene`, one test uses `ctx.game.backgroundColor` and `ctx.step`:

```ts
// before
async function makeLayer(scene: import("excalibur").Scene): Promise<SandLayer> {
// (no change to helper signature - it already takes scene)

// Tests using only scene:
test("renders moist sand below the shoreline...", async ({ ctx }) => {
  const layer = await makeLayer(ctx.scene);
// after:
test("renders moist sand below the shoreline...", async ({ scene }) => {
  const layer = await makeLayer(scene);

// The last test uses game, scene, and clock:
// before
test("smooths the blocky seam into a rounded boundary", async ({ ctx }) => {
  ctx.game.backgroundColor = Color.fromHex("#e3cda0");
  const layer = await makeLayer(ctx.scene);
  // ...
  ctx.step(16);
  ctx.step(16);
// after
test("smooths the blocky seam into a rounded boundary", async ({ game, scene, clock }) => {
  game.backgroundColor = Color.fromHex("#e3cda0");
  const layer = await makeLayer(scene);
  // ...
  clock.step(16);
  clock.step(16);
```

**Step 3: Run browser tests for these files**

Run: `npx vitest run --project browser src/view/castle-actor.browser.test.ts src/view/sand-layer.browser.test.ts`

Expected: all tests PASS

**Step 4: Commit**

```
refactor(test): migrate view browser tests to shared engine fixture
```

---

### Task 4: Migrate wave tests

**Files:**
- Modify: `src/wave/wave-dynamic-system.browser.test.ts`
- Modify: `src/wave/wave-field-runtime.browser.test.ts`
- Modify: `src/wave/wave-field-runtime-erosion.browser.test.ts`
- Modify: `src/wave/wave-field-runtime-profile.browser.test.ts`
- Modify: `src/wave/wave-field-runtime-recede.browser.test.ts`
- Modify: `src/wave/wave-field-runtime-terrain.browser.test.ts`
- Modify: `src/wave/wave-render-system.browser.test.ts`

All follow the same import change: `../test/excalibur-browser-test.ts` to `../test/excalibur-browser-shared-test.ts`.

**Step 1: Migrate `wave-render-system.browser.test.ts`**

Single test, uses `ctx.scene` and `ctx.step(16)`. Destructure `{ scene, clock }`:
```ts
test("rasterizes WaterComponents into the overlay each tick", async ({ scene, clock }) => {
  // ctx.scene -> scene, ctx.step(16) -> clock.step(16)
```

**Step 2: Migrate `wave-field-runtime.browser.test.ts`**

Two tests, both use `ctx.scene` and `ctx.step(16)`. Destructure `{ scene, clock }`:
```ts
test("emits WaterCellAdded on fieldEvents as cells become wet", async ({ scene, clock }) => {
  const runtime = new WaveFieldRuntime(scene, flatGrid(), TERRAIN_SLOPE, { surgeWindowMs: 200 });
  // ...
  for (let i = 0; i < 800; i++) {
    clock.step(16);
  }
```

Same pattern for the second test.

**Step 3: Migrate `wave-field-runtime-erosion.browser.test.ts`**

Two tests, both use `ctx.scene` and `ctx.step(16)`. Destructure `{ scene, clock }`:
```ts
test("a wave erodes a low wall...", async ({ scene, clock }) => {
  const grid = buildGrid(scene);
  // ...
  for (let i = 0; i < 2000; i++) {
    clock.step(16);
  }
```

**Step 4: Migrate `wave-field-runtime-profile.browser.test.ts`**

Single test, uses `ctx.scene` and `ctx.step(16)`. Destructure `{ scene, clock }`:
```ts
test("an uneven source profile...", async ({ scene, clock }) => {
  const grid = buildGrid(scene);
  // ...
  for (let i = 0; i < 1500; i++) {
    clock.step(16);
  }
```

**Step 5: Migrate `wave-field-runtime-terrain.browser.test.ts`**

Two tests, use `ctx.scene`, `ctx.step(16)`, and `ctx.step(50)`. Destructure `{ scene, clock }`:
```ts
test("water pooling in a hole...", async ({ scene, clock }) => {
  const grid = buildGrid(scene);
  // ...
  for (let i = 0; i < 1000; i++) {
    clock.step(16);
  }
```

**Step 6: Migrate `wave-field-runtime-recede.browser.test.ts`**

The `framesToDrain` helper takes `ctx: { scene, step }`. Refactor to take scene and clock separately:

```ts
// before
const framesToDrain = async (
  ctx: { scene: import("excalibur").Scene; step: (ms: number) => void },
  recedeCoeff: number,
): Promise<number> => {
  const grid = buildGrid(ctx.scene);
  // ...
  ctx.step(16);

// after
const framesToDrain = async (
  scene: import("excalibur").Scene,
  clock: { step(ms: number): void },
  recedeCoeff: number,
): Promise<number> => {
  const grid = buildGrid(scene);
  // ...
  clock.step(16);
```

Update the test:
```ts
// before
test("a lower recede coefficient drains the wave more slowly", async ({ ctx }) => {
  const fastDrain = await framesToDrain(ctx, 0.2);
  const slowDrain = await framesToDrain(ctx, 0.04);

// after
test("a lower recede coefficient drains the wave more slowly", async ({ scene, clock }) => {
  const fastDrain = await framesToDrain(scene, clock, 0.2);
  const slowDrain = await framesToDrain(scene, clock, 0.04);
```

Note: this test calls `framesToDrain` twice on the same scene. The second call creates a new `GridModel` and `WaveFieldRuntime` on the same scene. The first wave runs to completion (all water entities drained), and `GridModel` constructor calls `reset()` which clears existing actors. This should work without a scene swap.

**Step 7: Migrate `wave-dynamic-system.browser.test.ts`**

The `drive` helper takes `ctx: { step(ms: number): void }`. Refactor to take clock directly:

```ts
// before
const drive = (ctx: { step(ms: number): void }, frames: number, ms = 16) => {
  for (let i = 0; i < frames; i++) {
    ctx.step(ms);
  }
};

// after
const drive = (clock: { step(ms: number): void }, frames: number, ms = 16) => {
  for (let i = 0; i < frames; i++) {
    clock.step(ms);
  }
};
```

All five tests destructure `{ scene, clock }`:
```ts
// before
test("spawns WaterCell actors...", async ({ ctx }) => {
  ctx.scene.world.add(makeSystem(ctx.scene));
  drive(ctx, 60);
  const entities = ctx.scene.world.query([WaterComponent]).entities;

// after
test("spawns WaterCell actors...", async ({ scene, clock }) => {
  scene.world.add(makeSystem(scene));
  drive(clock, 60);
  const entities = scene.world.query([WaterComponent]).entities;
```

The `makeSystem` helper already takes a `scene: Scene` parameter so its calls just change from `ctx.scene` to `scene`.

**Step 8: Run all wave browser tests**

Run: `npx vitest run --project browser src/wave/`

Expected: all tests PASS

**Step 9: Commit**

```
refactor(test): migrate wave browser tests to shared engine fixture
```

---

### Task 5: Final verification

**Step 1: Run all browser tests**

Run: `npx vitest run --project browser`

Expected: all tests PASS

**Step 2: Run full static check**

Run: `node --run static-check`

Expected: PASS

**Step 3: Verify the old fixture is unused**

Run: `grep -r "excalibur-browser-test.ts" src/ --include="*.ts"`

Expected: only the utils import inside `excalibur-browser-shared-test.ts` (and the old fixture file itself). No test files should still reference it.

If the old fixture has zero test consumers, delete both `src/test/excalibur-browser-test.ts` and the `ExcaliburBrowserTestContext` interface + `createExcaliburBrowserTestContext` function from `src/test/excalibur-browser-test-utils.ts`.

**Step 4: Run full static check again if deletions were made**

Run: `node --run static-check`

Expected: PASS

**Step 5: Commit**

```
chore(test): remove unused per-engine browser test fixture
```
