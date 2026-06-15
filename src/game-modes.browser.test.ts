import { page } from "vitest/browser";
import { test } from "./test/game-browser-test.ts";

test("game mode scenes render correctly", async ({ game }) => {
  await game.goToScene("game");
  await page.screenshot({ path: "game-modes/level-mode.png" });

  await game.goToScene("tide");
  await page.screenshot({ path: "game-modes/tide-mode.png" });
});
