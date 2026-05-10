import { Color, DisplayMode, Engine, FadeInOut } from 'excalibur';
import { loader } from './resources';
import { MyLevel } from './level';
import { TitleScene } from './title-scene';

const game = new Engine({
  width: 800,
  height: 600,
  displayMode: DisplayMode.FitScreenAndFill,
  pixelArt: true,
  scenes: {
    title: TitleScene,
    game: MyLevel,
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
