import * as ex from "excalibur";

export async function createSharedEngine(
  options: ex.EngineOptions = {},
): Promise<ex.Engine> {
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

  await game.start();
  (ex.WebAudio as any)._UNLOCKED = true;
  return game;
}
