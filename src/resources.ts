import { ImageSource, Loader, Sound } from 'excalibur';
import { TiledResource } from '@excaliburjs/plugin-tiled';

export const Resources = {
  Castle: new ImageSource('./images/castle.png'),
  WallSpritesheet: new ImageSource('./images/wall-spritesheet.png'),
  Shovel: new ImageSource('./images/shovel-sprite.png'),
  WallTool: new ImageSource('./images/wall-tool-sprite.png'),
  TowerSprite: new ImageSource('./images/tower-sprite.png'),
  DigSound: new Sound('./sound/dig_sound.mp3'),
  WallToolSound: new Sound('./sound/wall_tool_sound.mp3'),
  WaveSound: new Sound('./sound/wave_sound.mp3'),
} as const;

export const tiledMap = new TiledResource('./map/map.tmx', {
  useExcaliburWiring: false,
  useTilemapCameraStrategy: false,
});

export const loader = new Loader([
  Resources.Castle,
  Resources.WallSpritesheet,
  Resources.Shovel,
  Resources.WallTool,
  Resources.TowerSprite,
  Resources.DigSound,
  Resources.WallToolSound,
  Resources.WaveSound,
  tiledMap,
]);
loader.suppressPlayButton = true;
