import { page } from "vitest/browser";
import { test } from "./test/game-browser-test.ts";
import type { TideSession } from "./tide-session.ts";

const STEP_FRAMES = 100;
const STEP_MS = 16;

test("captures a baseline screenshot of the wave near peak reach", async ({ game, clock }) => {
  await game.goToScene('tide');
  // Clock is the test clock from boot, so the wave runs deterministically.
  (game.currentScene as TideSession).triggerWaveNow();
  clock.run(STEP_FRAMES, STEP_MS); // advance to roughly peak reach

  await page.screenshot();
  // Generous deadline: real-clock boot can stretch under parallel browser load
  // and Playwright screenshot actions inherit the test deadline.
}, 30_000);
