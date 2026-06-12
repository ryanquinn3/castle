# WaterComponent Foundation (M1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce an Excalibur `WaterComponent` that owns a water cell's depth and velocity, and back `WaveSegment.currentDepth` with it, with zero change to gameplay or rendering output.

**Architecture:** `WaterComponent extends ex.Component` is a pure data container. `WaveSegment` (an `ex.Actor`, which is an `ex.Entity`) gains the component via `addComponent`, and `currentDepth` becomes a getter/setter delegating to it. This locks the data shape that the M2 simulation and render systems will share, with no behavior change. The overlay is intentionally not touched here: because `currentDepth` delegates to the component after this milestone, the overlay's existing `actor.currentDepth` read is already component-backed. Making the overlay query the component explicitly is folded into M2, where the dedicated render System and the 2D-field overlay rewrite land together.

**Tech Stack:** TypeScript, Excalibur 0.32, Vitest (unit project `*.test.ts` under jsdom; browser project `*.browser.test.ts` under Playwright). See `docs/testing.md`.

**Repo conventions:** Work on the current branch (this repo does not use worktrees, per `AGENTS.md`). Do not commit or push unless the user asks. Run `node --run test:unit` for the fast loop and `node --run static-check` for the full gate. Both `node --run test:unit -- <file>` and `node --run test:browser -- <file>` accept a path to run a single test file (verified), which is handy for the per-task red/green loop. Committing runs `static-check` as a pre-commit gate.

---

## Background the executor needs

- `WaveSegment` is at `src/wave/wave-segment.ts`. Its constructor (around lines
  52 to 73) calls `super({...})`, sets a collider, hides graphics, sets
  `this.currentDepth = spawn.initialDepth`, then computes `body.mass` from
  `this.currentDepth`, plans cells, and stores `spawnY`/`gridLoc`. `currentDepth`
  is declared as a public field at line 41 and is read/written in many methods
  (`onPreUpdate`, `mergeWith`, `enterRow`, `planWaveCells`, `spawnStillClone`).
- `WaveOverlay` (`src/wave/wave-overlay.ts`) reads `actor.currentDepth` in its
  `onPreUpdate`. It is NOT modified in M1; once `currentDepth` delegates to the
  component (Task 2), that read is automatically component-backed. The explicit
  component query and the overlay rewrite belong to M2.
- Excalibur `Component` is an abstract class with no abstract members; extend it
  and add data fields. Add to an entity with `actor.addComponent(component)`,
  retrieve with `actor.get(Ctor)`, check with `actor.has(Ctor)`.
- Existing browser test helpers live in `src/wave/wave-segment.browser.test.ts`:
  `spawn(partial)`, `grid(partial)`, and `makeSegment(ctx, spawnInput,
  gridInput)`. Reuse them.
- The shared browser fixture is imported as
  `import { expect, test } from "../test/excalibur-browser-test.ts"`.
- A full-game browser test, `src/wave-visual-baseline.browser.test.ts`, boots the
  game into Tide and screenshots a wave at peak reach. It runs in the browser
  project and reads segments via `instanceof WaveSegment` and `pos.y` (not
  `currentDepth`), so M1's delegation change will not break it. `static-check`
  runs it; confirm it stays green and that the screenshot still shows the wave.

---

## Task 1: Create the WaterComponent data class

**Files:**
- Create: `src/wave/water-component.ts`
- Test: `src/wave/water-component.test.ts` (unit)

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { Vector } from "excalibur";
import { WaterComponent } from "./water-component.ts";

describe("WaterComponent", () => {
  it("stores depth and velocity", () => {
    const c = new WaterComponent(4, new Vector(0, 90));
    expect(c.depth).toBe(4);
    expect(c.velocity.x).toBe(0);
    expect(c.velocity.y).toBe(90);
  });

  it("defaults velocity to a zero vector", () => {
    const c = new WaterComponent(2);
    expect(c.velocity.x).toBe(0);
    expect(c.velocity.y).toBe(0);
  });

  it("depth is mutable", () => {
    const c = new WaterComponent(4);
    c.depth = 1.5;
    expect(c.depth).toBe(1.5);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `node --run test:unit -- src/wave/water-component.test.ts`
Expected: FAIL, cannot resolve `./water-component.ts`.

**Step 3: Write the minimal implementation**

```ts
import { Component, Vector } from "excalibur";

/**
 * Per-cell water state for the pressure-driven wave simulation. The single
 * source of truth for a water cell's depth and velocity. Attached to wave
 * actors; future flux and render systems read and write it.
 */
export class WaterComponent extends Component {
  depth: number;
  velocity: Vector;

  constructor(depth = 0, velocity: Vector = new Vector(0, 0)) {
    super();
    this.depth = depth;
    this.velocity = velocity;
  }
}
```

**Step 4: Run the test to verify it passes**

Run: `node --run test:unit -- src/wave/water-component.test.ts`
Expected: PASS (3 tests).

**Step 5: Run lint + typecheck**

Run: `node --run static-check`
Expected: PASS.

**Step 6: Commit (only if the user has authorized committing)**

```bash
git add src/wave/water-component.ts src/wave/water-component.test.ts
git commit -m "feat(wave): add WaterComponent data container"
```

---

## Task 2: Back WaveSegment.currentDepth with a WaterComponent

**Files:**
- Modify: `src/wave/wave-segment.ts`
- Test: `src/wave/wave-segment.browser.test.ts`

**Step 1: Write the failing test**

Add this test inside the top-level `describe("WaveSegment browser behavior", ...)`
block in `src/wave/wave-segment.browser.test.ts`, and add `WaterComponent` to the
imports (`import { WaterComponent } from "./water-component.ts";`):

```ts
test("owns a WaterComponent that backs currentDepth", async ({ ctx }) => {
  const { segment } = await makeSegment(ctx, { initialDepth: 4 });

  const water = segment.get(WaterComponent);
  expect(water).toBeDefined();
  expect(water?.depth).toBe(4);

  // Writing currentDepth updates the component.
  segment.currentDepth = 2.5;
  expect(water?.depth).toBe(2.5);

  // Writing the component updates currentDepth.
  water!.depth = 1;
  expect(segment.currentDepth).toBe(1);
});
```

**Step 2: Run the test to verify it fails**

Run: `node --run test:browser -- src/wave/wave-segment.browser.test.ts`
Expected: FAIL, `segment.get(WaterComponent)` is undefined.

**Step 3: Implement the change in `src/wave/wave-segment.ts`**

1. Add the import near the other local imports at the top:

```ts
import { WaterComponent } from "./water-component.ts";
```

2. Remove the public field declaration `currentDepth: number;` (currently around
   line 41).

3. Add a private component reference alongside the other private fields, e.g.
   below `private gridLoc: Vector;`:

```ts
  private readonly water: WaterComponent;
```

4. In the constructor, replace the line `this.currentDepth = spawn.initialDepth;`
   with the component creation and attachment, placed before the `this.body.mass`
   line that reads `currentDepth`:

```ts
    this.water = new WaterComponent(spawn.initialDepth);
    this.addComponent(this.water);
```

   The constructor sequence becomes: `super(...)`, set collider, hide graphics,
   create + add `this.water`, set `body.mass` (reads `currentDepth`), plan cells,
   set `spawnY`, set `gridLoc`.

5. Add the getter/setter so all existing `currentDepth` reads and writes route
   through the component. Place them near the other accessors (for example just
   below the `get col()` accessor):

```ts
  get currentDepth(): number {
    return this.water.depth;
  }

  set currentDepth(value: number) {
    this.water.depth = value;
  }
```

No other method bodies change: they keep using `this.currentDepth`, now backed by
the component.

**Step 4: Run the new test and the full existing segment suite**

Run: `node --run test:browser -- src/wave/wave-segment.browser.test.ts`
Expected: PASS, including the existing merge/surge/castle tests that read
`segment.currentDepth` (they exercise the delegation indirectly).

**Step 5: Run lint + typecheck + full suite**

Run: `node --run static-check`
Expected: PASS.

**Step 6: Commit (only if the user has authorized committing)**

```bash
git add src/wave/wave-segment.ts src/wave/wave-segment.browser.test.ts
git commit -m "refactor(wave): back WaveSegment.currentDepth with WaterComponent"
```

---

## Final verification

Run the full check suite and confirm it is green before declaring M1 done:

Run: `node --run static-check`
Expected: PASS (tsc, lint, unit, knip, browser).

## Definition of done

- `WaterComponent` exists with depth + velocity and passing unit tests.
- Every `WaveSegment` owns a `WaterComponent`; `currentDepth` delegates both ways.
- The overlay is untouched and still renders correctly (its `actor.currentDepth`
  read is now component-backed via the Task 2 delegation).
- Gameplay and rendering are unchanged; `node --run static-check` is green.

## Notes for the executor

- Do not wire velocity into anything yet. `WaterComponent.velocity` exists as part
  of the locked data shape but stays at its default in M1; it becomes load-bearing
  in M2 (flux) and M4 (erosion).
- Do not touch the overlay or add any systems here. M1 is only the data container
  and the `currentDepth` delegation. The explicit overlay-reads-the-component
  change, the render System, and the 2D-field overlay rewrite are all M2 work; in
  M1 the overlay keeps reading `actor.currentDepth` in its own `onPreUpdate`
  (now component-backed for free).
- The single-file test-runner form (`node --run test:unit -- <file>` /
  `node --run test:browser -- <file>`) is verified to work in this repo, so use it
  for the fast red/green loop; `static-check` remains the full gate.
