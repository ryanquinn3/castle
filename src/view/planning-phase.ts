import { Scene, Actor, Color, Rectangle, Text, Font } from 'excalibur';
import type { GridModel } from '../model/grid-model.ts';
import { GRID_WIDTH, GRID_HEIGHT, computeLayout } from '../config.ts';
import { TerrainEditor, type TerrainEdit } from './terrain-editor.ts';
import { ToolType } from '../tool-type.ts';
import type { InventoryModel } from '../model/inventory-model.ts';
import type { Toolbar } from './toolbar.ts';
import type { CellInfo } from '../model/terrain/terrain.ts';
import type { DeleteConfirmation } from './delete-confirmation.ts';

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

export interface PlanningHud {
  showPlanning(scene: Scene, waveText: string): void;
  hidePlanning(scene: Scene): void;
  updateSelection(info: CellInfo | null): void;
  updateSand(count: number): void;
}

export class PlanningPhase {
  private scoopsRemaining: number;
  private reachLineActor: Actor | null = null;
  private reachLabelActor: Actor | null = null;
  private active = false;
  private completed = false;
  private editor = new TerrainEditor();

  constructor(
    private grid: GridModel,
    private hud: PlanningHud,
    scoops: number,
    private waveReach: number,
    private waveHeight: number,
    private numWaves: number,
    private inventory: InventoryModel,
    private toolbar: Toolbar,
    private onComplete: () => void,
    private deleteConfirmation: DeleteConfirmation,
    private onDeleteDialogOpenChange: (open: boolean) => void = () => {},
  ) {
    this.scoopsRemaining = scoops;
  }

  activate(scene: Scene): void {
    this.active = true;
    this.completed = false;

    this.hud.showPlanning(
      scene,
      `Wave: ${Math.round(this.waveHeight)}  ×${this.numWaves}`,
    );

    this.editor.onEditApplied = (edit) => this.handleEdit(edit);
    this.editor.activate(scene, this.grid, {
      delta: 1,
      inventory: this.inventory,
      toolbar: this.toolbar,
      deleteConfirmation: this.deleteConfirmation,
      onSandChanged: (count) => {
        this.hud.updateSand(count);
        this.toolbar.setSandCount(count);
      },
      onStateChanged: () => this.hud.updateSelection(this.editor.getSelectedInfo()),
      onDeleteDialogOpenChange: this.onDeleteDialogOpenChange,
    });

    this.toolbar.setDisabled(false);
    this.toolbar.setSandCount(this.inventory.sand);
    this.hud.updateSelection(this.editor.getSelectedInfo());

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
    this.editor.lock();
  }

  unlockDigging(): void {
    this.editor.unlock();
  }

  deactivate(scene: Scene): void {
    this.active = false;
    this.editor.deactivate(scene);
    this.toolbar.setDisabled(true);
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

  private async handleEdit(edit: TerrainEdit): Promise<void> {
    if (!this.active) {
      return;
    }
    this.hud.updateSelection(this.editor.getSelectedInfo());
    if (edit.tool === ToolType.Shovel && Number.isFinite(this.scoopsRemaining)) {
      this.scoopsRemaining--;
      if (this.scoopsRemaining === 0 && !this.completed) {
        this.completed = true;
        this.active = false;
        this.hud.updateSelection(null);
        await this.delay(600);
        this.onComplete();
      }
    }
  }
}
