# Shared Engine Browser Test Fixture

## Problem

Each browser test creates and disposes an Excalibur engine instance. Engine boot (WebGL context, canvas setup, `game.start()`) is expensive. Files with many tests (e.g., `grid-model.browser.test.ts` with 17 tests) pay this cost per test.

## Approach

Use Vitest 3.2's `test.extend` `{ scope: 'file' }` option to create one engine per test file and swap in a fresh `ex.Scene` per test.

### Why this is safe

- Physics world, ECS world, camera, and scene-level input are all per-scene
- Creating a new `Scene` instance (not just `clear()`) gives fully fresh state
- No existing tests register engine-level listeners (`game.input.on`, `game.events.on`)
- All scene-scoped state (actors, systems, event emitters) dies with the scene

### Fixture code

```ts
// src/test/excalibur-browser-shared-test.ts
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

`createSharedEngine()` is a new export from the existing utils file. Same engine options as `createExcaliburBrowserTestContext` but returns just the engine, no bundled context object.

### Migration pattern

Before:
```ts
import { expect, test } from "../test/excalibur-browser-test.ts";

test("does something", async ({ ctx }) => {
  const model = new GridModel(ctx.scene, 3, 3);
  ctx.step(16);
  // assertions using ctx.game, ctx.scene, ctx.clock
});
```

After:
```ts
import { expect, test } from "../test/excalibur-browser-shared-test.ts";

test("does something", async ({ game, scene, clock }) => {
  const model = new GridModel(scene, 3, 3);
  clock.step(16);
  // fixtures pulled directly by name
});
```

Tests only destructure the fixtures they need.

## Scope

All 12 files currently importing `excalibur-browser-test.ts`. The 3 files using `game-browser-test.ts` (full app boot) are out of scope.

## Non-goals

- Not changing `game-browser-test.ts` or its consumers
- Not removing the per-engine fixture (keep it for tests that need custom `EngineOptions` or full engine isolation)
