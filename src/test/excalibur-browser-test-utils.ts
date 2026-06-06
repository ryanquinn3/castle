import * as ex from "excalibur";

interface TestClockLike {
  step(ms: number): void;
}

export interface ExcaliburBrowserTestContext {
  game: ex.Engine;
  scene: ex.Scene;
  clock: TestClockLike;
  step(ms: number): void;
  dispose(): void;
}

export async function createExcaliburBrowserTestContext(
  options: ex.EngineOptions = {},
): Promise<ExcaliburBrowserTestContext> {
  ex.Debug.clear();
  ex.Flags._reset();
  ex.Flags.enable("suppress-obsolete-message");

  const game = new ex.Engine({
    width: 500,
    height: 500,
    suppressConsoleBootMessage: true,
    enableCanvasTransparency: true,
    suppressMinimumBrowserFeatureDetection: true,
    suppressHiDPIScaling: true,
    suppressPlayButton: true,
    snapToPixel: false,
    antialiasing: false,
    displayMode: ex.DisplayMode.Fixed,
    ...options,
  });

  game.canvas.style.display = "block";
  game.canvas.style.position = "absolute";
  game.canvas.style.top = "0px";

  const scene = new ex.Scene();
  game.addScene("test", scene);
  await game.start("test");

  const clock = game.debug.useTestClock();
  (ex.WebAudio as any)._UNLOCKED = true;
  return {
    game,
    scene,
    clock,
    step: (ms: number) => {
      clock.step(ms);
    },
    dispose: () => {
      game.stop();
      game.dispose();
    },
  };
}
