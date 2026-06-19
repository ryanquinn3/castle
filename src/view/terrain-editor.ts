import { Actor, Color, Keys, PointerEvent, Rectangle, Scene } from 'excalibur';
import { MAX_WALL_LEVEL, TOWER_COST, WALL_LEVEL_COST, TILE_SIZE, GRID_LEFT, GRID_TOP } from '../config.ts';
import type { InventoryModel } from '../model/inventory-model.ts';
import { Hole } from '../model/terrain/hole.ts';
import { Tower } from '../model/terrain/tower.ts';
import { Wall } from '../model/terrain/wall.ts';
import type { CellInfo, Terrain } from '../model/terrain/terrain.ts';
import { Resources } from '../resources.ts';
import { playSound } from '../sound.ts';
import { ActionType, ACTION_META, applicableActions, actionCost } from '../action-type.ts';
import type { GridModel } from '../model/grid-model.ts';
import type { Toolbar, ActionView } from './toolbar.ts';
import type { DeleteConfirmation } from './delete-confirmation.ts';

const ARROW_DELTAS: Partial<Record<Keys, { dx: number; dy: number }>> = {
  [Keys.Up]: { dx: 0, dy: -1 },
  [Keys.Down]: { dx: 0, dy: 1 },
  [Keys.Left]: { dx: -1, dy: 0 },
  [Keys.Right]: { dx: 1, dy: 0 },
};

export interface Cell {
  col: number;
  row: number;
}

export interface TerrainEdit {
  action: ActionType;
  cell: Cell;
  delta: number;
}

export interface TerrainEditorOptions {
  delta: number;
  inventory: InventoryModel;
  toolbar: Toolbar;
  deleteConfirmation: DeleteConfirmation;
  onSandChanged: (count: number) => void;
  onStateChanged: () => void;
  onDeleteDialogOpenChange: (open: boolean) => void;
}

export function nextSelection({ from, dx, dy, width, height, isCastle }: {
  from: Cell;
  dx: number;
  dy: number;
  width: number;
  height: number;
  isCastle: (col: number, row: number) => boolean;
}): Cell | null {
  if (dx === 0 && dy === 0) {
    return null;
  }

  let col = from.col + dx;
  let row = from.row + dy;

  while (col >= 0 && col < width && row >= 0 && row < height) {
    if (!isCastle(col, row)) {
      return { col, row };
    }
    col += dx;
    row += dy;
  }

  return null;
}

export function defaultSelection({ castleCol, castleRow, width, height, isCastle }: {
  castleCol: number;
  castleRow: number;
  width: number;
  height: number;
  isCastle: (col: number, row: number) => boolean;
}): Cell {
  const front = { col: castleCol, row: castleRow - 1 };
  if (front.row >= 0 && !isCastle(front.col, front.row)) {
    return front;
  }

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!isCastle(col, row)) {
        return { col, row };
      }
    }
  }

  return { col: 0, row: 0 };
}

function buildActionViews(cell: Terrain, sand: number): ActionView[] {
  const actions = applicableActions(cell);
  return actions.map((action) => {
    const meta = ACTION_META[action];
    const cost = actionCost({ action, cell });
    const isDisabled = cost > 0 && sand < cost;

    let sandEffect: ActionView['sandEffect'];
    if (action === ActionType.Dig) {
      sandEffect = { amount: 1, variant: 'earn' };
    } else if (cost > 0) {
      sandEffect = { amount: cost, variant: 'spend' };
    }

    return {
      type: action,
      hotkey: meta.hotkey,
      label: meta.label,
      sandEffect,
      disabled: isDisabled,
    };
  });
}

export class TerrainEditor {
  onEditApplied: ((edit: TerrainEdit) => void) | null = null;

  selected: Cell | null = null;
  hovered: Cell | null = null;

  private grid: GridModel | null = null;
  private inventory: InventoryModel | null = null;
  private toolbar: Toolbar | null = null;
  private deleteConfirmation: DeleteConfirmation | null = null;
  private delta = 1;
  private locked = false;
  private onSandChanged: ((count: number) => void) | null = null;
  private onStateChanged: (() => void) | null = null;
  private onDeleteDialogOpenChange: ((open: boolean) => void) | null = null;
  private highlight: Actor | null = null;
  private hoverHighlight: Actor | null = null;
  private lastPointer: Cell | null = null;
  private pointerHandler: ((evt: PointerEvent) => void) | null = null;
  private moveHandler: ((evt: PointerEvent) => void) | null = null;
  private keyHandler: ((evt: { key: Keys }) => void) | null = null;

  activate(scene: Scene, grid: GridModel, opts: TerrainEditorOptions): void {
    this.grid = grid;
    this.inventory = opts.inventory;
    this.toolbar = opts.toolbar;
    this.deleteConfirmation = opts.deleteConfirmation;
    this.delta = opts.delta;
    this.onSandChanged = opts.onSandChanged;
    this.onStateChanged = opts.onStateChanged;
    this.onDeleteDialogOpenChange = opts.onDeleteDialogOpenChange;
    this.selected = null;
    this.hovered = null;
    this.locked = false;

    this.highlight = new Actor({ x: 0, y: 0, z: 6 });
    this.highlight.graphics.use(new Rectangle({
      width: TILE_SIZE,
      height: TILE_SIZE,
      color: Color.Transparent,
      strokeColor: Color.fromRGB(255, 240, 120),
      lineWidth: 2,
    }));
    this.highlight.graphics.visible = false;
    scene.add(this.highlight);

    this.hoverHighlight = new Actor({ x: 0, y: 0, z: 5 });
    this.hoverHighlight.graphics.use(new Rectangle({
      width: TILE_SIZE,
      height: TILE_SIZE,
      color: Color.fromRGB(255, 255, 255, 0.25),
    }));
    this.hoverHighlight.graphics.visible = false;
    scene.add(this.hoverHighlight);

    this.pointerHandler = (evt: PointerEvent) => {
      const { col, row } = this.cellAt(evt);
      this.selectCell(col, row);
    };
    scene.input.pointers.primary.on('down', this.pointerHandler);

    this.moveHandler = (evt: PointerEvent) => {
      const { col, row } = this.cellAt(evt);
      this.hoverCell(col, row);
    };
    scene.input.pointers.primary.on('move', this.moveHandler);

    this.keyHandler = (evt) => this.handleKey(evt.key);
    scene.engine.input.keyboard.on('press', this.keyHandler);

    this.toolbar.onActionTriggered = (action) => this.applyAction(action);

    this.updateToolbar();
    this.onStateChanged?.();
  }

  deactivate(scene: Scene): void {
    if (this.pointerHandler) {
      scene.input.pointers.primary.off('down', this.pointerHandler);
      this.pointerHandler = null;
    }
    if (this.moveHandler) {
      scene.input.pointers.primary.off('move', this.moveHandler);
      this.moveHandler = null;
    }
    if (this.keyHandler) {
      scene.engine.input.keyboard.off('press', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.highlight) {
      scene.remove(this.highlight);
      this.highlight = null;
    }
    if (this.hoverHighlight) {
      scene.remove(this.hoverHighlight);
      this.hoverHighlight = null;
    }
    if (this.toolbar) {
      this.toolbar.onActionTriggered = null;
    }
    this.selected = null;
    this.hovered = null;
    this.grid = null;
    this.inventory = null;
    this.toolbar = null;
  }

  selectCell(col: number, row: number): void {
    if (this.locked || !this.isSelectable(col, row)) {
      return;
    }
    this.selected = { col, row };
    this.updateHighlight();
    this.refreshHover();
    this.updateToolbar();
    this.onStateChanged?.();
  }

  private clearSelection(): void {
    if (this.locked || !this.selected) {
      return;
    }
    this.selected = null;
    this.updateHighlight();
    this.refreshHover();
    this.updateToolbar();
    this.onStateChanged?.();
  }

  private hoverCell(col: number, row: number): void {
    if (this.locked) {
      return;
    }
    this.lastPointer = { col, row };
    this.refreshHover();
  }

  private refreshHover(): void {
    if (this.locked || this.selected || !this.lastPointer) {
      this.hovered = null;
      this.updateHoverHighlight();
      return;
    }
    const { col, row } = this.lastPointer;
    this.hovered = this.isSelectable(col, row) ? { col, row } : null;
    this.updateHoverHighlight();
  }

  private isSelectable(col: number, row: number): boolean {
    if (!this.grid) {
      return false;
    }
    if (col < 0 || col >= this.grid.width || row < 0 || row >= this.grid.height) {
      return false;
    }
    return !this.grid.isCastle(col, row);
  }

  private cellAt(evt: PointerEvent): Cell {
    return {
      col: Math.floor((evt.worldPos.x - GRID_LEFT) / TILE_SIZE),
      row: Math.floor((evt.worldPos.y - GRID_TOP) / TILE_SIZE),
    };
  }

  private updateHoverHighlight(): void {
    if (!this.hoverHighlight) {
      return;
    }
    if (!this.hovered || this.locked) {
      this.hoverHighlight.graphics.visible = false;
      return;
    }
    this.hoverHighlight.pos.x = GRID_LEFT + (this.hovered.col + 0.5) * TILE_SIZE;
    this.hoverHighlight.pos.y = GRID_TOP + (this.hovered.row + 0.5) * TILE_SIZE;
    this.hoverHighlight.graphics.visible = true;
  }

  private updateToolbar(): void {
    if (!this.toolbar) {
      return;
    }
    if (!this.selected || !this.grid || !this.inventory) {
      this.toolbar.setActions(null);
      return;
    }
    const cell = this.grid.getCell(this.selected.col, this.selected.row);
    const views = buildActionViews(cell, this.inventory.sand);
    this.toolbar.setActions(views);
  }

  private updateHighlight(): void {
    if (!this.highlight) {
      return;
    }
    if (!this.selected) {
      this.highlight.graphics.visible = false;
      return;
    }
    this.highlight.pos.x = GRID_LEFT + (this.selected.col + 0.5) * TILE_SIZE;
    this.highlight.pos.y = GRID_TOP + (this.selected.row + 0.5) * TILE_SIZE;
    this.highlight.graphics.visible = !this.locked;
  }

  private handleKey(key: Keys): void {
    if (this.locked || !this.grid) {
      return;
    }
    if (key === Keys.Escape) {
      this.clearSelection();
      return;
    }
    if (key === Keys.Delete || key === Keys.Backspace) {
      void this.requestDestroy();
      return;
    }
    const delta = ARROW_DELTAS[key];
    if (!delta) {
      return;
    }
    this.moveSelection(delta.dx, delta.dy);
  }

  private async requestDestroy(): Promise<void> {
    if (this.locked || !this.grid || !this.selected || !this.deleteConfirmation) {
      return;
    }
    const { col, row } = this.selected;
    const cell = this.grid.getCell(col, row);
    if (!(cell instanceof Wall) && !(cell instanceof Hole) && !(cell instanceof Tower)) {
      return;
    }
    const label = cell.describe().title;
    this.lock();
    this.onDeleteDialogOpenChange?.(true);
    const confirmed = await this.deleteConfirmation.open(label);
    this.onDeleteDialogOpenChange?.(false);
    this.unlock();
    if (confirmed) {
      this.grid.clearCell(col, row);
      this.onSandChanged?.(this.inventory?.sand ?? 0);
      this.updateToolbar();
      this.onStateChanged?.();
    }
  }

  moveSelection(dx: number, dy: number): void {
    if (this.locked || !this.grid) {
      return;
    }
    if (!this.selected) {
      this.selected = defaultSelection({
        castleCol: this.grid.castleCol,
        castleRow: this.grid.castleRow,
        width: this.grid.width,
        height: this.grid.height,
        isCastle: (col, row) => this.grid!.isCastle(col, row),
      });
    } else {
      const next = nextSelection({
        from: this.selected,
        dx,
        dy,
        width: this.grid.width,
        height: this.grid.height,
        isCastle: (col, row) => this.grid!.isCastle(col, row),
      });
      if (!next) {
        return;
      }
      this.selected = next;
    }
    this.updateHighlight();
    this.refreshHover();
    this.updateToolbar();
    this.onStateChanged?.();
  }

  applyAction(action: ActionType): void {
    if (this.locked || !this.selected || !this.grid || !this.inventory) {
      return;
    }
    const { col, row } = this.selected;
    const cell = this.grid.getCell(col, row);

    if (action === ActionType.Destroy) {
      void this.requestDestroy();
      return;
    }

    const available = applicableActions(cell);
    if (!available.includes(action)) {
      return;
    }

    const cost = actionCost({ action, cell });
    if (cost > 0 && this.inventory.sand < cost) {
      return;
    }

    if (action === ActionType.Dig) {
      this.grid.setElevation(col, row, -this.delta);
      this.inventory.addSand(this.delta);
      playSound(Resources.DigSound);
      this.afterEdit({ action, cell: { col, row }, delta: this.delta });
      return;
    }

    if (action === ActionType.BuildWall) {
      if (!this.inventory.removeSand(WALL_LEVEL_COST[0])) {
        return;
      }
      if (!this.grid.placeWall(col, row, 1)) {
        this.inventory.addSand(WALL_LEVEL_COST[0]);
        return;
      }
      playSound(Resources.WallToolSound);
      this.afterEdit({ action, cell: { col, row }, delta: WALL_LEVEL_COST[0] });
      return;
    }

    if (action === ActionType.BuildTower) {
      if (!this.inventory.removeSand(TOWER_COST)) {
        return;
      }
      if (!this.grid.placeTower(col, row)) {
        this.inventory.addSand(TOWER_COST);
        return;
      }
      playSound(Resources.WallToolSound);
      this.afterEdit({ action, cell: { col, row }, delta: TOWER_COST });
      return;
    }

    if (action === ActionType.Upgrade) {
      const wall = cell as Wall;
      const nextLevel = wall.level + 1;
      if (nextLevel > MAX_WALL_LEVEL) {
        return;
      }
      const upgradeCost = WALL_LEVEL_COST[nextLevel - 1];
      if (!this.inventory.removeSand(upgradeCost)) {
        return;
      }
      if (!this.grid.placeWall(col, row, nextLevel)) {
        this.inventory.addSand(upgradeCost);
        return;
      }
      playSound(Resources.WallToolSound);
      this.afterEdit({ action, cell: { col, row }, delta: upgradeCost });
    }
  }

  private afterEdit(edit: TerrainEdit): void {
    this.onSandChanged?.(this.inventory!.sand);
    this.onEditApplied?.(edit);
    this.updateHighlight();
    this.updateToolbar();
    this.onStateChanged?.();
  }

  getSelectedInfo(): CellInfo | null {
    if (!this.selected || !this.grid || !this.inventory) {
      return null;
    }
    const cell = this.grid.getCell(this.selected.col, this.selected.row);
    return cell.describe();
  }

  lock(): void {
    this.locked = true;
    this.hovered = null;
    this.updateHighlight();
    this.updateHoverHighlight();
  }

  unlock(): void {
    this.locked = false;
    this.updateHighlight();
  }
}
