import { Scene, Actor, Canvas, Color, Text, Font, Rectangle, Vector } from 'excalibur';
import { CANVAS_WIDTH, TIDE_HIGH_TIDE_WAVE } from '../config';
import type { PlanningHud } from './planning-phase';

const HUD_RIGHT_MARGIN = 10;
const HUD_TOP = 4;
const HUD_WIDTH = 260;
const ROW_HEIGHT = 20;
const PADDING_X = 8;
const PADDING_Y = 8;
const Z_BG = 10;
const Z_TEXT = 11;

const CLOCK_RADIUS = 32;
const CLOCK_WIDTH = CLOCK_RADIUS * 2 + 20;
const CLOCK_HEIGHT = CLOCK_RADIUS + 20;
const CLOCK_MARGIN = 6;

export class TideHud implements PlanningHud {
  private bgActor: Actor | null = null;
  private waveActor: Actor | null = null;
  private waveText: Text | null = null;
  private countdownActor: Actor | null = null;
  private countdownText: Text | null = null;
  private stateActor: Actor | null = null;
  private stateText: Text | null = null;
  private clockActor: Actor | null = null;
  private clockProgress = 0;

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

    this.clockActor = new Actor({
      x: this.hudX - CLOCK_WIDTH - CLOCK_MARGIN,
      y: HUD_TOP,
      z: Z_BG,
      anchor: Vector.Zero,
    });
    this.drawClock();
    scene.add(this.clockActor);

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

  updateTideClock(wavesCompleted: number): void {
    this.clockProgress = Math.min(1, wavesCompleted / TIDE_HIGH_TIDE_WAVE);
    this.drawClock();
  }

  private drawClock(): void {
    if (!this.clockActor) {
      return;
    }
    const progress = this.clockProgress;
    const clockCanvas = new Canvas({
      width: CLOCK_WIDTH,
      height: CLOCK_HEIGHT,
      cache: true,
      draw: (ctx: CanvasRenderingContext2D) => {
        const cx = CLOCK_WIDTH / 2;
        const cy = CLOCK_HEIGHT - 6;
        const r = CLOCK_RADIUS;

        ctx.strokeStyle = 'rgba(150, 150, 150, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, 0, false);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const tickAngle = Math.PI - (i / 4) * Math.PI;
          const innerR = r - 5;
          const outerR = r + 3;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(tickAngle) * innerR, cy + Math.sin(tickAngle) * innerR);
          ctx.lineTo(cx + Math.cos(tickAngle) * outerR, cy + Math.sin(tickAngle) * outerR);
          ctx.stroke();
        }

        const handAngle = Math.PI - progress * Math.PI;
        const handLen = r - 8;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(
          cx + Math.cos(handAngle) * handLen,
          cy + Math.sin(handAngle) * handLen,
        );
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '9px sans-serif';
        ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
        ctx.textAlign = 'center';
        ctx.fillText('Low', cx - r + 4, cy + 12);
        ctx.fillText('High', cx + r - 4, cy + 12);
      },
    });
    this.clockActor.graphics.use(clockCanvas);
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
    if (this.clockActor) {
      scene.remove(this.clockActor);
      this.clockActor = null;
    }
  }
}
