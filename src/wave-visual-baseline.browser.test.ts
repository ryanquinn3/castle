import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { Keys } from "excalibur";
import { startGame } from "./engine.ts";
import { WaterComponent } from "./wave/water-component.ts";

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

  // Wait for the Tide scene to actually become the active scene before driving
  // it. The engine exposes the current scene key directly, so we poll that
  // rather than guessing transition timing by spamming input. The title→tide
  // FadeInOut only advances on the real clock, hence the real-clock waitFor.
  await vi.waitFor(() => expect(game.currentSceneName).toBe("tide"), { timeout: 8000 });

  // Count live water actors by component rather than by concrete class, so this
  // guard survives the M5 deletion of WaveSegment (every water actor carries a
  // WaterComponent: WaveSegment on the legacy path, WaterCell on the field path).
  const waterActorCount = (): number =>
    game.currentScene.world.query([WaterComponent]).entities.length;

  // Fire the wave via the "w" hotkey. The handler is gated on the scene's active
  // lifecycle, which is set in onActivate just after the scene becomes current,
  // so re-trigger to cover that sub-frame gap; runWave then adds a ~500ms banner
  // delay (real timer) before water spawns.
  await vi.waitFor(
    () => {
      game.input.keyboard.triggerEvent("up", Keys.W);
      game.input.keyboard.triggerEvent("down", Keys.W);
      expect(waterActorCount()).toBeGreaterThan(0);
    },
    { timeout: 5000, interval: 150 },
  );

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
