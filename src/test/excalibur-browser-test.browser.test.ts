import { describe } from "vitest";
import { expect, test } from "./excalibur-browser-test.ts";

describe("excalibur browser test fixture", () => {
  test("provides an Excalibur browser test context", async ({ ctx }) => {
    expect(ctx.game).toBeDefined();
    expect(ctx.scene).toBeDefined();
    expect(typeof ctx.step).toBe("function");
    expect(typeof ctx.dispose).toBe("function");
    expect(document.body.contains(ctx.game.canvas)).toBe(true);
  });

  test("runs fixture cleanup after the test finishes", async ({
    ctx,
    onTestFinished,
  }) => {
    const { canvas } = ctx.game;

    expect(document.body.contains(canvas)).toBe(true);

    onTestFinished(() => {
      expect(document.body.contains(canvas)).toBe(false);
    });
  });
});
