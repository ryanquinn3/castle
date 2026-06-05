import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";

test("tide mode page looks correct", async ({}) => {
  (window.frameElement as HTMLIFrameElement).style.width =
    `${document.body.offsetWidth}px`;
  (window.frameElement as HTMLIFrameElement).style.height =
    `${document.body.offsetHeight}px`;
  const button = page.getByRole("button", { name: "Tide Mode" });
  await vi.waitFor(() => expect(button).toBeVisible(), { timeout: 5000 });
  await button.click(); // click through title screen to tide mode
  await vi.waitFor(() => new Promise((resolve) => setTimeout(resolve, 1000))); // wait for level to load
  await page.screenshot();
});
