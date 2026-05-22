import { Scene, Actor, Color, Rectangle, Text, Font, PointerEvent, PointerButton } from 'excalibur';
import { Tile } from './tile.ts';
import { GridView } from './grid-view.ts';
import { GRID_WIDTH, GRID_HEIGHT, ENHANCED_SHOVEL_DELTA, computeLayout } from '../config.ts';

const { tileSize: TILE_SIZE, canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

export interface PlanningHud {
  showPlanning(scene: Scene, scoopText: string, waveText: string): void;
  hidePlanning(scene: Scene): void;
  updateScoops(text: string): void;
  updateState(text: string): void;
}

export class PlanningPhase {
  private static readonly CURSOR_EMPTY = (() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="20" y1="3" x2="13" y2="11" stroke="#8B4513" stroke-width="3" stroke-linecap="round"/><path d="M13 11 L7 11 L5 18 L10 21 L15 16 Z" fill="white" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 19, auto`;
  })();

  private static readonly CURSOR_FULL = (() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="20" y1="3" x2="13" y2="11" stroke="#8B4513" stroke-width="3" stroke-linecap="round"/><path d="M13 11 L7 11 L5 18 L10 21 L15 16 Z" fill="#A0522D" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 19, auto`;
  })();

  private scoopsRemaining: number;
  private heldTile: Tile | null = null;
  private hoverListenerTiles: Tile[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private sendWaveActor: Actor | null = null;
  private sendWaveInnerActor: Actor | null = null;
  private reachLineActor: Actor | null = null;
  private reachLabelActor: Actor | null = null;
  private pointerHandler: ((evt: PointerEvent) => void) | null = null;
  private active = false;
  private completed = false;

  constructor(
    private grid: GridView,
    private hud: PlanningHud,
    scoops: number,
    private waveReach: number,
    private waveHeight: number,
    private numWaves: number,
    private hasEnhancedShovel: boolean,
    private onComplete: () => void
  ) {
    this.scoopsRemaining = scoops;
  }

  activate(scene: Scene): void {
    this.active = true;
    this.completed = false;
    this.canvas = scene.engine.canvas;
    this.canvas.style.cursor = PlanningPhase.CURSOR_EMPTY;

    this.hud.showPlanning(
      scene,
      this.scoopHudText(),
      `Wave: ${Math.round(this.waveHeight)}  ×${this.numWaves}`,
    );
    this.updateStateHUD();

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

    // Register pointer down handler
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
        const tile = this.grid.getTile(col, row);
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
    this.active = false;
    if (this.canvas) {
      this.canvas.style.cursor = '';
      this.canvas = null;
    }
    for (const tile of this.hoverListenerTiles) {
      tile.off('pointerenter');
      tile.off('pointerleave');
    }
    this.hoverListenerTiles = [];
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
    if (this.pointerHandler) {
      scene.input.pointers.primary.off('down', this.pointerHandler);
      this.pointerHandler = null;
    }
    this.hud.hidePlanning(scene);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async handleClick(col: number, row: number, button: 'left' | 'right'): Promise<void> {
    if (!this.active) {
      return;
    }
    const tile = this.grid.getTile(col, row);
    if (!tile) {
      return;
    }

    if (this.heldTile === null) {
      if (button === 'left' && tile.isCastle) {
        this.hud.updateState("The castle can't be moved!");
        setTimeout(() => this.updateStateHUD(), 1000);
        return;
      }
      if (button === 'left' && !tile.isCastle) {
        const delta = this.hasEnhancedShovel ? ENHANCED_SHOVEL_DELTA : 1;
        this.grid.setElevation(col, row, -delta);
        this.applyHeldTint(tile);
        this.heldTile = tile;
        if (this.canvas) {
          this.canvas.style.cursor = PlanningPhase.CURSOR_FULL;
        }
        this.updateStateHUD();
      }
    } else {
      const isHeldTile = this.heldTile.col === col && this.heldTile.row === row;
      if (button === 'right' || isHeldTile) {
        const delta = this.hasEnhancedShovel ? ENHANCED_SHOVEL_DELTA : 1;
        this.grid.setElevation(this.heldTile.col, this.heldTile.row, +delta);
        this.clearHeldTint(this.heldTile);
        this.heldTile = null;
        if (this.canvas) {
          this.canvas.style.cursor = PlanningPhase.CURSOR_EMPTY;
        }
        this.updateStateHUD();
      } else if (button === 'left' && !tile.isCastle) {
        const delta = this.hasEnhancedShovel ? ENHANCED_SHOVEL_DELTA : 1;
        this.grid.setElevation(col, row, +delta);
        this.clearHeldTint(this.heldTile);
        this.heldTile = null;
        if (this.canvas) {
          this.canvas.style.cursor = PlanningPhase.CURSOR_EMPTY;
        }
        if (Number.isFinite(this.scoopsRemaining)) {
          this.scoopsRemaining--;
          this.hud.updateScoops(this.scoopHudText());
          this.updateStateHUD();
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
    }
  }

  private onTileEnter(tile: Tile): void {
    if (tile === this.heldTile) {
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
    this.grid.refreshTileVisual(tile.col, tile.row);
  }

  private updateStateHUD(): void {
    const text = this.heldTile === null
      ? 'Click a tile to scoop'
      : 'Click another tile to dump | Right-click to cancel';
    this.hud.updateState(text);
  }

  private scoopHudText(): string {
    if (!Number.isFinite(this.scoopsRemaining)) {
      return this.hasEnhancedShovel ? 'Shovel: Enhanced' : '';
    }
    const base = `Scoops: ${this.scoopsRemaining}`;
    return this.hasEnhancedShovel ? `${base} | Shovel: Enhanced` : base;
  }
}
