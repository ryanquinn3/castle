# Browser Test Performance Analysis

**Date**: 2025-06-15
**Suite**: `node --run test:browser` (18 files, 63 tests, 54s wall clock)

## Top-level numbers

| Metric | Value |
|--------|-------|
| Wall clock | 54.2s |
| Sum of file durations | 84.1s |
| Effective parallelism | 1.55x (with `maxWorkers: 2`) |
| Files > 5s | 5 |
| Files < 1s | 8 |

The 5 slowest files account for ~63s of the 84s cumulative runtime:

| File | Duration | Tests | Root cause |
|------|----------|-------|------------|
| `wave-visual-capture` | 20.6s | 7 | 7 scenarios x 4 screenshots x 320 frame-steps each |
| `level-mode` | 14.0s | 1 | Full `startGame` boot + 1s real-time sleep |
| `wave-visual-baseline` | 11.6s | 1 | Full `startGame` boot + two real-time `waitFor` polls (5s + 8s) |
| `wave-field-visual-baseline` | 10.7s | 1 | Full `startGame` boot + real-time `waitFor` poll |
| `tide-mode` | 5.9s | 1 | Full `startGame` boot + 1s real-time sleep |

## Themes

### 1. Full-app boot per file (4 files, ~46s cumulative)

`level-mode`, `tide-mode`, `wave-visual-baseline`, and `wave-field-visual-baseline` all call `startGame("game")`, which boots the entire engine, registers all scenes, loads resources, and mounts React UI. Each of these files contains exactly one test. The boot alone is 3-5s per file.

These tests navigate through the title screen via button clicks and real-time waits, making them integration/smoke tests rather than targeted browser tests. Per `docs/testing.md`: "Browser tests are expensive... Do not use browser tests as unit tests."

**Recommendation**: Consolidate the four full-app-boot tests into a single file with a shared `startGame` call. The tests are already sequential (they navigate to different scenes), so a single boot amortizes the ~4s startup across all of them. Alternatively, if these are purely visual regression captures, consider moving them behind a separate `test:visual` script that doesn't run in the normal loop.

### 2. Real-time sleeps instead of test clock (4 files)

Several tests use `vi.waitFor(() => new Promise(resolve => setTimeout(resolve, 1000)))` or poll with long timeout windows (5-8s). These are real wall-clock waits that can't be compressed.

- `level-mode.browser.test.ts:11` - 1s sleep after clicking Classic Mode
- `tide-mode.browser.test.ts:10` - 1s sleep after clicking Tide Mode
- `wave-visual-baseline.browser.test.ts:39` - 8s `waitFor` polling scene transition
- `wave-visual-baseline.browser.test.ts:51-58` - 5s `waitFor` polling for water actors

The scene transitions use `FadeInOut` which runs on the real clock, forcing real-time waits. The keyboard-triggered wave spawn also uses real timers internally (banner delay).

**Recommendation**: Where possible, switch to `game.debug.useTestClock()` earlier and drive transitions via `clock.step()`. For the `FadeInOut` transition wait, consider a test utility that awaits scene activation directly rather than polling with an 8s ceiling. For the bare `setTimeout(1000)` calls, investigate what they're actually waiting for and replace with a condition-based wait.

### 3. Excessive frame stepping (erosion + terrain tests)

Some tests step thousands of frames when far fewer would suffice:

- `wave-field-runtime-erosion`: steps 2000 frames (32s sim time) to test wall erosion, then 1000 frames for flat-ground no-op. The flat-ground test takes **4.9s** just to step 1000 frames and confirm nothing happened.
- `wave-field-runtime-terrain`: steps 1000 frames for hole pooling, 800 frames at 50ms for castle flood.
- `wave-visual-capture`: steps 320 frames per scenario x 7 scenarios = 2240 total frame steps.

**Recommendation**: Reduce frame counts. For the flat-ground no-erosion test, 200-300 frames is enough to confirm the wave passes without eroding. For erosion tests, lower the wall HP or increase wave intensity so fewer frames are needed. For `wave-visual-capture`, the `settled` frame at step 320 forces a long tail; consider whether all 4 capture frames are needed per scenario or if `advance` + `peak` suffice for regression detection.

### 4. Screenshot I/O overhead (2 files, 28 screenshots total)

`wave-visual-capture` writes 28 PNGs (7 scenarios x 4 frames). `wave-visual-baseline` and `wave-field-visual-baseline` each write 1. The screenshot captures hit disk via Playwright's screenshot API and add ~50-100ms each, but the 28 from `wave-visual-capture` accumulate.

**Recommendation**: These are visual regression captures, not assertions. Consider:
- Running them only on demand via a separate script/tag (e.g., `test:visual`)
- Reducing to 2 frames per scenario (advance + peak) for the default run
- Using a flag to skip screenshot I/O when only the structural assertions matter

### 5. Low parallelism (`maxWorkers: 2`)

With only 2 workers, slow files serialize the suite. The timeline shows clear serialization: `wave-visual-capture` (20.6s) blocks one worker while only one other test runs alongside it. The 8 files under 1s could all run in seconds if more workers were available.

**Recommendation**: Increase `maxWorkers` to 3-4 (or remove the cap). Browser tests under Playwright share a browser instance, so the memory overhead per worker is modest. Even going to 3 workers would let the many fast files overlap with the slow ones. Profile memory to find the right cap for CI.

## Brittleness concerns

### Scene transition timing
Tests that poll for scene activation (`expect(game.currentSceneName).toBe("tide")`) with timeouts up to 8s are fragile under CI load. A slow machine or parallel test contention can push real-time waits past the ceiling. The `wave-visual-baseline` test already has a 30s total timeout as a workaround.

### Frame-count-sensitive assertions
Tests that rely on "step N frames then check state" are sensitive to physics tuning. Changing wave speed, erosion rate, or surge duration can silently break these tests even though the underlying behavior is correct. Prefer condition-based waits (`step until water count > 0`) with a frame budget cap over fixed frame counts.

### Screenshot-only tests
`level-mode` and `tide-mode` take a screenshot and assert nothing else. They provide visual artifacts but no programmatic regression signal. If the rendering changes subtly, no test fails. If they're meant as smoke tests ("app boots without crashing"), the screenshot is unnecessary overhead.

## Prioritized action items

1. **Consolidate full-app-boot tests** into one file (saves ~12-15s by eliminating 3 redundant boots)
2. **Reduce frame counts** in erosion/terrain tests (saves ~5-8s)
3. **Replace real-time sleeps** with condition-based waits or test clock (saves ~3-5s, reduces flakiness)
4. **Increase `maxWorkers`** to 3-4 (better parallelism for the fast files)
5. **Move visual capture tests** behind a separate script or tag (removes 20s from default run)
