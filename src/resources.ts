import { ImageSource, Loader, Sound } from 'excalibur';
import { TiledResource } from '@excaliburjs/plugin-tiled';

export const Resources = {
  Castle: new ImageSource('./images/castle.png'),
  WallLevel1: new ImageSource('./images/wall-level-1.png'),
  WallLevel2: new ImageSource('./images/wall-level-2.png'),
  WallLevel3: new ImageSource('./images/wall-level-3.png'),
  WallLevel4: new ImageSource('./images/wall-level-4.png'),
  Shovel: new ImageSource('./images/shovel-sprite.png'),
  WallTool: new ImageSource('./images/wall-tool-sprite.png'),
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
  Resources.WallLevel1,
  Resources.WallLevel2,
  Resources.WallLevel3,
  Resources.WallLevel4,
  Resources.Shovel,
  Resources.WallTool,
  Resources.DigSound,
  Resources.WallToolSound,
  Resources.WaveSound,
  tiledMap,
]);
loader.suppressPlayButton = true;
