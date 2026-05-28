import { Color, DisplayMode, Engine, FadeInOut, PointerScope } from 'excalibur';
import { loader } from './resources.ts';
import { GameSession } from './game-session.ts';
import { TideSession } from './tide-session.ts';
import { TitleScene } from './title-scene.ts';
import { computeLayout } from './config.ts';

const { canvasWidth, canvasHeight } = computeLayout(window);

const game = new Engine({
  canvasElementId: 'game',
  pointerScope: PointerScope.Canvas,
  width: canvasWidth,
  height: canvasHeight,
  displayMode: DisplayMode.FillScreen,
  pixelArt: true,
  backgroundColor: Color.Black,
  scenes: { title: TitleScene, game: GameSession, tide: TideSession },
  configurePerformanceCanvas2DFallback: {
    allow: true,
    showPlayerMessage: true,
    threshold: { fps: 20, numberOfFrames: 100 },
  },
});

game.start('title', {
  loader,
  inTransition: new FadeInOut({
    duration: 1000,
    direction: 'in',
    color: Color.ExcaliburBlue
  })
});
