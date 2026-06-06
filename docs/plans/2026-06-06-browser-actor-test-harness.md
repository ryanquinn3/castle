# Browser Actor Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add high-value browser tests for `WaveSegment` and `StaticWaterActor` using real Excalibur actors, scenes, actions, and test clocks instead of framework mocks.

**Architecture:** Create a small browser-only Excalibur test harness based on upstream Excalibur `TestUtils`, then use it from behavior-focused actor tests. Keep test count low and assert gameplay lifecycle outcomes, not constructor wiring or sprite plumbing.

**Tech Stack:** TypeScript, Vitest browser project, Excalibur 0.32, Playwright Chromium provider.

---

## Constraints

- Do not mock `excalibur`.
- Do not define fake `Actor`, `Vector`, `CollisionType`, `actions`, or fake Excalibur action chains.
- Do not add constructor-only tests for implementation details like `z`, collision type, sprite selection, or raw dimensions.
- Do not extract pure wave logic in this pass.
- Do not delete the disabled jsdom mock tests until replacement browser coverage exists and passes.
- Prefer fewer tests that cover user-visible/gameplay behavior and actor lifecycle.

## Reference Pattern

Excalibur upstream test utility reference was read with:

```bash
gh api "repos/excaliburjs/Excalibur/contents/src/spec/__util__/test-utils.ts?ref=main" -H "Accept: application/vnd.github.raw"
```

Patterns to copy into this repo:

- Build a real `ex.Engine` with fixed size and testing-oriented options.
- Reset Excalibur global debug and feature flags between tests.
- Suppress boot message, browser feature checks, HiDPI scaling, and play button.
- Use `ex.DisplayMode.Fixed`.
- Make canvas style deterministic.
- Use a test clock for deterministic frame stepping.
- Stop and dispose the engine after each test.

This repo should prefer `game.debug.useTestClock()` over manually assigning `game.clock = game.clock.toTestClock()` because that API exists in the installed Excalibur runtime.

## File Structure

- Create `src/test/excalibur-browser-test-utils.ts`: reusable browser test harness for real Excalibur engine/scene setup.
- Create `src/wave/wave-segment.browser.test.ts`: behavior-focused tests for real `WaveSegment` lifecycle and event emission.
- Create `src/wave/static-water-actor.browser.test.ts`: behavior-focused tests for real `StaticWaterActor` cleanup behavior.
- Leave `src/wave/wave-segment.test.ts` unchanged during this implementation.
- Leave `src/wave/static-water-actor.test.ts` unchanged during this implementation.

## Task 1: Add Excalibur Browser Test Harness

**Files:**
- Create: `src/test/excalibur-browser-test-utils.ts`

- [ ] **Step 1: Create the test helper file**

Create `src/test/excalibur-browser-test-utils.ts` with this implementation:

```ts
import * as ex from "excalibur";

interface DebugConfigWithTestClock extends ex.DebugConfig {
  useTestClock(): TestClockLike;
}

export interface TestClockLike {
  step(ms: number): void;
}

export interface ExcaliburBrowserTestContext {
  game: ex.Engine;
  scene: ex.Scene;
  clock: TestClockLike;
  step(ms: number): void;
  dispose(): void;
}

export function createExcaliburBrowserTestContext(
  options: ex.EngineOptions = {},
): ExcaliburBrowserTestContext {
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

  const clock = (game.debug as DebugConfigWithTestClock).useTestClock();
  const scene = new ex.Scene();
  game.addScene("test", scene);

  return {
    game,
    scene,
    clock,
    step: (ms: number) => {
      scene.update(game, ms);
    },
    dispose: () => {
      game.stop();
      game.dispose();
    },
  };
}
```

- [ ] **Step 2: Run browser tests to verify helper compiles**

Run:

```bash
node --run test:browser
```

Expected: existing browser tests still pass, and TypeScript/Vite accepts `src/test/excalibur-browser-test-utils.ts`.

## Task 2: Add `WaveSegment` Browser Behavior Tests

**Files:**
- Create: `src/wave/wave-segment.browser.test.ts`
- Use: `src/test/excalibur-browser-test-utils.ts`
- Use: `src/wave/wave-segment.ts`
- Use: `src/wave/wave-segment-types.ts`

- [ ] **Step 1: Create test helpers in the browser test file**

Create `src/wave/wave-segment.browser.test.ts` with shared helpers for spawn, grid, event capture, and deterministic setup:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { createExcaliburBrowserTestContext, type ExcaliburBrowserTestContext } from "../test/excalibur-browser-test-utils.ts";
import { WaveSegment } from "./wave-segment.ts";
import type { WaveSegmentEvent, WaveSegmentGrid, WaveSegmentSpawn } from "./wave-segment-types.ts";

let ctx: ExcaliburBrowserTestContext | null = null;

afterEach(() => {
  ctx?.dispose();
  ctx = null;
});

function spawn(input: Partial<WaveSegmentSpawn> = {}): WaveSegmentSpawn {
  return {
    col: 1,
    x: 24,
    y: -16,
    initialDepth: 4,
    speed: 90,
    recedeSpeed: -45,
    maxTravelDistance: 300,
    ...input,
  };
}

function grid(overrides: Partial<WaveSegmentGrid> = {}): WaveSegmentGrid {
  return {
    gridLeft: 0,
    gridTop: 0,
    tileSize: 16,
    height: 4,
    getElevation: () => 0,
    effectiveHoleDepth: () => 0,
    isCastle: () => false,
    ...overrides,
  };
}

function makeSegment(
  spawnInput: Partial<WaveSegmentSpawn> = {},
  gridInput: Partial<WaveSegmentGrid> = {},
): { segment: WaveSegment; events: WaveSegmentEvent[] } {
  ctx = createExcaliburBrowserTestContext();
  const events: WaveSegmentEvent[] = [];
  const segment = new WaveSegment(spawn(spawnInput), grid(gridInput), 0.5);
  segment.onWaveEvent((event) => events.push(event));
  ctx.scene.add(segment);
  return { segment, events };
}

describe("WaveSegment browser behavior", () => {
});
```

- [ ] **Step 2: Add surging row-entry test**

Add this test inside the `describe` block:

```ts
it("surges through rows and emits gameplay events", () => {
  const { segment, events } = makeSegment();

  segment.pos.y = -8;
  ctx!.step(16);
  segment.pos.y = 8;
  ctx!.step(16);

  expect(events).toEqual([
    { type: "tileEntered", col: 1, row: 0, depth: 4 },
    { type: "tileCovered", col: 1, row: 0, depth: 3.5 },
    { type: "tileEntered", col: 1, row: 1, depth: 3.5 },
  ]);
  expect(segment.state).toBe("surging");
});
```

- [ ] **Step 3: Add blocked crash/recede/dissipate test**

Add this test inside the `describe` block:

```ts
it("blocked wave crashes, recedes, and dissipates", () => {
  const { segment, events } = makeSegment(
    { initialDepth: 2, recedeSpeed: -45 },
    { getElevation: () => 2 },
  );

  segment.pos.y = 8;
  ctx!.step(16);

  expect(events).toContainEqual({ type: "blocked", col: 1, row: 0, depth: 2 });
  expect(segment.state).toBe("crashing");

  ctx!.step(250);
  expect(segment.state).toBe("receding");

  segment.pos.y = -40;
  ctx!.step(16);

  expect(segment.state).toBe("dead");
  expect(events[events.length - 1]).toEqual({ type: "dissipated", col: 1, row: 0 });
  expect(segment.active).toBe(false);
});
```

- [ ] **Step 4: Add castle recession test**

Add this test inside the `describe` block:

```ts
it("castle entry emits castleFlooded and begins recession", () => {
  const { segment, events } = makeSegment({}, { isCastle: () => true });

  segment.pos.y = 8;
  ctx!.step(16);

  expect(events).toContainEqual({ type: "tileEntered", col: 1, row: 0, depth: 4 });
  expect(events).toContainEqual({ type: "castleFlooded", col: 1, row: 0, depth: 4 });
  expect(segment.state).toBe("crashing");

  ctx!.step(250);

  expect(segment.state).toBe("receding");
});
```

- [ ] **Step 5: Run the browser tests**

Run:

```bash
node --run test:browser
```

Expected: `wave-segment.browser.test.ts` passes with real Excalibur imports and no framework mocks.

## Task 3: Add `StaticWaterActor` Browser Behavior Tests

**Files:**
- Create: `src/wave/static-water-actor.browser.test.ts`
- Use: `src/test/excalibur-browser-test-utils.ts`
- Use: `src/wave/static-water-actor.ts`
- Use: `src/wave/wave-segment.ts`

- [ ] **Step 1: Create test helpers in the browser test file**

Create `src/wave/static-water-actor.browser.test.ts` with shared helpers:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { createExcaliburBrowserTestContext, type ExcaliburBrowserTestContext } from "../test/excalibur-browser-test-utils.ts";
import { Resources } from "../resources.ts";
import { StaticWaterActor } from "./static-water-actor.ts";
import { WaveSegment } from "./wave-segment.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave-segment-types.ts";

let ctx: ExcaliburBrowserTestContext | null = null;

afterEach(() => {
  ctx?.dispose();
  ctx = null;
});

function spawn(input: Partial<WaveSegmentSpawn> = {}): WaveSegmentSpawn {
  return {
    col: 1,
    x: 24,
    y: -16,
    initialDepth: 4,
    speed: 90,
    recedeSpeed: -45,
    maxTravelDistance: 300,
    ...input,
  };
}

function grid(): WaveSegmentGrid {
  return {
    gridLeft: 0,
    gridTop: 0,
    tileSize: 16,
    height: 4,
    getElevation: () => 0,
    effectiveHoleDepth: () => 0,
    isCastle: () => false,
  };
}

function makeOwner(input: Partial<WaveSegmentSpawn> = {}): WaveSegment {
  return new WaveSegment(spawn(input), grid(), 0.5);
}

function makeWater(owner: WaveSegment): StaticWaterActor {
  ctx = createExcaliburBrowserTestContext();
  ctx.scene.add(owner);
  const water = new StaticWaterActor({
    col: 2,
    row: 3,
    x: 40,
    y: 56,
    tileSize: 16,
    depth: 4,
    owner,
    image: Resources.BeachTileset,
  });
  ctx.scene.add(water);
  return water;
}

function emitOwnerEvent(water: StaticWaterActor, owner: unknown): void {
  water.emit("precollision", { other: { owner } });
}

describe("StaticWaterActor browser behavior", () => {
});
```

- [ ] **Step 2: Add receding-owner cleanup test**

Add this test inside the `describe` block:

```ts
it("receding owner removes covered water", () => {
  const owner = makeOwner();
  const water = makeWater(owner);

  owner.state = "receding";
  owner.pos.y = 64;

  emitOwnerEvent(water, owner);
  ctx!.step(50);

  expect(water.active).toBe(false);
});
```

- [ ] **Step 3: Add ignored-event test**

Add this test inside the `describe` block:

```ts
it("ignores non-owner and non-receding owner", () => {
  const owner = makeOwner();
  const water = makeWater(owner);
  const other = makeOwner({ col: 3, x: 40 });
  ctx!.scene.add(other);

  other.state = "receding";
  other.pos.y = 64;
  emitOwnerEvent(water, other);
  ctx!.step(50);

  expect(water.active).toBe(true);

  owner.state = "surging";
  owner.pos.y = 64;
  emitOwnerEvent(water, owner);
  ctx!.step(50);

  expect(water.active).toBe(true);
});
```

- [ ] **Step 4: Run the browser tests**

Run:

```bash
node --run test:browser
```

Expected: `static-water-actor.browser.test.ts` passes with real Excalibur imports and no framework mocks.

## Task 4: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run browser tests**

Run:

```bash
node --run test:browser
```

Expected: all browser tests pass.

- [ ] **Step 2: Run unit tests**

Run:

```bash
node --run test:unit
```

Expected: all unit tests pass. The currently disabled wave actor jsdom mock test files remain disabled in this pass.

- [ ] **Step 3: Run build**

Run:

```bash
node --run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Run lint**

Run:

```bash
node --run lint
```

Expected: no lint failures from new plan implementation.

## Acceptance Criteria

- New browser tests import real `excalibur` and do not mock it.
- New browser tests use a reusable Excalibur harness instead of hand-rolled actor fakes.
- Tests assert meaningful gameplay behavior and lifecycle results.
- Tests avoid constructor-only implementation assertions.
- The plan leaves disabled jsdom mock tests untouched until replacement coverage is proven.
- `node --run test:browser`, `node --run test:unit`, `node --run build`, and `node --run lint` pass after implementation.

## Self-Review

- Spec coverage: covers browser harness, `WaveSegment` actor tests, `StaticWaterActor` actor tests, and verification.
- Placeholder scan: no deferred placeholder work is included.
- Type consistency: helper names and paths are consistent across tasks.
