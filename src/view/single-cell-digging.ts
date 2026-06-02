import { Scene, Color, Rectangle, PointerEvent } from 'excalibur';
import { Tile } from './tile.ts';
import { GridView } from './grid-view.ts';
import { GRID_WIDTH, GRID_HEIGHT, computeLayout, TOWER_COST } from '../config.ts';
import type { DiggingStrategy, DiggingStrategyOptions, ScoopResult } from './digging-strategy.ts';
import { ToolType } from '../tool-type.ts';
import { Resources } from '../resources.ts';
import { playSound } from '../sound.ts';
import { FlatGround } from '../model/terrain/flat-ground.ts';
import type { InventoryModel } from '../model/inventory-model.ts';
import type { Toolbar } from './toolbar.ts';

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

const CURSOR_SHOVEL = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="20" y1="3" x2="13" y2="11" stroke="#8B4513" stroke-width="3" stroke-linecap="round"/><path d="M13 11 L7 11 L5 18 L10 21 L15 16 Z" fill="white" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 19, auto`;
})();

const CURSOR_WALL = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#C2A050" stroke="#8B7530" stroke-width="2"/><line x1="3" y1="10" x2="21" y2="10" stroke="#8B7530" stroke-width="1"/><line x1="3" y1="17" x2="21" y2="17" stroke="#8B7530" stroke-width="1"/><line x1="12" y1="3" x2="12" y2="10" stroke="#8B7530" stroke-width="1"/><line x1="7" y1="10" x2="7" y2="17" stroke="#8B7530" stroke-width="1"/><line x1="17" y1="10" x2="17" y2="17" stroke="#8B7530" stroke-width="1"/><line x1="12" y1="17" x2="12" y2="21" stroke="#8B7530" stroke-width="1"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
})();

const CURSOR_TOWER = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect x="6" y="2" width="12" height="20" rx="2" fill="#8B8B8B" stroke="#555" stroke-width="1.5"/><rect x="8" y="5" width="3" height="3" fill="#555"/><rect x="13" y="5" width="3" height="3" fill="#555"/><rect x="8" y="12" width="3" height="3" fill="#555"/><rect x="13" y="12" width="3" height="3" fill="#555"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
})();

export class SingleCellDigging implements DiggingStrategy {
  onScoopComplete: ((result: ScoopResult) => void) | null = null;

  private hoverListenerTiles: Tile[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private pointerHandler: ((evt: PointerEvent) => void) | null = null;
  private grid: GridView | null = null;
  private delta = 1;
  private locked = false;
  private inventory: InventoryModel | null = null;
  private toolbar: Toolbar | null = null;
  private onSandChanged: ((count: number) => void) | null = null;

  activate(scene: Scene, grid: GridView, opts: DiggingStrategyOptions): void {
    this.grid = grid;
    this.delta = opts.delta;
    this.inventory = opts.inventory;
    this.toolbar = opts.toolbar;
    this.onSandChanged = opts.onSandChanged;
    this.canvas = scene.engine.canvas;
    this.applyCursor();

    this.pointerHandler = (evt: PointerEvent) => {
      const col = Math.floor((evt.worldPos.x - GRID_LEFT) / TILE_SIZE);
      const row = Math.floor((evt.worldPos.y - GRID_TOP) / TILE_SIZE);
      if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_HEIGHT) {
        return;
      }
      this.handleClick(col, row);
    };
    scene.input.pointers.primary.on('down', this.pointerHandler);

    for (let row = 0; row < GRID_HEIGHT; row++) {
      for (let col = 0; col < GRID_WIDTH; col++) {
        const tile = grid.getTile(col, row);
        if (!tile || tile.isCastle) {
          continue;
        }
        tile.on('pointerenter', () => this.onTileEnter(tile));
        tile.on('pointerleave', () => this.onTileLeave(tile));
        this.hoverListenerTiles.push(tile);
      }
    }
  }

  deactivate(scene: Scene): void {
    for (const tile of this.hoverListenerTiles) {
      tile.off('pointerenter');
      tile.off('pointerleave');
    }
    this.hoverListenerTiles = [];
    if (this.pointerHandler) {
      scene.input.pointers.primary.off('down', this.pointerHandler);
      this.pointerHandler = null;
    }
    if (this.canvas) {
      this.canvas.style.cursor = '';
      this.canvas = null;
    }
    this.grid = null;
    this.inventory = null;
    this.toolbar = null;
    this.onSandChanged = null;
  }

  getStateText(): string {
    if (!this.toolbar) {
      return 'Click a tile to dig';
    }
    if (this.toolbar.active === ToolType.Shovel) {
      return 'Click a tile to dig';
    }
    if (this.toolbar.active === ToolType.Tower) {
      if ((this.inventory?.sand ?? 0) < TOWER_COST) {
        return 'Not enough sand for tower';
      }
      return 'Click flat ground to place tower';
    }
    if (!this.inventory?.hasSand) {
      return 'No sand - dig first';
    }
    return 'Click a tile to build wall';
  }

  updateCursor(): void {
    this.applyCursor();
  }

  lock(): void {
    this.locked = true;
    if (this.canvas) {
      this.canvas.style.cursor = '';
    }
  }

  unlock(): void {
    this.locked = false;
    this.applyCursor();
  }

  private applyCursor(): void {
    if (!this.canvas || !this.toolbar) {
      return;
    }
    if (this.toolbar.active === ToolType.Shovel) {
      this.canvas.style.cursor = CURSOR_SHOVEL;
    } else if (this.toolbar.active === ToolType.Tower) {
      this.canvas.style.cursor = CURSOR_TOWER;
    } else {
      this.canvas.style.cursor = CURSOR_WALL;
    }
  }

  private handleClick(col: number, row: number): void {
    if (this.locked || !this.grid || !this.toolbar || !this.inventory) {
      return;
    }
    const tile = this.grid.getTile(col, row);
    if (!tile || tile.isCastle) {
      return;
    }

    const activeTool = this.toolbar.active;

    if (activeTool === ToolType.Shovel) {
      this.grid.setElevation(col, row, -this.delta);
      this.inventory.addSand(this.delta);
      this.onSandChanged?.(this.inventory.sand);
      playSound(Resources.DigSound);
      this.onScoopComplete?.({
        tool: ToolType.Shovel,
        cell: { col, row },
        delta: this.delta,
      });
      return;
    }

    if (activeTool === ToolType.Wall) {
      if (!this.inventory.removeSand(this.delta)) {
        return;
      }
      this.grid.setElevation(col, row, +this.delta);
      this.onSandChanged?.(this.inventory.sand);
      playSound(Resources.WallToolSound);
      this.onScoopComplete?.({
        tool: ToolType.Wall,
        cell: { col, row },
        delta: this.delta,
      });
      return;
    }

    if (activeTool === ToolType.Tower) {
      if (!this.inventory.removeSand(TOWER_COST)) {
        return;
      }
      if (!this.grid.placeTower(col, row)) {
        this.inventory.addSand(TOWER_COST);
        return;
      }
      this.onSandChanged?.(this.inventory.sand);
      playSound(Resources.WallToolSound);
      this.onScoopComplete?.({
        tool: ToolType.Tower,
        cell: { col, row },
        delta: TOWER_COST,
      });
      return;
    }
  }

  private onTileEnter(tile: Tile): void {
    if (!this.grid || !this.toolbar) {
      return;
    }
    const neighbors = this.grid.model.getPoolNeighbors(tile.col, tile.row);
    const w = neighbors?.right ? TILE_SIZE : TILE_SIZE - 1;
    const h = neighbors?.bottom ? TILE_SIZE : TILE_SIZE - 1;

    if (this.toolbar.active === ToolType.Tower) {
      const cell = this.grid.model.getCell(tile.col, tile.row);
      const canPlace = cell instanceof FlatGround && (this.inventory?.sand ?? 0) >= TOWER_COST;
      tile.graphics.use(new Rectangle({
        width: w,
        height: h,
        color: canPlace
          ? Color.fromRGB(100, 220, 100, 0.7)
          : Color.fromRGB(220, 80, 80, 0.7),
      }));
      return;
    }

    if (this.toolbar.active === ToolType.Wall && this.inventory?.hasSand) {
      tile.graphics.use(new Rectangle({
        width: w,
        height: h,
        color: Color.fromRGB(100, 220, 100, 0.7),
      }));
    } else {
      tile.graphics.use(new Rectangle({
        width: w,
        height: h,
        color: Color.fromRGB(255, 255, 255, 0.45),
      }));
    }
  }

  private onTileLeave(tile: Tile): void {
    if (!this.grid) {
      return;
    }
    this.grid.refreshTileVisual(tile.col, tile.row);
  }
}
