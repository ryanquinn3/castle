# Trapped-Water Recede Seepage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop the pressure-driven wave phase from hanging when water is trapped in a wall-enclosed basin, by adding a small environmental seepage that drains resting water during the recede phase.

**Architecture:** Add a `postupdate` hook to `WaveDynamicSystem` that, only while the source is closed (recede), decrements every live `WaterComponent`'s depth by a flat per-millisecond rate. Holes are left untouched *without any explicit check*: `applyTerrainFeedback` runs inside `update()` and a filling hole absorbs its surface water into `puddleDepth` before `postupdate` ever sees it, so a universal decrement only ever touches water that holes can't hold. The seepage drives trapped depth below `PRESSURE_DRAIN_THRESHOLD`; the next frame's flux step drops the cell, and the wave's existing `cells.length === 0` completion check fires.

**Tech Stack:** TypeScript, Excalibur.js ECS (`System.postupdate`), Vitest browser project.

**Repo rules:** No git worktrees (AGENTS.md). Work on the current branch `feat/pressure-model`. `node --run static-check` (tsc, lint, knip, unit, browser) is the pre-commit gate, so every commit must be green. `level-mode`/`tide-mode` browser screenshot tests are known-flaky under parallel load and pass in isolation — retry those rather than treating them as failures.

**Why only two tasks each commit (not one commit per step):** the pre-commit gate runs the whole suite plus knip. A standalone commit of the failing regression test would be blocked (red suite), and a standalone commit of the new config constant would likely be blocked by knip (unused export). So the failing test, the constant, and the implementation form one green committable unit. Task 1 is that unit (TDD cycle as internal steps, then commit); Task 2 is docs (commits separately).

**Design background (read first):**
- Bug writeup: `docs/bugs/2026-06-14-trapped-water-never-drains.md`
- Field timing/sequence: `docs/notes/2026-06-15-pressure-wave-field-timing.md`
- The two existing sinks are a lower-head neighbor and the ocean sink north of row 0; an interior basin reaches neither. Hole absorption lives in `src/wave/wave-terrain-feedback.ts` (`applyTerrainFeedback`, the `capacity <= 0` vs `> 0` branch).

---

### Task 1: Recede-phase seepage (TDD), then commit

A 1-wide column `[elev 0, 2, 0, 2]` makes a deterministic trap. The source pins row 0 to depth 4 during surge, water fills the column, and after the source closes it drains north only until the elevation-2 crest at row 1 blocks it, leaving depth ~2 trapped at row 2 (head 2). With no seepage that cell never drops below the threshold, so the system never completes. The test asserts it *does* complete; the implementation makes it so.

**Files:**
- Test: `src/wave/wave-dynamic-system.browser.test.ts` (add a test; reuse the existing `drive` helper at the top of the file)
- Modify: `src/config.ts` (insert after `PRESSURE_DRAIN_THRESHOLD`, currently line 157)
- Modify: `src/wave/wave-dynamic-system.ts` (add a `PRESSURE_SEEP_RATE_PER_MS` import; add a `postupdate` method to the `WaveDynamicSystem` class, right after `update`, before `readCells`)

**Step 1: Write the failing test**

Add this test to `src/wave/wave-dynamic-system.browser.test.ts` (after the existing `onResolveCells.done` test):

```ts
test("drains water trapped in a wall-enclosed basin so the wave resolves", async ({ ctx }) => {
  // 1-wide column: elev [0, 2, 0, 2]. Row 0 is the open source; the elev-2 cell
  // at row 1 is a crest that, once the source closes, blocks the row-2 basin from
  // draining north to the ocean. Without seepage the basin holds ~depth 2 forever.
  const ground = [0, 2, 0, 2];
  let completed = false;
  ctx.scene.world.add(
    new WaveDynamicSystem({
      scene: ctx.scene,
      width: 1,
      height: 4,
      sourceDepths: [4],
      groundAt: (_col, row) => ground[row],
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
  drive(ctx, 600);

  expect(completed).toBe(true);
  expect(ctx.scene.world.query([WaterComponent]).entities.length).toBe(0);
});
```

**Step 2: Run the test to verify it fails for the right reason**

Run: `node --run test:browser -- src/wave/wave-dynamic-system.browser.test.ts`
Expected: the new test FAILS (`expected false to be true` for `completed`, and water entities remain). The other 4 tests still pass.

> If it unexpectedly passes, the trap geometry isn't trapping. Confirm by logging `ctx.scene.world.query([WaterComponent]).entities.length` late in the drive — it should be `>= 1` and stable. Do not proceed until the test fails because water is trapped and the wave never completes.

**Step 3: Add the seepage rate constant**

Insert into `src/config.ts` immediately after the `PRESSURE_DRAIN_THRESHOLD` line:

```ts
/**
 * Recede-phase seepage: depth removed per millisecond from every resting water
 * cell once the source closes, representing the sand absorbing standing water.
 * Applied per render frame (scaled by elapsed) in WaveDynamicSystem.postupdate,
 * so it is frame-rate independent. Its real job is termination: water trapped in
 * a wall-enclosed basin has no flux sink, so without this the wave phase hangs
 * (see docs/bugs/2026-06-14-trapped-water-never-drains.md). It is negligible for
 * flowing water (flux removes far more) and decisive only where flux is absent.
 * A depth-2 basin drains in ~2 / rate ms (~1.7s at 0.0012). Feel/tuning knob.
 */
export const PRESSURE_SEEP_RATE_PER_MS = 0.0012;
```

**Step 4: Add the import and the `postupdate` method**

In `src/wave/wave-dynamic-system.ts`, add `PRESSURE_SEEP_RATE_PER_MS` to the existing `from "../config.ts"` import block (keep the list ordering consistent with the surrounding entries).

Insert into the `WaveDynamicSystem` class, immediately after the closing brace of `update(elapsed: number)`:

```ts
  /**
   * Environmental seepage (the sand absorbing standing water), applied only during
   * recede. Runs per render frame, after update() — so applyTerrainFeedback has
   * already pulled any filling hole's surface water into puddleDepth this frame.
   * That ordering is load-bearing: it means a universal decrement never steals
   * water from an actively-filling hole (it has no live surface cell left), only
   * from flat ground / full holes / wall-enclosed basins. Trapped basin water has
   * no flux sink, so this is what lets the wave terminate; the next update()'s
   * flux step drops any cell this pushes below the drain threshold.
   */
  postupdate(_scene: Scene, elapsed: number): void {
    if (this.completed || this.sourceOpen) {
      return;
    }
    const seep = PRESSURE_SEEP_RATE_PER_MS * elapsed;
    if (seep <= 0) {
      return;
    }
    for (const entity of this.query.entities) {
      const water = entity.get(WaterComponent)!;
      water.depth = Math.max(0, water.depth - seep);
    }
  }
```

(`Scene` is already imported as a type; `WaterComponent` and `this.query` already exist.)

**Step 5: Run the regression test to verify it passes**

Run: `node --run test:browser -- src/wave/wave-dynamic-system.browser.test.ts`
Expected: all 5 tests PASS, including "drains water trapped in a wall-enclosed basin so the wave resolves".

> If the new test still fails (never completes), confirm Excalibur is calling `postupdate` in this harness by temporarily adding a counter. If it is not invoked, the fallback is to fold the same decrement into the tail of `update()` gated on `!this.sourceOpen` after the completion check. Prefer `postupdate`; only fall back if proven necessary.

**Step 6: Verify surge/recede/hole suites are unaffected**

Seepage is gated to recede (`!sourceOpen`), so surge-phase tests, the `WaterCellAdded` wiring, the tuned recede, and hole absorption must all be untouched.

Run: `node --run test:browser -- src/wave/wave-dynamic-system.browser.test.ts src/wave/wave-field-runtime.browser.test.ts src/wave/wave-field-runtime-recede.browser.test.ts src/wave/wave-field-runtime-terrain.browser.test.ts`
Expected: all PASS.

**Step 7: Run the full pre-commit gate**

Run: `node --run static-check`
Expected: tsc/lint/knip/unit clean; browser green except possibly the known-flaky `level-mode`/`tide-mode` boot-screenshot tests. If only those fail, confirm they pass in isolation:

Run: `node --run test:browser -- src/level-mode.browser.test.ts src/tide-mode.browser.test.ts`
Expected: PASS.

**Step 8: Commit**

```bash
git add src/config.ts src/wave/wave-dynamic-system.ts src/wave/wave-dynamic-system.browser.test.ts
git commit -m "fix(wave): drain trapped basin water via recede-phase seepage"
```

---

### Task 2: Documentation, then commit

**Files:**
- Modify: `docs/bugs/2026-06-14-trapped-water-never-drains.md`
- Modify: `docs/notes/2026-06-15-pressure-wave-field-timing.md`
- Modify: `docs/gameplay.md`

**Step 1: Mark the bug fixed and record the solution**

In `docs/bugs/2026-06-14-trapped-water-never-drains.md`:
- Change `**Status:** open` to `**Status:** fixed (2026-06-15)`.
- Replace the "Fix direction (unconfirmed)" section with a "Fix" section: recede-phase environmental seepage in `WaveDynamicSystem.postupdate` (`PRESSURE_SEEP_RATE_PER_MS`), why holes are unaffected (absorption precedes seepage in the frame), and that termination now rides on the next flux step dropping the seeped cell below the threshold.
- Refresh the drifted code line references in "Root cause" (the `WaterCellAdded` change shifted `wave-dynamic-system.ts` by ~12 lines). Find current values:

  Run: `grep -n "neighborHead) \* coeff\|!this.sourceOpen && cells.length" src/wave/wave-dynamic-system.ts` and `grep -n "PRESSURE_DRAIN_THRESHOLD =" src/config.ts`

  Update the citations (the `computeFluxStep` outflow line, the completion-check line, and the `PRESSURE_DRAIN_THRESHOLD` line) to what grep returns.

**Step 2: Add the third sink to the timing note**

In `docs/notes/2026-06-15-pressure-wave-field-timing.md`, update the sinks description (currently "two sinks: a lower-head neighbor and the ocean sink") to note a third, recede-only sink: flat-land seepage (`PRESSURE_SEEP_RATE_PER_MS`) applied in `WaveDynamicSystem.postupdate`, which guarantees the wet-cell set empties even when water is geometrically trapped.

**Step 3: Note the behavior in the gameplay doc**

In `docs/gameplay.md`, near the existing water/wave description, add one sentence: water left standing where it cannot flow out (e.g. a wall-enclosed basin) soaks into the sand during the recede and clears before the wave ends.

**Step 4: Run the pre-commit gate**

Run: `node --run static-check`
Expected: green (docs-only change; retry the known-flaky boot tests in isolation if needed, as in Task 1 Step 7).

**Step 5: Commit**

```bash
git add docs/bugs/2026-06-14-trapped-water-never-drains.md docs/notes/2026-06-15-pressure-wave-field-timing.md docs/gameplay.md
git commit -m "docs(wave): record trapped-water seepage fix"
```

---

## Out of scope (YAGNI)

- No safety timeout (the seepage proof already bounds wave duration; decided in brainstorming).
- No land-locked basin graph detection (water clears between waves anyway; not needed once seepage drains it).
- No changes to `computeFluxStep` (kept pure; seepage is environmental, not flux).
- No session wiring (seepage is internal to the system and gated by `sourceOpen`; the real game already runs the system via `WaveFieldRuntime`).
