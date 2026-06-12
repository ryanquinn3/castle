import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { Keys } from "excalibur";
import { startGame } from "./engine.ts";
import { WaveSegment } from "./wave/wave-segment.ts";

// Baseline visual capture of the current (pre-refactor) wave treatment, so we
// have a reference artifact to compare against once the pressure-driven water
// simulation lands.
//
// This test also serves as the regression guard for the "w" hotkey: it presses
// W and requires the wave to spawn within a window well under the 10s tide
// countdown (TIDE_WAVE_INTERVAL_MS), so it fails if the hotkey stops triggering
// the wave.
//
// Boot, enter Tide, fire the wave with the "w" hotkey (skipping the ~10s
// countdown), then hand the clock over and advance a fixed number of frames so
// the wave is roughly at peak reach. We don't aim for the exact peak frame,
// just "close enough". Stepping the wave advance is synchronous (no real-time
// waiting) and freezes the animated water canvas for a stable screenshot.

// Segment movement runs on the engine clock. ~100 frames at 16ms (~1.6s of sim
// time) advances an early-tide wave to near its inland turn, before the
// still-water lifetime begins receding it.
const STEP_FRAMES = 100;
const STEP_MS = 16;

test("captures a baseline screenshot of the wave near peak reach", async () => {
  const game = await startGame("game");

  const tideButton = page.getByRole("button", { name: "Tide Mode" });
  await vi.waitFor(() => expect(tideButton).toBeVisible(), { timeout: 5000 });
  await tideButton.click();

  const segmentCount = (): number =>
    game.currentScene.actors.filter((a) => a instanceof WaveSegment).length;

  // Fire the wave now via the "w" hotkey. Re-press until segments spawn so we
  // don't depend on exact scene-activation timing. runWave has a ~500ms banner
  // delay (real timer) before it spawns segments. This runs on the real clock
  // because the scene transition does not complete under a frozen clock.
  await vi.waitFor(
    () => {
      game.input.keyboard.triggerEvent("up", Keys.W);
      game.input.keyboard.triggerEvent("down", Keys.W);
      expect(segmentCount()).toBeGreaterThan(0);
    },
    { timeout: 8000, interval: 150 },
  );

  // Hand the clock over and advance a fixed number of frames to roughly peak.
  const clock = game.debug.useTestClock();
  for (let i = 0; i < STEP_FRAMES; i++) {
    clock.step(STEP_MS);
  }

  await page.screenshot();
}, 20_000);
