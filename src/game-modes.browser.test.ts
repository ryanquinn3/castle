import { page } from "vitest/browser";
import { test } from "./test/game-browser-test.ts";

test("game mode scenes render correctly", async ({ game, clock }) => {
  await game.goToScene("game");
  clock.run(3, 16); // step a few frames so the scene is actually drawn before capture
  await page.screenshot();

  await game.goToScene("tide");
  clock.run(3, 16);
  await page.screenshot();
}, 25_000);
