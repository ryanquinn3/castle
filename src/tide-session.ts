import { Engine, Scene, Actor, Color, Keys, vec } from 'excalibur';
import { GridView } from './view/grid-view.ts';
import { GridModel } from './model/grid-model.ts';
import { PlanningPhase } from './view/planning-phase.ts';

import { WaveRenderer } from './view/wave-renderer.ts';
import {
  showTextBanner,
  showGameOver,
  showElevationLabels,
  hideElevationLabels,
} from './view/screen-overlays.ts';
import { simulateWave, generateWaveCurve } from './model/wave-simulation.ts';
import {
  GRID_HEIGHT,
  TERRAIN_SLOPE,
  CASTLE_ROW,
  CASTLE_COL,
  CASTLE_WIDTH,
  CASTLE_HEIGHT,
  GRID_WIDTH,
  WAVE_VALLEY_FRACTION,
  WAVE_PEAK_WEIGHTS,
  TIDE_WAVE_INTERVAL_MS,
  computeLayout,
} from './config.ts';

const LAYOUT = computeLayout(window);
const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, mapTop: MAP_TOP } = LAYOUT;
import type { GameState } from './modes/game-mode.ts';
import { TideMode } from './modes/tide-mode.ts';
import { Tile } from './view/tile.ts';
import { TideHud } from './view/tide-hud.ts';
import { InventoryModel } from './model/inventory-model.ts';
import { Toolbar } from './view/toolbar.ts';
import { Resources, tiledMap } from './resources.ts';
import { playSound } from './sound.ts';

export class TideSession extends Scene {
  private model!: GridModel;
  private grid!: GridView;
  private waveRenderer!: WaveRenderer;
  private hud!: TideHud;
  private planning!: PlanningPhase;
  private inventory = new InventoryModel();
  private toolbar = new Toolbar();
  private elevationLabelActors: Actor[] = [];
  private lastColumnHeights: number[] = [];
  private gameMode = new TideMode();
  private state: GameState = {
    level: 1,
    wavesCompleted: 0,
  };
  private waveTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private secondsUntilWave = 0;
  private highScore = 0;


  override onInitialize(_engine: Engine): void {
    const TILED_TILE_SIZE = 16;
    const tileScale = TILE_SIZE / TILED_TILE_SIZE;
    const mapX = GRID_LEFT;
    const mapY = MAP_TOP;
    tiledMap.addToScene(this);
    for (const layer of tiledMap.getTileLayers()) {
      const tm = layer.tilemap;
      tm.pos = vec(mapX, mapY);
      tm.scale = vec(tileScale, tileScale);
      tm.z = -1;
    }

    this.model = new GridModel({
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      castleCol: CASTLE_COL,
      castleRow: CASTLE_ROW,
      castleWidth: CASTLE_WIDTH,
      castleHeight: CASTLE_HEIGHT,
    });
    this.grid = new GridView(this.model, this);
    this.waveRenderer = new WaveRenderer(this.grid, this);
    this.hud = new TideHud();
    this.hud.activate(this, LAYOUT);
    this.toolbar.activate(this);
    this.hud.updateSand(this.inventory.sand);
    this.highScore = parseInt(localStorage.getItem('castle-tide-best') ?? '0', 10) || 0;
    this.hud.updateBest(this.highScore);
    this.startPlanning();
    this.scheduleNextWave();

    _engine.input.keyboard.on('hold', (evt) => {
      if (evt.key === Keys.L && this.elevationLabelActors.length === 0) {
        this.elevationLabelActors = showElevationLabels(this, this.grid);
      }
    });
    _engine.input.keyboard.on('release', (evt) => {
      if (evt.key === Keys.L) {
        hideElevationLabels(this, this.elevationLabelActors);
        this.elevationLabelActors = [];
      }
    });

    _engine.input.keyboard.on('press', (evt) => {
      if (evt.key === Keys.D) {
        const text = this.model.serialize({ columnHeights: this.lastColumnHeights });
        void navigator.clipboard.writeText(text);
      }
    });
  }

  override onDeactivate(): void {
    this.clearTimers();
  }

  private startPlanning(): void {
    const waveParams = this.gameMode.nextWaveParams(this.state);
    this.planning = new PlanningPhase(
      this.grid,
      this.hud,
      Infinity,
      GRID_HEIGHT,
      waveParams.peakHeight,
      1,
      this.inventory,
      this.toolbar,
      () => {},
    );
    this.planning.activate(this);
  }

  private scheduleNextWave(): void {
    this.clearTimers();
    this.secondsUntilWave = Math.round(TIDE_WAVE_INTERVAL_MS / 1000);
    this.hud.updateCountdown(this.secondsUntilWave);

    this.countdownTimer = setInterval(() => {
      this.secondsUntilWave--;
      if (this.secondsUntilWave >= 0) {
        this.hud.updateCountdown(this.secondsUntilWave);
      }
    }, 1000);

    this.waveTimer = setTimeout(() => {
      void this.runWave();
    }, TIDE_WAVE_INTERVAL_MS);
  }

  private clearTimers(): void {
    if (this.waveTimer !== null) {
      clearTimeout(this.waveTimer);
      this.waveTimer = null;
    }
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private async runWave(): Promise<void> {
    const waveParams = this.gameMode.nextWaveParams(this.state);
    const waveNumber = this.state.wavesCompleted + 1;

    const banner = showTextBanner(
      this,
      `Wave ${waveNumber}`,
      Color.fromRGB(100, 180, 255),
    );
    playSound(Resources.WaveSound);
    await this.delay(500);
    this.remove(banner);

    const waveHeight = waveParams.peakHeight;
    const peakPhase = (Math.random() - 0.5) * 0.4;
    const totalWeight = WAVE_PEAK_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let numPeaks = 1;
    for (let i = 0; i < WAVE_PEAK_WEIGHTS.length; i++) {
      r -= WAVE_PEAK_WEIGHTS[i];
      if (r <= 0) {
        numPeaks = i + 1;
        break;
      }
    }
    const columnHeights = generateWaveCurve(
      GRID_WIDTH,
      waveHeight,
      WAVE_VALLEY_FRACTION,
      peakPhase,
      numPeaks,
    );

    this.lastColumnHeights = columnHeights;

    this.planning.lockDigging();
    this.toolbar.setDisabled(true);

    const result = simulateWave({
      cells: this.grid.model.getCells(),
      columnHeights,
      castleCol: CASTLE_COL,
      castleRow: CASTLE_ROW,
      castleWidth: CASTLE_WIDTH,
      castleHeight: CASTLE_HEIGHT,
      maxRows: GRID_HEIGHT,
      terrainSlope: TERRAIN_SLOPE,
      poolMap: this.grid.model.getPoolMap(),
    });

    await this.waveRenderer.playWave(result);

    const erodedTiles = this.grid.applyErosion(
      result.advanceHeightMap,
      result.recedeHeightMap,
    );
    if (erodedTiles.length > 0) {
      await this.waveRenderer.flashErodedTiles(erodedTiles);
    }

    const puddleDeltas: { col: number; row: number; depth: number }[] = [];
    for (let ri = 0; ri < result.puddleDelta.length; ri++) {
      for (let ci = 0; ci < result.puddleDelta[ri].length; ci++) {
        if (result.puddleDelta[ri][ci] > 0) {
          puddleDeltas.push({
            col: ci,
            row: ri,
            depth: result.puddleDelta[ri][ci],
          });
        }
      }
    }
    this.grid.applyPuddleDeltas(puddleDeltas);
    this.grid.applySandRedistribution(result.wallErosionEvents);
    await this.waveRenderer.flashSandRedistribution(result.wallErosionEvents);

    const transition = this.gameMode.resolveWave(this.state, {
      castleFlooded: result.castleFlooded,
      allWavesComplete: true,
    });

    if (transition.type === 'gameover') {
      this.waveRenderer.cleanup();
      this.clearTimers();
      this.planning.deactivate(this);
      if (this.state.wavesCompleted > this.highScore) {
        this.highScore = this.state.wavesCompleted;
        localStorage.setItem('castle-tide-best', String(this.highScore));
      }
      showGameOver(this, this.state.wavesCompleted, {
        onRestart: () => this.resetGame(),
      }, 'Waves survived');
      return;
    }

    this.state.wavesCompleted++;
    this.hud.updateWaves(this.state.wavesCompleted);
    this.hud.updateTideClock(this.state.wavesCompleted);

    this.waveRenderer.cleanup();
    this.toolbar.setDisabled(false);
    this.planning.unlockDigging();

    this.scheduleNextWave();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private resetGame(): void {
    this.clearTimers();
    this.state = {
      level: 1,
      wavesCompleted: 0,
    };
    this.inventory = new InventoryModel();
    this.toolbar.deactivate(this);
    this.toolbar = new Toolbar();
    this.toolbar.activate(this);
    this.hud.updateSand(this.inventory.sand);

    this.hud.updateWaves(0);
    this.hud.updateBest(this.highScore);
    this.waveRenderer.cleanup();
    const tilesToRemove = this.entities.filter(
      (e) => e instanceof Tile,
    ) as Tile[];
    for (const tile of tilesToRemove) {
      this.remove(tile);
    }
    this.model = new GridModel({
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      castleCol: CASTLE_COL,
      castleRow: CASTLE_ROW,
      castleWidth: CASTLE_WIDTH,
      castleHeight: CASTLE_HEIGHT,
    });
    this.grid = new GridView(this.model, this);
    this.waveRenderer = new WaveRenderer(this.grid, this);
    this.startPlanning();
    this.scheduleNextWave();
  }
}
