import { Scene, Color, Rectangle, PointerEvent, PointerButton } from 'excalibur';
import { Tile } from './tile.ts';
import { GridView } from './grid-view.ts';
import { GRID_WIDTH, GRID_HEIGHT, computeLayout } from '../config.ts';
import type { DiggingStrategy, DiggingStrategyOptions, ScoopResult } from './digging-strategy.ts';

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

const CURSOR_EMPTY = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="20" y1="3" x2="13" y2="11" stroke="#8B4513" stroke-width="3" stroke-linecap="round"/><path d="M13 11 L7 11 L5 18 L10 21 L15 16 Z" fill="white" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 19, auto`;
})();

const CURSOR_FULL = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="20" y1="3" x2="13" y2="11" stroke="#8B4513" stroke-width="3" stroke-linecap="round"/><path d="M13 11 L7 11 L5 18 L10 21 L15 16 Z" fill="#A0522D" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 19, auto`;
})();

export class SingleCellDigging implements DiggingStrategy {
  onScoopComplete: ((result: ScoopResult) => void) | null = null;

  private heldTile: Tile | null = null;
  private hoverListenerTiles: Tile[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private pointerHandler: ((evt: PointerEvent) => void) | null = null;
  private grid: GridView | null = null;
  private delta = 1;

  activate(scene: Scene, grid: GridView, opts: DiggingStrategyOptions): void {
    this.grid = grid;
    this.delta = opts.delta;
    this.canvas = scene.engine.canvas;
    this.canvas.style.cursor = CURSOR_EMPTY;

    this.pointerHandler = (evt: PointerEvent) => {
      const col = Math.floor((evt.worldPos.x - GRID_LEFT) / TILE_SIZE);
      const row = Math.floor((evt.worldPos.y - GRID_TOP) / TILE_SIZE);
      if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_HEIGHT) {
        return;
      }
      const button = evt.button === PointerButton.Right ? 'right' : 'left';
      this.handleClick(col, row, button);
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
    if (this.heldTile && this.grid) {
      this.grid.setElevation(this.heldTile.col, this.heldTile.row, +this.delta);
      this.clearHeldTint(this.heldTile);
      this.heldTile = null;
    }
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
  }

  getStateText(): string {
    if (this.heldTile === null) {
      return 'Click a tile to scoop';
    }
    return 'Click another tile to dump | Right-click to cancel';
  }

  private handleClick(col: number, row: number, button: 'left' | 'right'): void {
    if (!this.grid) {
      return;
    }
    const tile = this.grid.getTile(col, row);
    if (!tile) {
      return;
    }

    if (this.heldTile === null) {
      if (button === 'left' && tile.isCastle) {
        return;
      }
      if (button === 'left' && !tile.isCastle) {
        this.grid.setElevation(col, row, -this.delta);
        this.applyHeldTint(tile);
        this.heldTile = tile;
        if (this.canvas) {
          this.canvas.style.cursor = CURSOR_FULL;
        }
      }
      return;
    }

    const isHeldTile = this.heldTile.col === col && this.heldTile.row === row;
    if (button === 'right' || isHeldTile) {
      this.grid.setElevation(this.heldTile.col, this.heldTile.row, +this.delta);
      this.clearHeldTint(this.heldTile);
      this.heldTile = null;
      if (this.canvas) {
        this.canvas.style.cursor = CURSOR_EMPTY;
      }
      return;
    }

    if (button === 'left' && !tile.isCastle) {
      const dugCol = this.heldTile.col;
      const dugRow = this.heldTile.row;
      this.grid.setElevation(col, row, +this.delta);
      this.clearHeldTint(this.heldTile);
      this.heldTile = null;
      if (this.canvas) {
        this.canvas.style.cursor = CURSOR_EMPTY;
      }
      this.onScoopComplete?.({
        dugCells: [{ col: dugCol, row: dugRow }],
        dumpCell: { col, row },
        totalDelta: this.delta,
      });
    }
  }

  private onTileEnter(tile: Tile): void {
    if (tile === this.heldTile) {
      return;
    }
    if (!this.grid) {
      return;
    }
    const neighbors = this.grid.model.getPoolNeighbors(tile.col, tile.row);
    const w = neighbors?.right ? TILE_SIZE : TILE_SIZE - 1;
    const h = neighbors?.bottom ? TILE_SIZE : TILE_SIZE - 1;
    if (this.heldTile !== null) {
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
    if (tile === this.heldTile) {
      return;
    }
    if (!this.grid) {
      return;
    }
    this.grid.refreshTileVisual(tile.col, tile.row);
  }

  private applyHeldTint(tile: Tile): void {
    const rect = new Rectangle({
      width: TILE_SIZE - 1,
      height: TILE_SIZE - 1,
      color: Color.Yellow,
    });
    tile.graphics.use(rect);
    tile.graphics.opacity = 0.6;
  }

  private clearHeldTint(tile: Tile): void {
    tile.graphics.opacity = 1.0;
    if (this.grid) {
      this.grid.refreshTileVisual(tile.col, tile.row);
    }
  }
}
