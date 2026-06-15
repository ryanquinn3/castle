import { page } from "vitest/browser";
import { test } from "./test/game-browser-test.ts";

test("game mode scenes render correctly", async ({ game }) => {
  await game.goToScene("game");
  const clock = game.debug.useTestClock();
  clock.step(16);
  await page.screenshot({ path: "game-modes/level-mode.png" });

  await game.goToScene("tide");
  clock.step(16);
  await page.screenshot({ path: "game-modes/tide-mode.png" });
}, 25_000);
