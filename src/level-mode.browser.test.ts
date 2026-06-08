import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { startGame } from "./engine.ts";

test("level mode page looks correct", async ({}) => {
  await startGame("game");
  const button = page.getByRole("button", { name: "Classic Mode" });
  await vi.waitFor(() => expect(button).toBeVisible(), { timeout: 5000 });
  await button.click(); // click through title screen to level mode
  await vi.waitFor(() => new Promise((resolve) => setTimeout(resolve, 1000))); // wait for level to load

  await page.screenshot();
});
