import { expect, test as baseTest } from "vitest";
import { startGame } from "../engine.ts";

export const test = baseTest.extend("game", async ({}, { onCleanup }) => {
  const game = await startGame("game");
  onCleanup(() => {
    game.stop();
    game.dispose();
  });
  return game;
});

export { expect };
