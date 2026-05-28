import { Scene, Color, Rectangle, PointerEvent, PointerButton } from 'excalibur';
import { Tile } from './tile.ts';
import { GridView } from './grid-view.ts';
import { GRID_WIDTH, GRID_HEIGHT, computeLayout } from '../config.ts';
import type { DiggingStrategy, DiggingStrategyOptions, ScoopResult } from './digging-strategy.ts';
import { ToolType } from '../tool-type.ts';
import { Resources } from '../resources.ts';

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

const CURSOR_EMPTY = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="20" y1="3" x2="13" y2="11" stroke="#8B4513" stroke-width="3" stroke-linecap="round"/><path d="M13 11 L7 11 L5 18 L10 21 L15 16 Z" fill="white" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 19, auto`;
})();

const CURSOR_FULL = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="20" y1="3" x2="13" y2="11" stroke="#8B4513" stroke-width="3" stroke-linecap="round"/><path d="M13 11 L7 11 L5 18 L10 21 L15 16 Z" fill="#A0522D" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 19, auto`;
})();

const MAX_DRAG_CELLS = 3;

export interface Cell {
  col: number;
  row: number;
}

export function isOrthogonallyAdjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
}

export function canAddToSelection(selected: Cell[], candidate: Cell, max: number): boolean {
  if (selected.length >= max) {
    return false;
  }
  if (selected.some(c => c.col === candidate.col && c.row === candidate.row)) {
    return false;
  }
  const last = selected[selected.length - 1];
  return isOrthogonallyAdjacent(last, candidate);
}

export class DragDigging implements DiggingStrategy {
  onScoopComplete: ((result: ScoopResult) => void) | null = null;

  private selectedCells: { col: number; row: number; tile: Tile }[] = [];
  private isDragging = false;
  private waitingForDump = false;
  private locked = false;
  private grid: GridView | null = null;
  private delta = 1;
  private canvas: HTMLCanvasElement | null = null;
  private hoverListenerTiles: Tile[] = [];
  private pointerDownHandler: ((evt: PointerEvent) => void) | null = null;
  private pointerMoveHandler: ((evt: PointerEvent) => void) | null = null;
  private pointerUpHandler: ((evt: PointerEvent) => void) | null = null;

  activate(scene: Scene, grid: GridView, opts: DiggingStrategyOptions): void {
    this.grid = grid;
    this.delta = opts.delta;
    this.canvas = scene.engine.canvas;
    this.canvas.style.cursor = CURSOR_EMPTY;

    this.pointerDownHandler = (evt: PointerEvent) => this.onPointerDown(evt);
    this.pointerMoveHandler = (evt: PointerEvent) => this.onPointerMove(evt);
    this.pointerUpHandler = (evt: PointerEvent) => this.onPointerUp(evt);

    scene.input.pointers.primary.on('down', this.pointerDownHandler);
    scene.input.pointers.primary.on('move', this.pointerMoveHandler);
    scene.input.pointers.primary.on('up', this.pointerUpHandler);

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

  lock(): void {
    this.locked = true;
    for (const cell of this.selectedCells) {
      this.clearTint(cell.tile);
    }
    this.selectedCells = [];
    this.isDragging = false;
    this.waitingForDump = false;
    if (this.canvas) {
      this.canvas.style.cursor = '';
    }
  }

  unlock(): void {
    this.locked = false;
    if (this.canvas) {
      this.canvas.style.cursor = CURSOR_EMPTY;
    }
  }

  deactivate(scene: Scene): void {
    if (this.grid && this.selectedCells.length > 0) {
      for (const cell of this.selectedCells) {
        this.clearTint(cell.tile);
      }
      this.selectedCells = [];
    }
    this.isDragging = false;
    this.waitingForDump = false;
    this.locked = false;

    for (const tile of this.hoverListenerTiles) {
      tile.off('pointerenter');
      tile.off('pointerleave');
    }
    this.hoverListenerTiles = [];

    if (this.pointerDownHandler) {
      scene.input.pointers.primary.off('down', this.pointerDownHandler);
      this.pointerDownHandler = null;
    }
    if (this.pointerMoveHandler) {
      scene.input.pointers.primary.off('move', this.pointerMoveHandler);
      this.pointerMoveHandler = null;
    }
    if (this.pointerUpHandler) {
      scene.input.pointers.primary.off('up', this.pointerUpHandler);
      this.pointerUpHandler = null;
    }

    if (this.canvas) {
      this.canvas.style.cursor = '';
      this.canvas = null;
    }
    this.grid = null;
  }

  getStateText(): string {
    if (this.isDragging) {
      return `Drag to select tiles (${this.selectedCells.length}/${MAX_DRAG_CELLS})`;
    }
    if (this.waitingForDump) {
      return `Click a tile to dump ${this.selectedCells.length} scoop(s) | Right-click to cancel`;
    }
    return 'Click and drag to scoop tiles';
  }

  private worldToGrid(evt: PointerEvent): { col: number; row: number } | null {
    const col = Math.floor((evt.worldPos.x - GRID_LEFT) / TILE_SIZE);
    const row = Math.floor((evt.worldPos.y - GRID_TOP) / TILE_SIZE);
    if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_HEIGHT) {
      return null;
    }
    return { col, row };
  }

  private onPointerDown(evt: PointerEvent): void {
    if (this.locked || !this.grid) {
      return;
    }

    const pos = this.worldToGrid(evt);
    if (!pos) {
      return;
    }

    const button = evt.button === PointerButton.Right ? 'right' : 'left';

    if (this.waitingForDump) {
      this.handleDumpClick(pos.col, pos.row, button);
      return;
    }

    if (button !== 'left') {
      return;
    }

    const tile = this.grid.getTile(pos.col, pos.row);
    if (!tile || tile.isCastle) {
      return;
    }

    this.isDragging = true;
    this.applyTint(tile);
    this.selectedCells.push({ col: pos.col, row: pos.row, tile });
  }

  private onPointerMove(evt: PointerEvent): void {
    if (this.locked || !this.isDragging || !this.grid) {
      return;
    }

    const pos = this.worldToGrid(evt);
    if (!pos) {
      return;
    }

    const tile = this.grid.getTile(pos.col, pos.row);
    if (!tile || tile.isCastle) {
      return;
    }

    if (!canAddToSelection(this.selectedCells, pos, MAX_DRAG_CELLS)) {
      return;
    }

    this.applyTint(tile);
    this.selectedCells.push({ col: pos.col, row: pos.row, tile });
  }

  private onPointerUp(_evt: PointerEvent): void {
    if (this.locked || !this.isDragging) {
      return;
    }

    this.isDragging = false;

    if (this.selectedCells.length > 0) {
      this.waitingForDump = true;
      if (this.canvas) {
        this.canvas.style.cursor = CURSOR_FULL;
      }
    }
  }

  private handleDumpClick(col: number, row: number, button: 'left' | 'right'): void {
    if (!this.grid) {
      return;
    }

    if (button === 'right') {
      for (const cell of this.selectedCells) {
        this.clearTint(cell.tile);
      }
      this.resetState();
      return;
    }

    const tile = this.grid.getTile(col, row);
    if (!tile || tile.isCastle) {
      return;
    }

    const totalDelta = this.delta * this.selectedCells.length;

    for (const cell of this.selectedCells) {
      this.grid.setElevation(cell.col, cell.row, -this.delta);
    }
    this.grid.setElevation(col, row, +totalDelta);
    Resources.DigSound.play();
    for (const cell of this.selectedCells) {
      this.clearTint(cell.tile);
    }

    const result: ScoopResult = {
      tool: ToolType.Shovel,
      cell: { col, row },
      delta: totalDelta,
    };

    this.resetState();
    this.onScoopComplete?.(result);
  }

  private resetState(): void {
    this.selectedCells = [];
    this.isDragging = false;
    this.waitingForDump = false;
    if (this.canvas) {
      this.canvas.style.cursor = CURSOR_EMPTY;
    }
  }

  private isSelectedCell(col: number, row: number): boolean {
    return this.selectedCells.some(c => c.col === col && c.row === row);
  }

  private onTileEnter(tile: Tile): void {
    if (this.isSelectedCell(tile.col, tile.row)) {
      return;
    }
    if (!this.grid) {
      return;
    }
    const neighbors = this.grid.model.getPoolNeighbors(tile.col, tile.row);
    const w = neighbors?.right ? TILE_SIZE : TILE_SIZE - 1;
    const h = neighbors?.bottom ? TILE_SIZE : TILE_SIZE - 1;
    if (this.waitingForDump) {
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
    if (this.isSelectedCell(tile.col, tile.row)) {
      return;
    }
    if (!this.grid) {
      return;
    }
    this.grid.refreshTileVisual(tile.col, tile.row);
  }

  private applyTint(tile: Tile): void {
    const rect = new Rectangle({
      width: TILE_SIZE - 1,
      height: TILE_SIZE - 1,
      color: Color.Yellow,
    });
    tile.graphics.use(rect);
    tile.graphics.opacity = 0.6;
  }

  private clearTint(tile: Tile): void {
    tile.graphics.opacity = 1.0;
    if (this.grid) {
      this.grid.refreshTileVisual(tile.col, tile.row);
    }
  }
}
