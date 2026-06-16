import * as ex from "excalibur";
import { expect, test as baseTest } from "vitest";
import { createSharedEngine } from "./excalibur-browser-test-utils.ts";

const IDLE_SCENE = "__idle";

export const test = baseTest
  .extend("game", { scope: "file" }, async ({}, { onCleanup }) => {
    const game = await createSharedEngine();
    game.addScene(IDLE_SCENE, new ex.Scene());
    onCleanup(() => {
      game.stop();
      game.dispose();
    });
    return game;
  })
  .extend("scene", async ({ game }, { onCleanup }) => {
    const scene = new ex.Scene();
    game.addScene("test", scene);
    await game.goToScene("test");
    onCleanup(async () => {
      scene.clear(false);
      await game.goToScene(IDLE_SCENE);
      game.removeScene("test");
    });
    return scene;
  })
  .extend("clock", async ({ game }) => {
    return game.debug.useTestClock();
  });

export { expect };
