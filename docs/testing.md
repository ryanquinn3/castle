# Testing

Two Vitest projects, split by filename:

| Project | Files | Env | Run |
|---------|-------|-----|-----|
| `unit`    | `*.test.ts`         | jsdom + stubbed canvas/DOM | `node --run test:unit` |
| `browser` | `*.browser.test.ts` | Playwright (headless chromium) | `node --run test:browser` |

`node --run test:unit` is the fast loop and runs in pre-commit. `test:browser` runs the real engine and is slower.

## Test value

Write tests for behavior that would catch real regressions. Avoid low-value brittle tests, especially assertions that TypeScript already guarantees, mirror implementation details, or fail after harmless config/default changes.

Prefer stable inputs and externally visible outcomes. If a test mostly locks down incidental structure, exact option objects, or duplicated type constraints, delete it or move the assertion into a more meaningful behavior test.

## When to use which

**Browser test by default** for anything that is an Excalibur actor or renders: tiles, grid view, wave renderer, sessions/scenes, HUD, anything touching a real canvas, engine clock, or graphics.

**Unit test only** for pure logic with no rendering: model layer (`grid-model`, `flow-field`, `wave-simulation`, terrain elevation/erosion math, inventory), config, and standalone helpers.

If you're unsure whether jsdom's stubs will hold, it renders. Write a browser test.

## Browser tests

Browser tests are expensive: each test suite in a `*.browser.test.ts` file adds to the total browser test stage cost. Do not use browser tests as unit tests.

Keep browser tests high-signal and black-box where possible: verify real rendering, actor/scene integration, engine clock behavior, or user-visible outcomes that jsdom/unit tests cannot cover.

Import the shared fixture; don't re-roll the engine setup:

```ts
import { test, expect } from "./test/excalibur-browser-test.ts";

test("renders on the shared harness", async ({ ctx }) => {
  ctx.scene.add(myActor);
  ctx.step(16); // advance one frame on the test clock
  expect(...).toBe(...);
});
```

`ctx` gives `game`, `scene`, `clock`, `step(ms)`, and `dispose()` (cleanup is automatic). Need engine options? Call `createExcaliburBrowserTestContext({...})` directly in your own fixture.

## Capturing screenshots

Any browser test can visually capture the page via Vitest's `page` API, independent of how the test is set up. Useful for verifying rendering changes by eye.

```ts
import { page } from "vitest/browser";
import { test } from "./test/excalibur-browser-test.ts";

test("renders the tile", async ({ ctx }) => {
  ctx.scene.add(myActor);
  ctx.step(16);
  await page.screenshot(); // -> test-results/screenshots/
});
```

- `page.screenshot()` writes a PNG to `test-results/screenshots/` (set by `screenshotDirectory` in `vitest.config.ts`); pass `{ path }` to override.
- Works with the shared `ctx` fixture or a full-app boot alike; it captures whatever is currently on the page.
- To capture after the right frame, advance the clock (`ctx.step(...)`) or gate on `vi.waitFor(...)` before calling `screenshot()`.

## Unit tests

Run under jsdom with `vitest.setup.ts` stubbing `window`, `Image`, and `document.createElement("canvas")`. These satisfy Excalibur's module-load constructors but do not render, so don't assert on pixels or graphics in a unit test.

## Fixtures over hooks

Prefer `baseTest.extend("name", async ({}, { onCleanup }) => {...})` over `beforeEach`/`afterEach`. Register teardown with `onCleanup(...)` so it still runs when a test fails.

## Sound

All playback goes through `playSound()` (`src/sound.ts`). Tests set `__SOUNDS_DISABLED__` so audio is skipped (jsdom has no real Audio).
