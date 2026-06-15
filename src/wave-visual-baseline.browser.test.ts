import { page } from "vitest/browser";
import { test } from "./test/game-browser-test.ts";
import type { TideSession } from "./tide-session.ts";

const STEP_FRAMES = 100;
const STEP_MS = 16;

test("captures a baseline screenshot of the wave near peak reach", async ({ game }) => {
  await game.goToScene('tide');
  (game.currentScene as TideSession).triggerWaveNow();
  // Hand the clock over and advance a fixed number of frames to roughly peak.
  const clock = game.debug.useTestClock();
  for (let i = 0; i < STEP_FRAMES; i++) {
    clock.step(STEP_MS);
  }

  await page.screenshot();
  // Generous deadline: boot + the two real-clock waitFor windows (5s + 8s) can
  // stretch under parallel browser load and would otherwise starve the final
  // screenshot of its remaining budget (Playwright actions inherit the test
  // deadline). 30s keeps the screenshot from flaking under contention.
}, 30_000);
