# Browser test flakiness — consultant investigation

Date: 2026-06-16
Scope: `*.browser.test.ts` suite (Vitest 4.1 browser mode + `@vitest/browser-playwright`, headless Chromium, real Excalibur engine)

## TL;DR

The suite mixes three known flake amplifiers at once:

1. A **real WebGL2 engine rendering through software GL (`--use-gl=swiftshader`) on Apple Silicon** — a documented-unstable combination.
2. A **separate `vitest.config.ts` that does not extend `vite.config.js`**, so Excalibur is no longer excluded from dep optimization. Mid-run dep discovery → Vite reload → dropped browser connection ("connection issues").
3. **No retries, default `testTimeout`, and a mix of real-clock + test-clock tests sharing one file-scoped engine** — so any transient blip or RAF-starvation under load fails the whole run.

None of these are exotic; they're the top hits for "vitest browser playwright flaky / connection" upstream. Ranked fixes below.

## Environment

- Host: Apple M1 Pro, arm64, 10 CPUs, darwin 23.4.
- `excalibur@0.32` renders via WebGL2 by default.
- Browser project: `maxWorkers: 2`, `isolate: true`, headless chromium, `connectTimeout: 15_000`, `--use-gl=swiftshader`, `--disable-dev-shm-usage`, `--no-sandbox`, 8GB old-space.
- Two fixture styles:
  - `src/test/excalibur-browser-shared-test.ts` — **file-scoped** shared engine (`scope: "file"`), per-test `scene` + `clock` fixtures. `clock` = `game.debug.useTestClock()`.
  - `src/test/game-browser-test.ts` — boots the **full app** (`startGame("game")`) per test; used by `game-modes.browser.test.ts` (real-clock screenshot test).

## Root-cause hypotheses (ranked by likelihood × impact)

### 1. Config does not extend the Vite config → mid-run reloads (likely the "connection issues")

`vitest.config.ts` is a standalone config. When a dedicated Vitest config exists, Vitest does **not** auto-merge `vite.config.js` — you must `mergeConfig` explicitly. Consequences during tests:

- `optimizeDeps.exclude: ["excalibur"]` is **not applied**. Excalibur (CJS/ESM-sensitive, per the repo's own note) is neither excluded nor in `optimizeDeps.include`, so Vite can discover/optimize it (or a transitive dep) on first import **mid-run**, triggering a full-page reload of the tester. Upstream explicitly flags this: *"Vite unexpectedly reloaded a test… add dependencies to `optimizeDeps.include` for a stable experience."*
- The custom `tiledPlugin` and `@vitejs/plugin-react` are also absent in the test pipeline (JSX survives via esbuild, but the Tiled `.tsx`/`.tmx` externalization path does not).

A reload mid-suite presents exactly as a dropped/"failed to connect to the browser session" error and as nondeterministic failures concentrated on the first file(s) that import Excalibur.

### 2. Software WebGL on Apple Silicon (`--use-gl=swiftshader`)

SwiftShader WebGL is **disabled/unstable on ARM** (Chromium docs + chromium-dev thread); WebGL in headless has documented crash modes (Vitest #8399). Excalibur needs WebGL2. Running 2 concurrent software-GL engines (`maxWorkers: 2`) on the M1 saturates CPU, starves `requestAnimationFrame`, and intermittently fails context creation → "Target closed"/timeout style flakes. The `--use-gl=swiftshader` + `--window-size=1920,1080` flags read as copied from a Linux/Xvfb CI recipe and are a poor fit for a local M1.

### 3. No retry + default timeouts + clock inconsistency

- **No `retry`.** A single transient connection/reload blip fails the entire run. Real-engine browser suites upstream universally run with `retry: 1–2`.
- **Default `testTimeout` (5s)** for full-app boots (`startGame`) under software GL is marginal; only `game-modes.browser.test.ts` bumps to 25s. Boot-time flakes elsewhere will surface as timeouts.
- **Clock mixing.** The shared engine is `scope: "file"` (one engine for all tests in a file, RAF running). Tests that take the `clock` fixture flip it to a test clock; tests that don't run on the real RAF clock. Mixed within a file sharing one engine = order-dependent nondeterminism. `game-modes.browser.test.ts` derives its own clock *after* navigating scenes and never advances deterministically before the first `await page.screenshot()`.

### 4. `maxWorkers` historically ignored in browser mode

Vitest #7446 (fixed by #7483) — browser mode ignored `maxWorkers` and fanned out to all cores. You're on 4.1.6/4.1.7 so the fix should be in, but **verify** it's actually limiting to 2 pages (watch how many chromium tabs spawn). If unfixed in your version, you're really running ~10 concurrent software-GL engines → guaranteed contention flakes.

### 5. `page.screenshot()` timing

Screenshot tests (`game-modes`, `wave-field-runtime`, visual baselines) capture whatever is on the page. If the frame isn't drawn (RAF starved, or only `clock.step(16)` once after a scene switch), captures are racy and slow. They also add wall-clock to an already heavy stage.

## Concrete recommendations (in priority order)

### P0 — Stop the mid-run reloads

Merge the Vite config into the Vitest config and pin Excalibur's optimization, so the test pipeline matches dev:

```ts
import { mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";
// ...
export default mergeConfig(viteConfig, defineConfig({ /* test: {...} */ }));
```

and/or, in the test config:

```ts
optimizeDeps: {
  // pre-bundle once, up front, so nothing is discovered mid-run
  include: ["react", "react-dom", "react-dom/client", "vitest-browser-react"],
  // keep excalibur out of the bundler (its CJS/ESM constraint), matching dev
  exclude: ["excalibur", "@excaliburjs/plugin-tiled"],
},
```

Then run once with `--debug` (or watch the terminal) and confirm there is **no** "optimized dependencies changed, reloading" line during the browser stage.

### P0 — Add retries and a realistic timeout

```ts
test: {
  retry: process.env.CI ? 2 : 1,
  testTimeout: 20_000, // full-engine boots under software GL need headroom
  // ...
}
```

This is the single highest-leverage change for perceived stability and is standard for real-browser suites.

### P1 — Fix the GL/parallelism mismatch on M1

- Drop `--use-gl=swiftshader` locally; let Chromium use ANGLE/Metal, or set `--enable-unsafe-swiftshader` only on Linux CI. The swiftshader/window-size/`--no-sandbox` flags should be **CI-gated**, not unconditional.
- Consider `maxWorkers: 1` for the browser project (or `fileParallelism: false`) and measure. Two concurrent software-GL Excalibur engines on the M1 is the contention sweet-spot; serial is often *faster end-to-end* because it eliminates RAF starvation and retries. Benchmark 1 vs 2.
- Verify the actual tab count matches `maxWorkers` (issue #7446 fix sanity check).

### P1 — Make the clock deterministic everywhere

- Every browser test that advances game state should use the **test clock** (`clock` fixture / `game.debug.useTestClock()`) and `clock.step()`; avoid relying on real RAF. Audit `game-modes.browser.test.ts` and the visual-baseline tests.
- Gate screenshots on a drawn frame: `await vi.waitFor(...)` or step the clock enough times before `await page.screenshot()`, rather than a single `clock.step(16)`.
- Reconsider `scope: "file"` for the shared engine: a fresh engine per test costs boot time but removes cross-test state/clock leakage. If keeping file scope, assert no test in a file mixes real-clock and test-clock usage.

### P2 — Tighten timeouts to fail fast, not hang

- Set Playwright `actionTimeout` (under `providerOptions`/`launchOptions` per the provider docs) lower than `testTimeout` so a stuck locator fails in seconds, not the default 30s. The suite is mostly canvas (few locators), but screenshot/`page` ops benefit.
- Keep `connectTimeout` (15s is fine; raise to 30s only if connection errors persist after P0).

### P2 — Reduce browser-stage surface area

15 `*.browser.test.ts` files each boot/host an engine. Confirm each genuinely needs the real canvas (per `docs/testing.md` rule). Anything that's actually pure model/math (some of `grid-model*`, erosion) belongs in the jsdom `unit` project, shrinking the expensive stage and the flake surface.

## Quick verification loop

1. Apply P0 (config merge + `optimizeDeps` + `retry`/`testTimeout`).
2. Run `node --run test:browser` 5–10× back-to-back; record pass rate and watch for any "reloading" log line.
3. Toggle `maxWorkers` 1 vs 2 and drop swiftshader; compare wall-clock and flake rate.
4. Audit clock usage; convert real-clock tests to the test clock.

## References

- Vitest browser flaky / "Failed to connect to the browser session": https://github.com/vitest-dev/vitest/issues/7377
- Browser mode ignores `maxWorkers` (fixed #7483): https://github.com/vitest-dev/vitest/issues/7446
- Flaky tests in suite (single-page-per-file, setup imports): https://github.com/vitest-dev/vitest/discussions/6971
- Make browser tests fail faster (timeouts): https://github.com/vitest-dev/vitest/discussions/8945
- Unify/simplify timeout config: https://github.com/vitest-dev/vitest/issues/9751
- Playwright logs cause cross-test timeouts: https://github.com/vitest-dev/vitest/issues/9941
- Flaky tests with Vite + Playwright (optimizeDeps reload): https://github.com/vitejs/vite/issues/12883
- Configuring Playwright provider: https://vitest.dev/config/browser/playwright
- `browser.headless` config: https://vitest.dev/config/browser/headless
- Rendering issues with headless Chromium: https://github.com/vitest-dev/vitest/issues/8399
- Chromium SwiftShader (ARM/WebGL limitations): https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/gpu/swiftshader.md
- WebGL issues in headless on ARM Mac since 111: https://groups.google.com/a/chromium.org/g/chromium-dev/c/8eR2GctzGuw
- Playwright flaky tests in CI (general): https://www.browserstack.com/guide/playwright-flaky-tests
