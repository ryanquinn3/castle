import { Scene, Actor, Color, Text, Font, Rectangle, Vector } from 'excalibur';
import { computeLayout } from '../config.ts';

const { canvasWidth: CANVAS_WIDTH } = computeLayout(window);

const HUD_RIGHT_MARGIN = 10;
const HUD_TOP = 4;
const HUD_WIDTH = 260;
const ROW_HEIGHT = 20;
const PADDING_X = 8;
const PADDING_Y = 8;
const Z_BG = 10;
const Z_TEXT = 11;

export class Hud {
  private bgActor: Actor | null = null;
  private levelActor: Actor | null = null;
  private levelText: Text | null = null;
  private stateActor: Actor | null = null;
  private stateText: Text | null = null;
  private waveActor: Actor | null = null;

  private hudX = CANVAS_WIDTH - HUD_WIDTH - HUD_RIGHT_MARGIN;

  activate(scene: Scene, level: number): void {
    this.hudX = CANVAS_WIDTH - HUD_WIDTH - HUD_RIGHT_MARGIN;

    const bgHeight = PADDING_Y + ROW_HEIGHT + PADDING_Y;
    this.bgActor = new Actor({ x: this.hudX, y: HUD_TOP, z: Z_BG, anchor: Vector.Zero });
    this.bgActor.graphics.use(new Rectangle({
      width: HUD_WIDTH,
      height: bgHeight,
      color: Color.fromRGB(0, 0, 0, 0.45),
    }));
    scene.add(this.bgActor);

    this.levelText = new Text({
      text: `Level: ${level}`,
      color: Color.White,
      font: new Font({ size: 16 }),
    });
    this.levelActor = new Actor({
      x: this.hudX + PADDING_X,
      y: HUD_TOP + PADDING_Y + ROW_HEIGHT / 2,
      z: Z_TEXT,
      anchor: new Vector(0, 0.5),
    });
    this.levelActor.graphics.use(this.levelText);
    scene.add(this.levelActor);
  }

  updateLevel(level: number): void {
    if (this.levelText && this.levelActor) {
      this.levelText.text = `Level: ${level}`;
      this.levelActor.graphics.use(this.levelText);
    }
  }

  showPlanning(scene: Scene, waveText: string): void {
    const row1Y = HUD_TOP + PADDING_Y + ROW_HEIGHT / 2;
    const row2Y = row1Y + ROW_HEIGHT;
    const row3Y = row2Y + ROW_HEIGHT;

    const bgHeight = PADDING_Y + ROW_HEIGHT * 3 + PADDING_Y;
    if (this.bgActor) {
      this.bgActor.graphics.use(new Rectangle({
        width: HUD_WIDTH,
        height: bgHeight,
        color: Color.fromRGB(0, 0, 0, 0.45),
      }));
    }

    this.stateText = new Text({
      text: '',
      color: Color.fromRGB(180, 180, 180),
      font: new Font({ size: 12 }),
    });
    this.stateActor = new Actor({
      x: this.hudX + PADDING_X,
      y: row2Y,
      z: Z_TEXT,
      anchor: new Vector(0, 0.5),
    });
    this.stateActor.graphics.use(this.stateText);
    scene.add(this.stateActor);

    const waveHudText = new Text({
      text: waveText,
      color: Color.fromRGB(255, 200, 80),
      font: new Font({ size: 14 }),
    });
    this.waveActor = new Actor({
      x: this.hudX + PADDING_X,
      y: row3Y,
      z: Z_TEXT,
      anchor: new Vector(0, 0.5),
    });
    this.waveActor.graphics.use(waveHudText);
    scene.add(this.waveActor);
  }

  hidePlanning(scene: Scene): void {
    const bgHeight = PADDING_Y + ROW_HEIGHT + PADDING_Y;
    if (this.bgActor) {
      this.bgActor.graphics.use(new Rectangle({
        width: HUD_WIDTH,
        height: bgHeight,
        color: Color.fromRGB(0, 0, 0, 0.45),
      }));
    }
    if (this.stateActor) {
      scene.remove(this.stateActor);
      this.stateActor = null;
    }
    this.stateText = null;
    if (this.waveActor) {
      scene.remove(this.waveActor);
      this.waveActor = null;
    }
  }

  updateState(text: string): void {
    if (this.stateText && this.stateActor) {
      this.stateText.text = text;
      this.stateActor.graphics.use(this.stateText);
    }
  }

  deactivate(scene: Scene): void {
    this.hidePlanning(scene);
    if (this.levelActor) {
      scene.remove(this.levelActor);
      this.levelActor = null;
    }
    this.levelText = null;
    if (this.bgActor) {
      scene.remove(this.bgActor);
      this.bgActor = null;
    }
  }
}
