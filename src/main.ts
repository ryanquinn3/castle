import { Color, DisplayMode, Engine, FadeInOut } from 'excalibur';
import { loader } from './resources';
import { GameSession } from './game-session';
import { TitleScene } from './title-scene';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './config';

const game = new Engine({
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  displayMode: DisplayMode.FillScreen,
  pixelArt: true,
  backgroundColor: Color.fromRGB(180, 150, 110),
  scenes: { title: TitleScene, game: GameSession },
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
