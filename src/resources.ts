import { ImageSource, Loader } from 'excalibur';

export const Resources = {
  Castle: new ImageSource('./images/castle.png'),
} as const;

export const loader = new Loader([Resources.Castle]);
loader.suppressPlayButton = true;
