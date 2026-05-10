import { Color, DisplayMode, Engine, FadeInOut } from 'excalibur';
import { loader } from './resources';
import { MyLevel } from './level';
import { TitleScene } from './title-scene';

const game = new Engine({
  width: 800,
  height: 600,
  displayMode: DisplayMode.FitScreen,
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

const portraitWarning = document.createElement('div');
portraitWarning.id = 'portrait-warning';
portraitWarning.textContent = 'Rotate your device to landscape for the best experience';
document.body.appendChild(portraitWarning);

function checkOrientation() {
  if (window.innerWidth < window.innerHeight) {
    portraitWarning.style.display = 'flex';
  } else {
    portraitWarning.style.display = 'none';
  }
}

window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
checkOrientation();
