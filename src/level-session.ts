import { Engine, Scene, Actor, Keys, vec } from "excalibur";
import { GridModel } from "./model/grid-model.ts";
import { CastleActor, placeCastle } from "./view/castle-actor.ts";
import { PlanningPhase } from "./view/planning-phase.ts";
import {
  showWaveBanner,
  showLevelCompleteBanner,
  showGameOver,
  showElevationLabels,
  hideElevationLabels,
} from "./view/screen-overlays.ts";
import { WaveFieldRuntime } from "./wave/wave-field-runtime.ts";
import { WaveEventApplier } from "./wave/wave-event-applier.ts";
import { flashErodedTiles } from "./view/erosion-flash.ts";
import { generateWaveSegmentSpawns } from "./wave/wave-spawner.ts";
import type { WaveSegmentGrid } from "./wave/wave-segment-types.ts";
import {
  GRID_HEIGHT,
  TERRAIN_SLOPE,
  WAVE_HEIGHT_PER_WAVE_INC,
  CASTLE_ROW,
  CASTLE_COL,
  CASTLE_WIDTH,
  CASTLE_HEIGHT,
  GRID_WIDTH,
  WAVE_VALLEY_FRACTION,
  WAVE_PEAK_WEIGHTS,
  TILE_SIZE,
  GRID_LEFT,
  GRID_TOP,
  MAP_TOP,
  TILE_SCALE,
} from "./config.ts";
import type { GameMode, GameState } from "./modes/game-mode.ts";
import { LevelMode } from "./modes/level-mode.ts";
import { Hud } from "./view/hud.ts";
import { InventoryModel } from "./model/inventory-model.ts";
import { Toolbar } from "./view/toolbar.ts";
import { Resources, tiledMap } from "./resources.ts";
import { playSound } from "./sound.ts";
import { GameplayControls } from "./view/gameplay-controls.ts";
import { LevelSessionLifecycle } from "./level-session-lifecycle.ts";
import { SandLayer } from "./view/sand-layer.ts";
import { DeleteConfirmation } from "./view/delete-confirmation.ts";

export class LevelSession extends Scene {
  private grid!: GridModel;
  private sandLayer!: SandLayer;
  private waterRuntime: WaveFieldRuntime | null = null;
  private hud!: Hud;
  private inventory = new InventoryModel();
  private toolbar = new Toolbar();
  private gameplayControls = new GameplayControls();
  private activePlanning: PlanningPhase | null = null;
  private elevationLabelActors: Actor[] = [];
  private transientActors = new Set<Actor>();
  private lifecycle = new LevelSessionLifecycle();
  private castleActor: CastleActor | null = null;
  private initialized = false;
  private uiActive = false;
  private wavePhaseRunning = false;
  private gameMode: GameMode = new LevelMode();
  private state: GameState = {
    level: 1,
    wavesCompleted: 0,
  };
  private deleteConfirmation = new DeleteConfirmation();

  override onInitialize(_engine: Engine): void {
    tiledMap.addToScene(this);
    for (const layer of tiledMap.getTileLayers()) {
      const tm = layer.tilemap;
      tm.pos = vec(GRID_LEFT, MAP_TOP);
      tm.scale = vec(TILE_SCALE, TILE_SCALE);
      tm.z = -1;
    }
    this.sandLayer = new SandLayer(
      this,
      GRID_LEFT,
      MAP_TOP,
      TILE_SCALE,
      Resources.BeachTileset,
    );

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
    this.castleActor = placeCastle(
      this,
      this.castleActor,
      CASTLE_COL,
      CASTLE_ROW,
    );
    this.hud = new Hud();
    this.initialized = true;
    this.activateGameplayUi();
    this.startPlanningPhase();

    _engine.input.keyboard.on("hold", (evt) => {
      if (!this.lifecycle.active) {
        return;
      }
      if (evt.key === Keys.L && this.elevationLabelActors.length === 0) {
        this.elevationLabelActors = showElevationLabels(this, this.grid);
      }
    });
    _engine.input.keyboard.on("release", (evt) => {
      if (!this.lifecycle.active) {
        return;
      }
      if (evt.key === Keys.L) {
        hideElevationLabels(this, this.elevationLabelActors);
        this.elevationLabelActors = [];
      }
    });

    _engine.input.keyboard.on("press", (evt) => {
      if (!this.lifecycle.active) {
        return;
      }
      if (evt.key === Keys.D) {
        const text = this.grid.serialize();
        void navigator.clipboard.writeText(text);
      }
    });
  }

  override onActivate(): void {
    if (!this.initialized) {
      return;
    }
    if (this.lifecycle.consumeResetRequest()) {
      this.resetRunState();
    }
    this.activateGameplayUi();
    if (!this.activePlanning && !this.wavePhaseRunning) {
      this.startPlanningPhase();
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
    this.hud.activate(this, this.state.level);
    this.toolbar.activate(this);
    this.gameplayControls.activate(this, {
      onExitConfirmed: () => this.exitToTitle(),
      onExitDialogOpenChange: (open) => this.handleExitDialogOpenChange(open),
    });
    this.hud.updateSand(this.inventory.sand);
    this.uiActive = true;
  }

  private cleanupGameplay = (): void => {
    this.activePlanning?.deactivate(this);
    this.activePlanning = null;
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
    if (open) {
      this.activePlanning?.lockDigging();
      return;
    }
    this.activePlanning?.unlockDigging();
  }

  private handleDeleteDialogOpenChange(open: boolean): void {
    if (open) {
      this.activePlanning?.lockDigging();
      this.toolbar.setDisabled(true);
      return;
    }
    if (!this.wavePhaseRunning) {
      this.activePlanning?.unlockDigging();
      this.toolbar.setDisabled(false);
    }
  }

  private makeWaveGridAdapter(): WaveSegmentGrid {
    return {
      gridLeft: GRID_LEFT,
      gridTop: GRID_TOP,
      tileSize: TILE_SIZE,
      height: GRID_HEIGHT,
      getElevation: (col: number, row: number) =>
        this.grid.getElevation(col, row),
      effectiveHoleDepth: (col: number, row: number) =>
        this.grid.effectiveHoleDepth(col, row),
      isCastle: (col: number, row: number) => this.grid.isCastle(col, row),
    };
  }

  private exitToTitle(): void {
    this.lifecycle.deactivate({ resetOnNextActivate: true });
    void this.engine.goToScene("title");
  }

  private startPlanningPhase(): void {
    const waveParams = this.gameMode.nextWaveParams(this.state);
    const scoops = this.gameMode.scoopBudget(this.state);
    const maxWaveHeight =
      waveParams.peakHeight +
      (waveParams.waveCount - 1) * WAVE_HEIGHT_PER_WAVE_INC;
    const naturalReach = Math.min(
      Math.round(maxWaveHeight / TERRAIN_SLOPE),
      GRID_HEIGHT,
    );
    const phase = new PlanningPhase(
      this.grid,
      this.hud,
      scoops,
      naturalReach,
      waveParams.peakHeight,
      waveParams.waveCount,
      this.inventory,
      this.toolbar,
      () => {
        if (!this.lifecycle.active || this.activePlanning !== phase) {
          return;
        }
        phase.deactivate(this);
        this.activePlanning = null;
        void this.runWavePhase();
      },
      this.deleteConfirmation,
      (open) => this.handleDeleteDialogOpenChange(open),
    );
    this.activePlanning = phase;
    phase.activate(this);
  }

  private async runWavePhase(): Promise<void> {
    const sessionToken = this.lifecycle.currentToken;
    this.wavePhaseRunning = true;
    const waveParams = this.gameMode.nextWaveParams(this.state);
    const totalWaves = waveParams.waveCount;
    const baseHeight = waveParams.peakHeight;

    for (let k = 1; k <= totalWaves; k++) {
      if (!this.lifecycle.isCurrent(sessionToken)) {
        return;
      }
      const banner = this.trackTransientActor(
        showWaveBanner(this, k, totalWaves),
      );
      playSound(Resources.WaveSound);
      await this.delay(500);
      if (!this.lifecycle.isCurrent(sessionToken)) {
        return;
      }
      this.removeTransientActor(banner);

      // Animate and simulate wave k
      const waveHeight = baseHeight + (k - 1) * WAVE_HEIGHT_PER_WAVE_INC;

      // Generate wave curve
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
        waveIndex: this.state.level * 100 + k,
      });

      this.waterRuntime?.cleanup();
      this.waterRuntime = new WaveFieldRuntime(
        this,
        this.makeWaveGridAdapter(),
        TERRAIN_SLOPE,
        {
          applier: new WaveEventApplier(this.grid, this.sandLayer),
        },
      );
      this.waterRuntime.fieldEvents.on("WaterCellAdded", ({ col, row }) =>
        this.sandLayer.coverCell(col, row),
      );
      const result = await this.waterRuntime.playWave(spawns);
      if (!this.lifecycle.isCurrent(sessionToken)) {
        return;
      }
      this.sandLayer.refresh();

      if (result.erodedTiles.length > 0) {
        await flashErodedTiles(this, result.erodedTiles, (ms) =>
          this.delay(ms),
        );
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

      // Use gameMode to resolve wave outcome
      const transition = this.gameMode.resolveWave(this.state, {
        castleFlooded: result.castleFlooded,
        allWavesComplete: k === totalWaves,
      });

      if (transition.type === "gameover") {
        this.wavePhaseRunning = false;
        this.waterRuntime?.cleanup();
        this.waterRuntime = null;
        let gameOverActor: Actor;
        gameOverActor = this.trackTransientActor(
          showGameOver(this, this.state.level, {
            onRestart: () => {
              this.transientActors.delete(gameOverActor);
              if (this.lifecycle.active) {
                this.resetGame();
              }
            },
          }),
        );
        return;
      }

      if (k < totalWaves) {
        await this.delay(600);
        if (!this.lifecycle.isCurrent(sessionToken)) {
          return;
        }
      }
    }

    const levelComplete = this.trackTransientActor(
      showLevelCompleteBanner(this, this.state.level),
    );
    await this.delay(1500);
    if (!this.lifecycle.isCurrent(sessionToken)) {
      return;
    }
    this.removeTransientActor(levelComplete);
    this.advanceLevel();
    this.wavePhaseRunning = false;
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

  private advanceLevel(): void {
    this.state.level++;
    const bounds = this.gameMode.elevationBounds(this.state.level);
    this.grid.setElevationBounds(bounds.min, bounds.max);
    this.hud.updateLevel(this.state.level);
    this.waterRuntime?.cleanup();
    this.waterRuntime = null;
    this.grid.resetHitCounts();
    this.startPlanningPhase();
  }

  private resetGame(): void {
    this.resetRunState();
    this.toolbar.activate(this);
    this.hud.updateSand(this.inventory.sand);
    this.hud.updateLevel(this.state.level);
    this.startPlanningPhase();
  }

  private resetRunState(): void {
    this.state = {
      level: 1,
      wavesCompleted: 0,
    };
    this.inventory = new InventoryModel();
    this.gameMode = new LevelMode();
    this.toolbar.deactivate(this);
    this.toolbar = new Toolbar();
    this.activePlanning = null;
    this.wavePhaseRunning = false;
    this.waterRuntime?.cleanup();
    this.waterRuntime = null;
    this.sandLayer.reset();
    this.grid.reset();
    this.castleActor = placeCastle(
      this,
      this.castleActor,
      CASTLE_COL,
      CASTLE_ROW,
    );
  }
}
