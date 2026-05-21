import { Scene, Actor, Color, Text, Font, Rectangle, Vector } from 'excalibur';
import { CANVAS_WIDTH } from '../config';
import type { PlanningHud } from './planning-phase';

const HUD_RIGHT_MARGIN = 10;
const HUD_TOP = 4;
const HUD_WIDTH = 260;
const ROW_HEIGHT = 20;
const PADDING_X = 8;
const PADDING_Y = 8;
const Z_BG = 10;
const Z_TEXT = 11;

export class TideHud implements PlanningHud {
  private bgActor: Actor | null = null;
  private waveActor: Actor | null = null;
  private waveText: Text | null = null;
  private countdownActor: Actor | null = null;
  private countdownText: Text | null = null;
  private stateActor: Actor | null = null;
  private stateText: Text | null = null;

  private hudX = CANVAS_WIDTH - HUD_WIDTH - HUD_RIGHT_MARGIN;

  activate(scene: Scene): void {
    this.hudX = CANVAS_WIDTH - HUD_WIDTH - HUD_RIGHT_MARGIN;

    const bgHeight = PADDING_Y + ROW_HEIGHT * 3 + PADDING_Y;
    this.bgActor = new Actor({ x: this.hudX, y: HUD_TOP, z: Z_BG, anchor: Vector.Zero });
    this.bgActor.graphics.use(new Rectangle({
      width: HUD_WIDTH,
      height: bgHeight,
      color: Color.fromRGB(0, 0, 0, 0.45),
    }));
    scene.add(this.bgActor);

    const row1Y = HUD_TOP + PADDING_Y + ROW_HEIGHT / 2;
    const row2Y = row1Y + ROW_HEIGHT;
    const row3Y = row2Y + ROW_HEIGHT;

    this.waveText = new Text({
      text: 'Waves: 0',
      color: Color.White,
      font: new Font({ size: 16 }),
    });
    this.waveActor = new Actor({
      x: this.hudX + PADDING_X,
      y: row1Y,
      z: Z_TEXT,
      anchor: new Vector(0, 0.5),
    });
    this.waveActor.graphics.use(this.waveText);
    scene.add(this.waveActor);

    this.countdownText = new Text({
      text: '',
      color: Color.fromRGB(255, 200, 80),
      font: new Font({ size: 14 }),
    });
    this.countdownActor = new Actor({
      x: this.hudX + PADDING_X,
      y: row2Y,
      z: Z_TEXT,
      anchor: new Vector(0, 0.5),
    });
    this.countdownActor.graphics.use(this.countdownText);
    scene.add(this.countdownActor);

    this.stateText = new Text({
      text: '',
      color: Color.fromRGB(180, 180, 180),
      font: new Font({ size: 12 }),
    });
    this.stateActor = new Actor({
      x: this.hudX + PADDING_X,
      y: row3Y,
      z: Z_TEXT,
      anchor: new Vector(0, 0.5),
    });
    this.stateActor.graphics.use(this.stateText);
    scene.add(this.stateActor);
  }

  updateWaves(count: number): void {
    if (this.waveText && this.waveActor) {
      this.waveText.text = `Waves: ${count}`;
      this.waveActor.graphics.use(this.waveText);
    }
  }

  updateCountdown(seconds: number): void {
    if (this.countdownText && this.countdownActor) {
      this.countdownText.text = `Next wave: ${seconds}s`;
      this.countdownActor.graphics.use(this.countdownText);
    }
  }

  showPlanning(_scene: Scene, _scoopText: string, _waveText: string): void {}
  hidePlanning(_scene: Scene): void {}
  updateScoops(_text: string): void {}

  updateState(text: string): void {
    if (this.stateText && this.stateActor) {
      this.stateText.text = text;
      this.stateActor.graphics.use(this.stateText);
    }
  }

  deactivate(scene: Scene): void {
    if (this.waveActor) {
      scene.remove(this.waveActor);
      this.waveActor = null;
    }
    this.waveText = null;
    if (this.countdownActor) {
      scene.remove(this.countdownActor);
      this.countdownActor = null;
    }
    this.countdownText = null;
    if (this.stateActor) {
      scene.remove(this.stateActor);
      this.stateActor = null;
    }
    this.stateText = null;
    if (this.bgActor) {
      scene.remove(this.bgActor);
      this.bgActor = null;
    }
  }
}
