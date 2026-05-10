import { Scene, Actor, Color, Rectangle, Text, Font, PointerEvent, PointerButton } from 'excalibur';
import { Tile, elevationToColor } from './tile';
import { TileGrid } from './grid';
import { TILE_SIZE, GRID_WIDTH, GRID_HEIGHT } from './config';

const GRID_LEFT = (800 - GRID_WIDTH * TILE_SIZE) / 2;
const GRID_TOP = (600 - GRID_HEIGHT * TILE_SIZE) / 2;

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
  private hudBgActor: Actor | null = null;
  private hudActor: Actor | null = null;
  private sendWaveActor: Actor | null = null;
  private sendWaveInnerActor: Actor | null = null;
  private hudText: Text | null = null;
  private stateBgActor: Actor | null = null;
  private stateActor: Actor | null = null;
  private stateText: Text | null = null;
  private waveHudBgActor: Actor | null = null;
  private waveHudActor: Actor | null = null;
  private reachLineActor: Actor | null = null;
  private reachLabelActor: Actor | null = null;
  private pointerHandler: ((evt: PointerEvent) => void) | null = null;
  private active = false;
  private completed = false;

  constructor(
    private grid: TileGrid,
    scoops: number,
    private waveReach: number,
    private waveHeight: number,
    private numWaves: number,
    private onComplete: () => void
  ) {
    this.scoopsRemaining = scoops;
  }

  activate(scene: Scene): void {
    this.active = true;
    this.completed = false;
    this.canvas = scene.engine.canvas;
    this.canvas.style.cursor = PlanningPhase.CURSOR_EMPTY;
    // Dark semi-transparent background panel behind scoop counter HUD
    this.hudBgActor = new Actor({ x: 80, y: 15, z: 10 });
    this.hudBgActor.graphics.use(new Rectangle({
      width: 140,
      height: 28,
      color: Color.fromRGB(0, 0, 0, 0.55),
    }));
    scene.add(this.hudBgActor);

    // HUD label actor at top-left
    this.hudText = new Text({
      text: `Scoops: ${this.scoopsRemaining}`,
      color: Color.White,
      font: new Font({ size: 16 }),
    });
    this.hudActor = new Actor({ x: 80, y: 15, z: 11 });
    this.hudActor.graphics.use(this.hudText);
    scene.add(this.hudActor);

    // Wave strength HUD row
    this.waveHudBgActor = new Actor({ x: 80, y: 57, z: 10 });
    this.waveHudBgActor.graphics.use(new Rectangle({
      width: 140,
      height: 20,
      color: Color.fromRGB(0, 0, 0, 0.55),
    }));
    scene.add(this.waveHudBgActor);

    const waveHudText = new Text({
      text: `Wave: ${Math.round(this.waveHeight)}  \u00d7${this.numWaves}`,
      color: Color.fromRGB(255, 200, 80),
      font: new Font({ size: 14 }),
    });
    this.waveHudActor = new Actor({ x: 80, y: 57, z: 11 });
    this.waveHudActor.graphics.use(waveHudText);
    scene.add(this.waveHudActor);

    // "Send Wave" button actor at bottom-center — outer darker border rectangle
    const btnBorder = new Rectangle({
      width: 120,
      height: 28,
      color: Color.fromRGB(40, 100, 40),
    });
    this.sendWaveActor = new Actor({ x: 400, y: 585 });
    this.sendWaveActor.graphics.use(btnBorder);

    // Inner brighter fill rectangle as child actor
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
      if (this.completed) return;
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

    // State label background panel
    this.stateBgActor = new Actor({ x: 80, y: 38, z: 10 });
    this.stateBgActor.graphics.use(new Rectangle({
      width: 220,
      height: 22,
      color: Color.fromRGB(0, 0, 0, 0.55),
    }));
    scene.add(this.stateBgActor);

    // State label text actor
    this.stateText = new Text({
      text: '',
      color: Color.fromRGB(180, 180, 180),
      font: new Font({ size: 12 }),
    });
    this.stateActor = new Actor({ x: 80, y: 38, z: 11 });
    this.stateActor.graphics.use(this.stateText);
    scene.add(this.stateActor);

    this.updateStateHUD();

    // Wave reach indicator line
    if (this.waveReach < GRID_HEIGHT) {
      const lineY = GRID_TOP + this.waveReach * TILE_SIZE;
      const lineX = GRID_LEFT + (GRID_WIDTH * TILE_SIZE) / 2; // center of grid

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
        if (!tile || tile.isCastle) continue;
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
    if (this.hudBgActor) {
      scene.remove(this.hudBgActor);
      this.hudBgActor = null;
    }
    if (this.hudActor) {
      scene.remove(this.hudActor);
      this.hudActor = null;
    }
    if (this.sendWaveActor) {
      scene.remove(this.sendWaveActor);
      this.sendWaveActor = null;
      this.sendWaveInnerActor = null;
    }
    if (this.stateBgActor) {
      scene.remove(this.stateBgActor);
      this.stateBgActor = null;
    }
    if (this.stateActor) {
      scene.remove(this.stateActor);
      this.stateActor = null;
    }
    this.stateText = null;
    if (this.waveHudBgActor) {
      scene.remove(this.waveHudBgActor);
      this.waveHudBgActor = null;
    }
    if (this.waveHudActor) {
      scene.remove(this.waveHudActor);
      this.waveHudActor = null;
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
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async handleClick(col: number, row: number, button: 'left' | 'right'): Promise<void> {
    if (!this.active) return;
    const tile = this.grid.getTile(col, row);
    if (!tile) return;

    if (this.heldTile === null) {
      // State A: pick up a non-castle tile
      if (button === 'left' && tile.isCastle) {
        // Brief message to communicate the castle is protected
        if (this.stateText && this.stateActor) {
          this.stateText.text = "The castle can't be moved!";
          this.stateActor.graphics.use(this.stateText);
          setTimeout(() => this.updateStateHUD(), 1000);
        }
        return;
      }
      if (button === 'left' && !tile.isCastle) {
        this.grid.setElevation(col, row, -1);
        this.applyHeldTint(tile);
        this.heldTile = tile;
        if (this.canvas) this.canvas.style.cursor = PlanningPhase.CURSOR_FULL;
        this.updateStateHUD();
      }
    } else {
      // State B: holding a tile
      const isHeldTile = this.heldTile.col === col && this.heldTile.row === row;
      if (button === 'right' || isHeldTile) {
        // Cancel: restore elevation and tint
        this.grid.setElevation(this.heldTile.col, this.heldTile.row, +1);
        this.clearHeldTint(this.heldTile);
        this.heldTile = null;
        if (this.canvas) this.canvas.style.cursor = PlanningPhase.CURSOR_EMPTY;
        this.updateStateHUD();
      } else if (button === 'left' && !tile.isCastle) {
        // Dump onto a different non-castle tile
        this.grid.setElevation(col, row, +1);
        this.clearHeldTint(this.heldTile);
        this.heldTile = null;
        if (this.canvas) this.canvas.style.cursor = PlanningPhase.CURSOR_EMPTY;
        this.scoopsRemaining--;
        this.updateHUD();
        this.updateStateHUD();
        if (this.scoopsRemaining === 0) {
          if (!this.completed) {
            this.completed = true;
            this.active = false;
            // Brief visual cue before wave launches
            if (this.hudText && this.hudActor) {
              this.hudText.text = 'Scoops: 0 — sending wave…';
              this.hudActor.graphics.use(this.hudText);
            }
            await this.delay(600);
            this.onComplete();
          }
        }
      }
    }
  }

  private onTileEnter(tile: Tile): void {
    if (tile === this.heldTile) return;
    if (this.heldTile !== null) {
      tile.graphics.use(new Rectangle({
        width: TILE_SIZE - 1,
        height: TILE_SIZE - 1,
        color: Color.fromRGB(100, 200, 100, 0.4),
      }));
    } else {
      this.applyHoverTint(tile);
    }
  }

  private onTileLeave(tile: Tile): void {
    if (tile === this.heldTile) return;
    tile.updateVisual();
  }

  private applyHoverTint(tile: Tile): void {
    const base = elevationToColor(tile.elevation, tile.isCastle);
    const bright = Color.fromRGB(
      Math.min(255, base.r + 38),
      Math.min(255, base.g + 38),
      Math.min(255, base.b + 38),
    );
    tile.graphics.use(new Rectangle({ width: TILE_SIZE - 1, height: TILE_SIZE - 1, color: bright }));
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
    tile.updateVisual();
  }

  private updateStateHUD(): void {
    if (this.stateText && this.stateActor) {
      this.stateText.text = this.heldTile === null
        ? 'Click a tile to scoop'
        : 'Click another tile to dump | Right-click to cancel';
      this.stateActor.graphics.use(this.stateText);
    }
  }

  private updateHUD(): void {
    if (this.hudText && this.hudActor) {
      this.hudText.text = `Scoops: ${this.scoopsRemaining}`;
      this.hudActor.graphics.use(this.hudText);
    }
  }
}
