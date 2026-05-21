import { Engine, Scene, Actor, Color, Keys, vec } from 'excalibur';
import { GridView } from './view/grid-view';
import { GridModel } from './model/grid-model';
import { PlanningPhase } from './view/planning-phase';
import { WaveRenderer } from './view/wave-renderer';
import {
  showTextBanner,
  showGameOver,
  showElevationLabels,
  hideElevationLabels,
} from './view/screen-overlays';
import { simulateWave, generateWaveCurve } from './model/wave-simulation';
import {
  GRID_HEIGHT,
  TILE_SIZE,
  TERRAIN_SLOPE,
  CASTLE_ROW,
  CASTLE_COL,
  GRID_WIDTH,
  GRID_TOP,
  GRID_LEFT,
  WAVE_VALLEY_FRACTION,
  WAVE_PEAK_WEIGHTS,
  TIDE_WAVE_INTERVAL_MS,
} from './config';
import type { GameState } from './modes/game-mode';
import { TideMode } from './modes/tide-mode';
import { Tile } from './view/tile';
import { TideHud } from './view/tide-hud';
import { tiledMap } from './resources';

export class TideSession extends Scene {
  private model!: GridModel;
  private grid!: GridView;
  private waveRenderer!: WaveRenderer;
  private hud!: TideHud;
  private planning!: PlanningPhase;
  private elevationLabelActors: Actor[] = [];
  private gameMode = new TideMode();
  private state: GameState = {
    level: 1,
    wavesCompleted: 0,
    consecutiveCleanWaves: 0,
    hasEnhancedShovel: false,
  };
  private waveTimer: ReturnType<typeof setInterval> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private secondsUntilWave = 0;
  private waveInProgress = false;

  override onInitialize(_engine: Engine): void {
    const TILED_TILE_SIZE = 16;
    const tileScale = TILE_SIZE / TILED_TILE_SIZE;
    const TILEMAP_OCEAN_ROWS = 6;
    const mapX = GRID_LEFT;
    const mapY = GRID_TOP - TILEMAP_OCEAN_ROWS * TILE_SIZE;
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
    });
    this.grid = new GridView(this.model, this);
    this.waveRenderer = new WaveRenderer(this.grid, this);
    this.hud = new TideHud();
    this.hud.activate(this);
    this.startPlanning();
    this.startWaveTimer();

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
        const text = this.model.serialize();
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
      this.state.hasEnhancedShovel,
      () => {},
    );
    this.planning.activate(this);
  }

  private startWaveTimer(): void {
    this.secondsUntilWave = Math.round(TIDE_WAVE_INTERVAL_MS / 1000);
    this.hud.updateCountdown(this.secondsUntilWave);

    this.countdownTimer = setInterval(() => {
      this.secondsUntilWave--;
      if (this.secondsUntilWave >= 0) {
        this.hud.updateCountdown(this.secondsUntilWave);
      }
    }, 1000);

    this.waveTimer = setInterval(() => {
      if (this.waveInProgress) {
        return;
      }
      this.secondsUntilWave = Math.round(TIDE_WAVE_INTERVAL_MS / 1000);
      this.hud.updateCountdown(this.secondsUntilWave);
      void this.runWave();
    }, TIDE_WAVE_INTERVAL_MS);
  }

  private clearTimers(): void {
    if (this.waveTimer !== null) {
      clearInterval(this.waveTimer);
      this.waveTimer = null;
    }
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private async runWave(): Promise<void> {
    this.waveInProgress = true;
    const waveParams = this.gameMode.nextWaveParams(this.state);
    const waveNumber = this.state.wavesCompleted + 1;

    const banner = showTextBanner(
      this,
      `Wave ${waveNumber}`,
      Color.fromRGB(100, 180, 255),
    );
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

    const elevations = this.grid.model.getElevations();
    const puddleDepths: number[][] = elevations.map((row, rowIdx) =>
      row.map((_, colIdx) => this.grid.model.getPuddleDepth(colIdx, rowIdx)),
    );

    const result = simulateWave({
      elevations,
      puddleDepths,
      columnHeights,
      castleCol: CASTLE_COL,
      castleRow: CASTLE_ROW,
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
      showGameOver(this, this.state.wavesCompleted, {
        onRestart: () => this.resetGame(),
      }, 'Waves survived');
      this.waveInProgress = false;
      return;
    }

    this.state.wavesCompleted++;
    this.hud.updateWaves(this.state.wavesCompleted);
    this.hud.updateTideClock(this.state.wavesCompleted);

    await this.checkCleanWave(result.advanceHeightMap);

    this.waveRenderer.cleanup();
    this.waveInProgress = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private resetGame(): void {
    this.clearTimers();
    this.state = {
      level: 1,
      wavesCompleted: 0,
      consecutiveCleanWaves: 0,
      hasEnhancedShovel: false,
    };
    this.waveInProgress = false;
    this.hud.updateWaves(0);
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
    });
    this.grid = new GridView(this.model, this);
    this.waveRenderer = new WaveRenderer(this.grid, this);
    this.startPlanning();
    this.startWaveTimer();
  }

  private async checkCleanWave(waveHeightMap: number[][]): Promise<void> {
    let isClean = true;
    for (let ri = CASTLE_ROW - 1; ri <= CASTLE_ROW + 1; ri++) {
      for (let ci = CASTLE_COL - 1; ci <= CASTLE_COL + 1; ci++) {
        if (ri === CASTLE_ROW && ci === CASTLE_COL) {
          continue;
        }
        if (ri < 0 || ri >= GRID_HEIGHT || ci < 0 || ci >= GRID_WIDTH) {
          continue;
        }
        if (waveHeightMap[ri][ci] > 0) {
          isClean = false;
        }
      }
    }

    const shouldReward = this.gameMode.checkCleanWaveReward(this.state, isClean);

    if (isClean) {
      this.state.consecutiveCleanWaves++;
    } else {
      this.state.consecutiveCleanWaves = 0;
    }

    if (shouldReward) {
      this.state.hasEnhancedShovel = true;
      const rewardBanner = showTextBanner(
        this,
        'Enhanced shovel earned!',
        Color.fromRGB(255, 220, 50),
      );
      await this.delay(1500);
      this.remove(rewardBanner);
    }
  }
}
