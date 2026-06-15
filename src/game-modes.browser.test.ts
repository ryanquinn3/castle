import { page } from "vitest/browser";
import { test } from "./test/game-browser-test.ts";

test("game mode scenes render correctly", async ({ game }) => {
  await game.goToScene("game");
  const clock = game.debug.useTestClock();
  clock.step(16);
  await page.screenshot();

  await game.goToScene("tide");
  clock.step(16);
  await page.screenshot();
}, 25_000);
