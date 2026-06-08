import { Color, DisplayMode, Engine, FadeInOut, PointerScope } from "excalibur";
import { loader } from "./resources.ts";
import { LevelSession } from "./level-session.ts";
import { TideSession } from "./tide-session.ts";
import { TitleScene } from "./title-scene.ts";
import { computeLayout } from "./config.ts";

export async function startGame(canvasElementId?: string): Promise<void> {
  const { canvasWidth, canvasHeight } = computeLayout(window);

  const game = new Engine({
    canvasElementId: canvasElementId,
    pointerScope: PointerScope.Canvas,
    width: canvasWidth,
    height: canvasHeight,
    displayMode: DisplayMode.FillScreen,
    pixelArt: true,
    backgroundColor: Color.Black,
    scenes: { title: TitleScene, game: LevelSession, tide: TideSession },
    configurePerformanceCanvas2DFallback: {
      allow: true,
      showPlayerMessage: true,
      threshold: { fps: 20, numberOfFrames: 100 },
    },
  });

  await game.start(loader);
  await game.goToScene("title", {
    destinationIn: new FadeInOut({
      duration: 1000,
      direction: "in",
      color: Color.Black,
    }),
  });
}
