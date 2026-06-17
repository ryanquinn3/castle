import { expect, test as baseTest } from "vitest";
import { startGame } from "../engine.ts";

export const test = baseTest
  .extend("game", async ({}, { onCleanup }) => {
    const game = await startGame("game");
    onCleanup(() => {
      game.stop();
      game.dispose();
    });
    return game;
  })
  // Installed before the test body runs, so scene navigation and wave scheduling
  // happen on a deterministic test clock instead of real RAF. Destructure `clock`
  // and drive it with `clock.step(ms)` / `clock.run(frames, ms)`.
  .extend("clock", async ({ game }) => {
    return game.debug.useTestClock();
  });

export { expect };
