import { beforeEach } from "vitest";

beforeEach(() => {
  const gameDiv = document.createElement("canvas");
  gameDiv.id = "game";
  const rootDiv = document.createElement("div");
  rootDiv.id = "root";
  rootDiv.appendChild(gameDiv);
  const uiDiv = document.createElement("div");
  uiDiv.id = "game-ui";
  rootDiv.appendChild(uiDiv);
  document.body.appendChild(rootDiv);
});
