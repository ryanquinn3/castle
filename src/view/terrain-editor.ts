import { Actor, Color, Keys, PointerEvent, Rectangle, Scene } from 'excalibur';
import { TOWER_COST, computeLayout } from '../config.ts';
import type { InventoryModel } from '../model/inventory-model.ts';
import { FlatGround } from '../model/terrain/flat-ground.ts';
import { Tower } from '../model/terrain/tower.ts';
import type { Terrain } from '../model/terrain/terrain.ts';
import { Resources } from '../resources.ts';
import { playSound } from '../sound.ts';
import { ToolType } from '../tool-type.ts';
import type { GridView } from './grid-view.ts';
import type { Toolbar } from './toolbar.ts';

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

const ARROW_DELTAS: Partial<Record<Keys, { dx: number; dy: number }>> = {
  [Keys.Up]: { dx: 0, dy: -1 },
  [Keys.Down]: { dx: 0, dy: 1 },
  [Keys.Left]: { dx: -1, dy: 0 },
  [Keys.Right]: { dx: 1, dy: 0 },
};

export function validActionsFor({ cell, sand }: { cell: Terrain; sand: number }): Set<ToolType> {
  const actions = new Set<ToolType>();
  if (cell instanceof Tower) {
    return actions;
  }

  actions.add(ToolType.Shovel);
  if (sand >= 1) {
    actions.add(ToolType.Wall);
  }
  if (cell instanceof FlatGround && sand >= TOWER_COST) {
    actions.add(ToolType.Tower);
  }

  return actions;
}

export interface Cell {
  col: number;
  row: number;
}

export interface TerrainEdit {
  tool: ToolType;
  cell: Cell;
  delta: number;
}

export interface TerrainEditorOptions {
  delta: number;
  inventory: InventoryModel;
  toolbar: Toolbar;
  onSandChanged: (count: number) => void;
  onStateChanged: () => void;
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

export class TerrainEditor {
  onEditApplied: ((edit: TerrainEdit) => void) | null = null;

  selected: Cell | null = null;

  private grid: GridView | null = null;
  private inventory: InventoryModel | null = null;
  private toolbar: Toolbar | null = null;
  private delta = 1;
  private locked = false;
  private onSandChanged: ((count: number) => void) | null = null;
  private onStateChanged: (() => void) | null = null;
  private highlight: Actor | null = null;
  private pointerHandler: ((evt: PointerEvent) => void) | null = null;
  private keyHandler: ((evt: { key: Keys }) => void) | null = null;

  activate(scene: Scene, grid: GridView, opts: TerrainEditorOptions): void {
    this.grid = grid;
    this.inventory = opts.inventory;
    this.toolbar = opts.toolbar;
    this.delta = opts.delta;
    this.onSandChanged = opts.onSandChanged;
    this.onStateChanged = opts.onStateChanged;
    this.selected = null;
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

    this.pointerHandler = (evt: PointerEvent) => {
      const col = Math.floor((evt.worldPos.x - GRID_LEFT) / TILE_SIZE);
      const row = Math.floor((evt.worldPos.y - GRID_TOP) / TILE_SIZE);
      this.selectCell(col, row);
    };
    scene.input.pointers.primary.on('down', this.pointerHandler);

    this.keyHandler = (evt) => this.handleKey(evt.key);
    scene.engine.input.keyboard.on('press', this.keyHandler);

    this.toolbar.onToolTriggered = (tool) => this.applyAction(tool);

    this.updateToolbar();
    this.onStateChanged?.();
  }

  deactivate(scene: Scene): void {
    if (this.pointerHandler) {
      scene.input.pointers.primary.off('down', this.pointerHandler);
      this.pointerHandler = null;
    }
    if (this.keyHandler) {
      scene.engine.input.keyboard.off('press', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.highlight) {
      scene.remove(this.highlight);
      this.highlight = null;
    }
    if (this.toolbar) {
      this.toolbar.onToolTriggered = null;
    }
    this.selected = null;
    this.grid = null;
    this.inventory = null;
    this.toolbar = null;
  }

  selectCell(col: number, row: number): void {
    if (this.locked || !this.grid) {
      return;
    }
    if (col < 0 || col >= this.grid.model.width || row < 0 || row >= this.grid.model.height) {
      return;
    }
    if (this.grid.model.isCastle(col, row)) {
      return;
    }
    this.selected = { col, row };
    this.updateHighlight();
    this.updateToolbar();
    this.onStateChanged?.();
  }

  private updateToolbar(): void {
    if (!this.toolbar) {
      return;
    }
    if (!this.selected || !this.grid || !this.inventory) {
      this.toolbar.setEnabledTools(null);
      return;
    }
    const cell = this.grid.model.getCell(this.selected.col, this.selected.row);
    this.toolbar.setEnabledTools(this.availableActionsFor(cell));
  }

  private availableActionsFor(cell: Terrain): Set<ToolType> {
    const actions = validActionsFor({ cell, sand: this.inventory?.sand ?? 0 });
    if ((this.inventory?.sand ?? 0) < this.delta) {
      actions.delete(ToolType.Wall);
    }
    return actions;
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
    const delta = ARROW_DELTAS[key];
    if (!delta) {
      return;
    }
    this.moveSelection(delta.dx, delta.dy);
  }

  moveSelection(dx: number, dy: number): void {
    if (this.locked || !this.grid) {
      return;
    }
    const model = this.grid.model;
    if (!this.selected) {
      this.selected = defaultSelection({
        castleCol: model.castleCol,
        castleRow: model.castleRow,
        width: model.width,
        height: model.height,
        isCastle: (col, row) => model.isCastle(col, row),
      });
    } else {
      const next = nextSelection({
        from: this.selected,
        dx,
        dy,
        width: model.width,
        height: model.height,
        isCastle: (col, row) => model.isCastle(col, row),
      });
      if (!next) {
        return;
      }
      this.selected = next;
    }
    this.updateHighlight();
    this.updateToolbar();
    this.onStateChanged?.();
  }

  applyAction(tool: ToolType): void {
    if (this.locked || !this.selected || !this.grid || !this.inventory) {
      return;
    }
    const { col, row } = this.selected;
    const cell = this.grid.model.getCell(col, row);
    if (!validActionsFor({ cell, sand: this.inventory.sand }).has(tool)) {
      return;
    }

    if (tool === ToolType.Shovel) {
      this.grid.setElevation(col, row, -this.delta);
      this.inventory.addSand(this.delta);
      playSound(Resources.DigSound);
      this.afterEdit({ tool, cell: { col, row }, delta: this.delta });
      return;
    }

    if (tool === ToolType.Wall) {
      if (!this.inventory.removeSand(this.delta)) {
        return;
      }
      this.grid.setElevation(col, row, +this.delta);
      playSound(Resources.WallToolSound);
      this.afterEdit({ tool, cell: { col, row }, delta: this.delta });
      return;
    }

    if (tool === ToolType.Tower) {
      if (!this.inventory.removeSand(TOWER_COST)) {
        return;
      }
      if (!this.grid.placeTower(col, row)) {
        this.inventory.addSand(TOWER_COST);
        return;
      }
      playSound(Resources.WallToolSound);
      this.afterEdit({ tool, cell: { col, row }, delta: TOWER_COST });
    }
  }

  private afterEdit(edit: TerrainEdit): void {
    this.onSandChanged?.(this.inventory!.sand);
    this.onEditApplied?.(edit);
    this.updateHighlight();
    this.updateToolbar();
    this.onStateChanged?.();
  }

  getStateText(): string {
    if (!this.selected || !this.grid || !this.inventory) {
      return 'Click a cell to start planning';
    }
    const cell = this.grid.model.getCell(this.selected.col, this.selected.row);
    const actions = this.availableActionsFor(cell);
    if (actions.size === 0) {
      return 'Tower selected - move to another cell';
    }
    const names: string[] = [];
    if (actions.has(ToolType.Shovel)) {
      names.push('dig');
    }
    if (actions.has(ToolType.Wall)) {
      names.push('wall');
    }
    if (actions.has(ToolType.Tower)) {
      names.push('tower');
    }
    return `Selected - ${names.join(' / ')}`;
  }

  lock(): void {
    this.locked = true;
    this.updateHighlight();
  }

  unlock(): void {
    this.locked = false;
    this.updateHighlight();
  }
}
