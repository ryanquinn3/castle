import { Engine, Scene, Actor, Color, Keys, vec } from 'excalibur';
import { GridModel } from './model/grid-model.ts';
import { CastleActor, placeCastle } from './view/castle-actor.ts';
import { PlanningPhase } from './view/planning-phase.ts';

import { flashErodedTiles } from './view/erosion-flash.ts';
import {
  showTextBanner,
  showGameOver,
  showElevationLabels,
  hideElevationLabels,
} from './view/screen-overlays.ts';
import { WaveEventApplier } from './wave/wave-event-applier.ts';
import { WaveFieldRuntime } from './wave/wave-field-runtime.ts';
import { generateWaveSegmentSpawns } from './wave/wave-spawner.ts';
import type { WaveSegmentGrid } from './wave/wave-segment-types.ts';
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
  TILE_SIZE,
  GRID_LEFT,
  GRID_TOP,
  MAP_TOP,
} from './config.ts';
import type { GameState } from './modes/game-mode.ts';
import { TideMode } from './modes/tide-mode.ts';
import { TideHud } from './view/tide-hud.ts';
import { InventoryModel } from './model/inventory-model.ts';
import { Toolbar } from './view/toolbar.ts';
import { Resources, tiledMap } from './resources.ts';
import { playSound } from './sound.ts';
import { GameplayControls } from './view/gameplay-controls.ts';
import { LevelSessionLifecycle } from './level-session-lifecycle.ts';
import { TideWaveCountdown } from './tide-wave-countdown.ts';
import { SandLayer } from './view/sand-layer.ts';
import { DeleteConfirmation } from './view/delete-confirmation.ts';

export class TideSession extends Scene {
  private grid!: GridModel;
  private sandLayer!: SandLayer;
  private waterRuntime: WaveFieldRuntime | null = null;
  private hud!: TideHud;
  private planning: PlanningPhase | null = null;
  private inventory = new InventoryModel();
  private toolbar = new Toolbar();
  private gameplayControls = new GameplayControls();
  private elevationLabelActors: Actor[] = [];
  private transientActors = new Set<Actor>();
  private lastColumnHeights: number[] = [];
  private lifecycle = new LevelSessionLifecycle();
  private castleActor: CastleActor | null = null;
  private countdown: TideWaveCountdown | null = null;
  private initialized = false;
  private uiActive = false;
  private wavePhaseRunning = false;
  private exitDialogOpen = false;
  private deleteDialogOpen = false;
  private gameOverActive = false;
  private gameMode = new TideMode();
  private state: GameState = {
    level: 1,
    wavesCompleted: 0,
  };
  private highScore = 0;
  private deleteConfirmation = new DeleteConfirmation();


  override onInitialize(_engine: Engine): void {
    tiledMap.addToScene(this);
    for (const layer of tiledMap.getTileLayers()) {
      const tm = layer.tilemap;
      tm.pos = vec(GRID_LEFT, MAP_TOP);
      tm.scale = vec(1, 1);
      tm.z = -1;
    }
    this.sandLayer = new SandLayer(this, GRID_LEFT, MAP_TOP, 1, Resources.BeachTileset);

    this.grid = new GridModel(
      {
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        castleCol: CASTLE_COL,
        castleRow: CASTLE_ROW,
        castleWidth: CASTLE_WIDTH,
        castleHeight: CASTLE_HEIGHT,
      },
      this,
    );
    this.castleActor = placeCastle(this, this.castleActor, CASTLE_COL, CASTLE_ROW);
    this.hud = new TideHud();
    this.initialized = true;
    this.highScore = parseInt(localStorage.getItem('castle-tide-best') ?? '0', 10) || 0;
    this.activateGameplayUi();
    this.startPlanning();
    this.scheduleNextWave();

    _engine.input.keyboard.on('hold', (evt) => {
      if (!this.lifecycle.active) {
        return;
      }
      if (evt.key === Keys.L && this.elevationLabelActors.length === 0) {
        this.elevationLabelActors = showElevationLabels(this, this.grid);
      }
    });
    _engine.input.keyboard.on('release', (evt) => {
      if (!this.lifecycle.active) {
        return;
      }
      if (evt.key === Keys.L) {
        hideElevationLabels(this, this.elevationLabelActors);
        this.elevationLabelActors = [];
      }
    });

    _engine.input.keyboard.on('press', (evt) => {
      if (!this.lifecycle.active) {
        return;
      }
      if (evt.key === Keys.D) {
        const text = this.grid.serialize({ columnHeights: this.lastColumnHeights });
        void navigator.clipboard.writeText(text);
      }
      if (evt.key === Keys.W) {
        this.triggerWaveNow();
      }
    });
  }

  /**
   * Fires the next tide wave immediately, skipping the countdown. No-op while a
   * wave is already running, the game is over, or the exit dialog is open.
   * `runWave` stops the active countdown itself.
   */
  triggerWaveNow(): void {
    if (this.wavePhaseRunning || this.gameOverActive || this.exitDialogOpen || this.deleteDialogOpen) {
      return;
    }
    void this.runWave();
  }

  override onActivate(): void {
    if (!this.initialized) {
      return;
    }
    if (this.lifecycle.consumeResetRequest()) {
      this.resetRunState();
    }
    this.activateGameplayUi();
    if (!this.planning && !this.wavePhaseRunning) {
      this.startPlanning();
      this.scheduleNextWave();
    }
  }

  override onDeactivate(): void {
    this.lifecycle.deactivate();
  }

  private activateGameplayUi(): void {
    this.lifecycle.activate();
    this.lifecycle.addCleanup(this.cleanupGameplay);
    if (this.uiActive) {
      return;
    }
    this.hud.activate(this);
    this.toolbar.activate(this);
    this.gameplayControls.activate(this, {
      onExitConfirmed: () => this.exitToTitle(),
      onExitDialogOpenChange: (open) => this.handleExitDialogOpenChange(open),
    });
    this.hud.updateSand(this.inventory.sand);
    this.hud.updateBest(this.highScore);
    this.uiActive = true;
  }

  private cleanupGameplay = (): void => {
    this.countdown?.stop();
    this.countdown = null;
    this.planning?.deactivate(this);
    this.planning = null;
    this.wavePhaseRunning = false;
    this.waterRuntime?.cleanup();
    this.waterRuntime = null;
    this.gameplayControls.deactivate(this);
    this.toolbar.deactivate(this);
    this.hud?.deactivate(this);
    hideElevationLabels(this, this.elevationLabelActors);
    this.elevationLabelActors = [];
    for (const actor of this.transientActors) {
      this.remove(actor);
    }
    this.transientActors.clear();
    this.uiActive = false;
  };

  private handleExitDialogOpenChange(open: boolean): void {
    this.exitDialogOpen = open;
    if (open) {
      this.countdown?.pause();
      this.planning?.lockDigging();
      this.toolbar.setDisabled(true);
      return;
    }
    this.countdown?.resume();
    if (!this.wavePhaseRunning && !this.gameOverActive && this.planning) {
      this.planning?.unlockDigging();
      this.toolbar.setDisabled(false);
    }
  }

  private handleDeleteDialogOpenChange(open: boolean): void {
    this.deleteDialogOpen = open;
    if (open) {
      this.countdown?.pause();
      this.planning?.lockDigging();
      this.toolbar.setDisabled(true);
      return;
    }
    this.countdown?.resume();
    if (!this.wavePhaseRunning && !this.gameOverActive && this.planning) {
      this.planning?.unlockDigging();
      this.toolbar.setDisabled(false);
    }
  }

  private makeWaveGridAdapter(): WaveSegmentGrid {
    return {
      gridLeft: GRID_LEFT,
      gridTop: GRID_TOP,
      tileSize: TILE_SIZE,
      height: GRID_HEIGHT,
      getElevation: (col: number, row: number) => this.grid.getElevation(col, row),
      effectiveHoleDepth: (col: number, row: number) => this.grid.effectiveHoleDepth(col, row),
      isCastle: (col: number, row: number) => this.grid.isCastle(col, row),
    };
  }

  private exitToTitle(): void {
    this.lifecycle.deactivate({ resetOnNextActivate: true });
    void this.engine.goToScene('title');
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
      this.deleteConfirmation,
      (open) => this.handleDeleteDialogOpenChange(open),
    );
    this.planning.activate(this);
  }

  private scheduleNextWave(): TideWaveCountdown {
    this.countdown?.stop();
    this.countdown = new TideWaveCountdown(
      TIDE_WAVE_INTERVAL_MS,
      (seconds) => this.hud.updateCountdown(seconds),
      () => {
        if (!this.lifecycle.active) {
          return;
        }
        void this.runWave();
      },
    );
    this.countdown.start();
    return this.countdown;
  }

  private async runWave(): Promise<void> {
    const sessionToken = this.lifecycle.currentToken;
    this.wavePhaseRunning = true;
    this.countdown?.stop();
    this.countdown = null;
    const waveParams = this.gameMode.nextWaveParams(this.state);
    const waveNumber = this.state.wavesCompleted + 1;

    const banner = this.trackTransientActor(showTextBanner(
      this,
      `Wave ${waveNumber}`,
      Color.fromRGB(100, 180, 255),
    ));
    playSound(Resources.WaveSound);
    await this.delay(500);
    if (!this.lifecycle.isCurrent(sessionToken)) {
      return;
    }
    this.removeTransientActor(banner);

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
    const spawns = generateWaveSegmentSpawns({
      numCols: GRID_WIDTH,
      tileSize: TILE_SIZE,
      gridLeft: GRID_LEFT,
      gridTop: GRID_TOP,
      peakHeight: waveHeight,
      valleyFraction: WAVE_VALLEY_FRACTION,
      peakPhase,
      numPeaks,
      waveIndex: this.state.wavesCompleted + 1,
    });

    this.lastColumnHeights = spawns.map(spawn => spawn.initialDepth);

    this.planning?.lockDigging();
    this.toolbar.setDisabled(true);

    this.waterRuntime?.cleanup();
    this.waterRuntime = new WaveFieldRuntime(this, this.makeWaveGridAdapter(), TERRAIN_SLOPE, {
      applier: new WaveEventApplier(this.grid, this.sandLayer),
    });
    this.waterRuntime.fieldEvents.on("WaterCellAdded", ({ col, row }) =>
      this.sandLayer.coverCell(col, row),
    );
    const result = await this.waterRuntime.playWave(spawns);
    if (!this.lifecycle.isCurrent(sessionToken)) {
      return;
    }
    this.sandLayer.refresh();

    if (result.erodedTiles.length > 0) {
      await flashErodedTiles(this, result.erodedTiles, (ms) => this.delay(ms));
      if (!this.lifecycle.isCurrent(sessionToken)) {
        return;
      }
    }

    if (result.sandRedistributed) {
      await this.delay(260);
      if (!this.lifecycle.isCurrent(sessionToken)) {
        return;
      }
    }

    const transition = this.gameMode.resolveWave(this.state, {
      castleFlooded: result.castleFlooded,
      allWavesComplete: true,
    });

    if (transition.type === 'gameover') {
      this.wavePhaseRunning = false;
      this.gameOverActive = true;
      this.waterRuntime?.cleanup();
      this.waterRuntime = null;
      this.planning?.deactivate(this);
      this.planning = null;
      if (this.state.wavesCompleted > this.highScore) {
        this.highScore = this.state.wavesCompleted;
        localStorage.setItem('castle-tide-best', String(this.highScore));
      }
      let gameOverActor: Actor;
      gameOverActor = this.trackTransientActor(showGameOver(this, this.state.wavesCompleted, {
        onRestart: () => {
          this.transientActors.delete(gameOverActor);
          if (this.lifecycle.active) {
            this.resetGame();
          }
        },
      }, 'Waves survived'));
      return;
    }

    this.state.wavesCompleted++;
    this.gameOverActive = false;
    this.hud.updateWaves(this.state.wavesCompleted);
    this.hud.updateTideClock(this.state.wavesCompleted);

    this.wavePhaseRunning = false;
    if (this.exitDialogOpen || this.deleteDialogOpen) {
      this.toolbar.setDisabled(true);
      this.planning?.lockDigging();
      const countdown = this.scheduleNextWave();
      countdown.pause();
      return;
    }
    this.toolbar.setDisabled(false);
    this.planning?.unlockDigging();

    this.scheduleNextWave();
  }

  private delay(ms: number): Promise<void> {
    return this.lifecycle.delay(ms);
  }

  private trackTransientActor(actor: Actor): Actor {
    this.transientActors.add(actor);
    return actor;
  }

  private removeTransientActor(actor: Actor): void {
    this.remove(actor);
    this.transientActors.delete(actor);
  }

  private resetGame(): void {
    this.resetRunState();
    this.toolbar.activate(this);
    this.hud.updateSand(this.inventory.sand);
    this.hud.updateWaves(0);
    this.hud.updateBest(this.highScore);
    this.startPlanning();
    this.scheduleNextWave();
  }

  private resetRunState(): void {
    this.countdown?.stop();
    this.countdown = null;
    this.state = {
      level: 1,
      wavesCompleted: 0,
    };
    this.inventory = new InventoryModel();
    this.gameMode = new TideMode();
    this.toolbar.deactivate(this);
    this.toolbar = new Toolbar();
    this.planning = null;
    this.wavePhaseRunning = false;
    this.exitDialogOpen = false;
    this.deleteDialogOpen = false;
    this.gameOverActive = false;
    this.waterRuntime?.cleanup();
    this.waterRuntime = null;
    this.sandLayer.reset();
    this.grid.reset();
    this.castleActor = placeCastle(this, this.castleActor, CASTLE_COL, CASTLE_ROW);
  }
}
