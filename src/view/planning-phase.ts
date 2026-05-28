import { Scene, Actor, Color, Rectangle, Text, Font } from 'excalibur';
import { GridView } from './grid-view.ts';
import { GRID_WIDTH, GRID_HEIGHT, computeLayout } from '../config.ts';
import type { DiggingStrategy, ScoopResult } from './digging-strategy.ts';
import { SingleCellDigging } from './single-cell-digging.ts';
import { ToolType } from '../tool-type.ts';
import type { InventoryModel } from '../model/inventory-model.ts';
import type { Toolbar } from './toolbar.ts';

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

export interface PlanningHud {
  showPlanning(scene: Scene, waveText: string): void;
  hidePlanning(scene: Scene): void;
  updateState(text: string): void;
}

export class PlanningPhase {
  private scoopsRemaining: number;
  private reachLineActor: Actor | null = null;
  private reachLabelActor: Actor | null = null;
  private active = false;
  private completed = false;
  private strategy: DiggingStrategy;
  private toolSelectedHandler: ((tool: unknown) => void) | null = null;

  constructor(
    private grid: GridView,
    private hud: PlanningHud,
    scoops: number,
    private waveReach: number,
    private waveHeight: number,
    private numWaves: number,
    private inventory: InventoryModel,
    private toolbar: Toolbar,
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
      `Wave: ${Math.round(this.waveHeight)}  ×${this.numWaves}`,
    );

    this.strategy.onScoopComplete = (result) => this.handleScoopComplete(result);
    this.strategy.activate(scene, this.grid, {
      delta: 1,
      inventory: this.inventory,
      toolbar: this.toolbar,
    });

    this.toolbar.setDisabled(false);
    this.toolbar.selectTool(this.toolbar.active);

    this.toolSelectedHandler = () => {
      this.strategy.updateCursor?.();
      this.hud.updateState(this.strategy.getStateText());
    };
    this.toolbar.onToolSelected = this.toolSelectedHandler;

    this.hud.updateState(this.strategy.getStateText());

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

  lockDigging(): void {
    this.strategy.lock?.();
  }

  unlockDigging(): void {
    this.strategy.unlock?.();
  }

  deactivate(scene: Scene): void {
    this.active = false;
    this.strategy.deactivate(scene);
    this.toolbar.setDisabled(true);
    this.toolbar.onToolSelected = null;
    this.toolSelectedHandler = null;
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

  private async handleScoopComplete(result: ScoopResult): Promise<void> {
    if (!this.active) {
      return;
    }
    this.hud.updateState(this.strategy.getStateText());
    if (result.tool === ToolType.Shovel && Number.isFinite(this.scoopsRemaining)) {
      this.scoopsRemaining--;
      if (this.scoopsRemaining === 0 && !this.completed) {
        this.completed = true;
        this.active = false;
        this.hud.updateState('Sending wave...');
        await this.delay(600);
        this.onComplete();
      }
    }
  }
}
