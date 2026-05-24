import { Scene, Actor, Color, Rectangle, Text, Font } from 'excalibur';
import { GridView } from './grid-view.ts';
import { GRID_WIDTH, GRID_HEIGHT, ENHANCED_SHOVEL_DELTA, computeLayout } from '../config.ts';
import type { DiggingStrategy, ScoopResult } from './digging-strategy.ts';
import { SingleCellDigging } from './single-cell-digging.ts';

const { tileSize: TILE_SIZE, canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

export interface PlanningHud {
  showPlanning(scene: Scene, scoopText: string, waveText: string): void;
  hidePlanning(scene: Scene): void;
  updateScoops(text: string): void;
  updateState(text: string): void;
}

export class PlanningPhase {
  private scoopsRemaining: number;
  private sendWaveActor: Actor | null = null;
  private sendWaveInnerActor: Actor | null = null;
  private reachLineActor: Actor | null = null;
  private reachLabelActor: Actor | null = null;
  private active = false;
  private completed = false;
  private strategy: DiggingStrategy;

  constructor(
    private grid: GridView,
    private hud: PlanningHud,
    scoops: number,
    private waveReach: number,
    private waveHeight: number,
    private numWaves: number,
    private hasEnhancedShovel: boolean,
    private onComplete: () => void,
    strategy?: DiggingStrategy,
  ) {
    this.scoopsRemaining = scoops;
    this.strategy = strategy ?? new SingleCellDigging();
  }

  activate(scene: Scene): void {
    this.active = true;
    this.completed = false;

    this.hud.showPlanning(
      scene,
      this.scoopHudText(),
      `Wave: ${Math.round(this.waveHeight)}  ×${this.numWaves}`,
    );

    const delta = this.hasEnhancedShovel ? ENHANCED_SHOVEL_DELTA : 1;
    this.strategy.onScoopComplete = (result) => this.handleScoopComplete(result);
    this.strategy.activate(scene, this.grid, { delta });
    this.hud.updateState(this.strategy.getStateText());

    // "Send Wave" button actor at bottom-center
    if (Number.isFinite(this.scoopsRemaining)) {
      const btnBorder = new Rectangle({
        width: 120,
        height: 28,
        color: Color.fromRGB(40, 100, 40),
      });
      this.sendWaveActor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 15 });
      this.sendWaveActor.graphics.use(btnBorder);

      this.sendWaveInnerActor = new Actor({ x: 0, y: 0 });
      this.sendWaveInnerActor.graphics.use(new Rectangle({
        width: 114,
        height: 22,
        color: Color.fromRGB(60, 160, 60),
      }));
      this.sendWaveActor.addChild(this.sendWaveInnerActor);

      const btnLabel = new Text({
        text: 'Send Wave',
        color: Color.White,
        font: new Font({ size: 13 }),
      });
      const btnLabelActor = new Actor({ x: 0, y: 0 });
      btnLabelActor.graphics.use(btnLabel);
      this.sendWaveActor.addChild(btnLabelActor);

      this.sendWaveActor.on('pointerdown', () => {
        if (this.completed) {
          return;
        }
        this.completed = true;
        this.active = false;
        this.onComplete();
      });
      this.sendWaveActor.on('pointerenter', () => {
        this.sendWaveInnerActor?.graphics.use(new Rectangle({ width: 114, height: 22, color: Color.fromRGB(80, 200, 80) }));
      });
      this.sendWaveActor.on('pointerleave', () => {
        this.sendWaveInnerActor?.graphics.use(new Rectangle({ width: 114, height: 22, color: Color.fromRGB(60, 160, 60) }));
      });
      scene.add(this.sendWaveActor);
    }

    // Wave reach indicator line
    if (this.waveReach < GRID_HEIGHT) {
      const lineY = GRID_TOP + this.waveReach * TILE_SIZE;
      const lineX = GRID_LEFT + (GRID_WIDTH * TILE_SIZE) / 2;

      this.reachLineActor = new Actor({ x: lineX, y: lineY, z: 5 });
      this.reachLineActor.graphics.use(new Rectangle({
        width: GRID_WIDTH * TILE_SIZE,
        height: 2,
        color: Color.fromRGB(255, 180, 0, 0.7),
      }));
      scene.add(this.reachLineActor);

      this.reachLabelActor = new Actor({ x: lineX, y: lineY - 8, z: 5 });
      this.reachLabelActor.graphics.use(new Text({
        text: 'Wave limit',
        color: Color.fromRGB(255, 180, 0, 0.9),
        font: new Font({ size: 10 }),
      }));
      scene.add(this.reachLabelActor);
    }
  }

  deactivate(scene: Scene): void {
    this.active = false;
    this.strategy.deactivate(scene);
    if (this.sendWaveActor) {
      scene.remove(this.sendWaveActor);
      this.sendWaveActor = null;
      this.sendWaveInnerActor = null;
    }
    if (this.reachLineActor) {
      scene.remove(this.reachLineActor);
      this.reachLineActor = null;
    }
    if (this.reachLabelActor) {
      scene.remove(this.reachLabelActor);
      this.reachLabelActor = null;
    }
    this.hud.hidePlanning(scene);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async handleScoopComplete(_result: ScoopResult): Promise<void> {
    if (!this.active) {
      return;
    }
    this.hud.updateState(this.strategy.getStateText());
    if (Number.isFinite(this.scoopsRemaining)) {
      this.scoopsRemaining--;
      this.hud.updateScoops(this.scoopHudText());
      if (this.scoopsRemaining === 0 && !this.completed) {
        this.completed = true;
        this.active = false;
        this.hud.updateScoops('Scoops: 0 - sending wave...');
        await this.delay(600);
        this.onComplete();
      }
    } else {
      this.hud.updateScoops(this.scoopHudText());
    }
  }

  private scoopHudText(): string {
    if (!Number.isFinite(this.scoopsRemaining)) {
      return this.hasEnhancedShovel ? 'Shovel: Enhanced' : '';
    }
    const base = `Scoops: ${this.scoopsRemaining}`;
    return this.hasEnhancedShovel ? `${base} | Shovel: Enhanced` : base;
  }
}
