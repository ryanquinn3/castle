import { Engine, Scene, Actor, Keys, vec } from "excalibur";
import { GridView } from "./view/grid-view.ts";
import { GridModel } from "./model/grid-model.ts";
import { PlanningPhase } from "./view/planning-phase.ts";
import { WaveRenderer } from "./view/wave-renderer.ts";
import {
  showWaveBanner,
  showLevelCompleteBanner,
  showGameOver,
  showElevationLabels,
  hideElevationLabels,
} from "./view/screen-overlays.ts";
import { WaveActorRuntime } from "./wave/wave-actor-runtime.ts";
import { WaveEventApplier } from "./wave/wave-event-applier.ts";
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
  computeLayout,
} from "./config.ts";

const LAYOUT = computeLayout(window);
const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP, mapTop: MAP_TOP } = LAYOUT;
import type { GameMode, GameState } from "./modes/game-mode.ts";
import { LevelMode } from "./modes/level-mode.ts";
import { Tile } from "./view/tile.ts";
import { Hud } from "./view/hud.ts";
import { InventoryModel } from "./model/inventory-model.ts";
import { Toolbar } from "./view/toolbar.ts";
import { Resources, tiledMap } from "./resources.ts";
import { playSound } from "./sound.ts";
import { GameplayControls } from "./view/gameplay-controls.ts";
import { LevelSessionLifecycle } from "./level-session-lifecycle.ts";
import { SandLayer } from "./view/sand-layer.ts";

export class LevelSession extends Scene {
  private model!: GridModel;
  private grid!: GridView;
  private waveRenderer!: WaveRenderer;
  private waveRuntime: WaveActorRuntime | null = null;
  private hud!: Hud;
  private inventory = new InventoryModel();
  private toolbar = new Toolbar();
  private gameplayControls = new GameplayControls();
  private activePlanning: PlanningPhase | null = null;
  private elevationLabelActors: Actor[] = [];
  private transientActors = new Set<Actor>();
  private lifecycle = new LevelSessionLifecycle();
  private initialized = false;
  private uiActive = false;
  private wavePhaseRunning = false;
  private gameMode: GameMode = new LevelMode();
  private state: GameState = {
    level: 1,
    wavesCompleted: 0,
  };

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
    new SandLayer(this, mapX, mapY, tileScale, Resources.BeachTileset);

    this.model = new GridModel({
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      castleCol: CASTLE_COL,
      castleRow: CASTLE_ROW,
      castleWidth: CASTLE_WIDTH,
      castleHeight: CASTLE_HEIGHT,
    });
    this.grid = new GridView(this.model, this);
    this.waveRenderer = new WaveRenderer(this.grid, this, (ms) => this.delay(ms));
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
        const text = this.model.serialize();
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
    this.hud.activate(this, this.state.level, LAYOUT);
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
    this.waveRenderer?.cleanup();
    this.waveRuntime?.cleanup();
    this.waveRuntime = null;
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

  private makeWaveGridAdapter(): WaveSegmentGrid {
    return {
      gridTop: GRID_TOP,
      tileSize: TILE_SIZE,
      height: GRID_HEIGHT,
      getElevation: (col: number, row: number) => this.grid.model.getElevation(col, row),
      effectiveHoleDepth: (col: number, row: number) => this.grid.model.effectiveHoleDepth(col, row),
      isCastle: (col: number, row: number) => this.grid.model.isCastle(col, row),
    };
  }

  private exitToTitle(): void {
    this.lifecycle.deactivate({ resetOnNextActivate: true });
    void this.engine.goToScene("title");
  }

  private startPlanningPhase(): void {
    const waveParams = this.gameMode.nextWaveParams(this.state);
    const scoops = this.gameMode.scoopBudget(this.state);
    const maxWaveHeight = waveParams.peakHeight + (waveParams.waveCount - 1) * WAVE_HEIGHT_PER_WAVE_INC;
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
      const banner = this.trackTransientActor(showWaveBanner(this, k, totalWaves));
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

      this.waveRuntime?.cleanup();
      this.waveRuntime = new WaveActorRuntime(
        this,
        this.makeWaveGridAdapter(),
        new WaveEventApplier(this.grid),
        TERRAIN_SLOPE,
      );
      const result = await this.waveRuntime.playWave(spawns);
      if (!this.lifecycle.isCurrent(sessionToken)) {
        return;
      }

      if (result.erodedTiles.length > 0) {
        await this.waveRenderer.flashErodedTiles(result.erodedTiles);
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
        this.waveRenderer.cleanup();
        this.waveRuntime?.cleanup();
        this.waveRuntime = null;
        let gameOverActor: Actor;
        gameOverActor = this.trackTransientActor(showGameOver(this, this.state.level, {
          onRestart: () => {
            this.transientActors.delete(gameOverActor);
            if (this.lifecycle.active) {
              this.resetGame();
            }
          },
        }));
        return;
      }

      // Clean up overlays between waves, then pause (skip pause after last wave)
      this.waveRenderer.cleanup();
      if (k < totalWaves) {
        await this.delay(600);
        if (!this.lifecycle.isCurrent(sessionToken)) {
          return;
        }
      }
    }

    const levelComplete = this.trackTransientActor(showLevelCompleteBanner(this, this.state.level));
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
    this.grid.model.setElevationBounds(bounds.min, bounds.max);
    this.hud.updateLevel(this.state.level);
    this.waveRenderer.cleanup();
    this.waveRuntime?.cleanup();
    this.waveRuntime = null;
    this.grid.resetHitCounts();
    this.waveRenderer = new WaveRenderer(this.grid, this, (ms) => this.delay(ms));
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
    this.waveRenderer.cleanup();
    this.waveRuntime?.cleanup();
    this.waveRuntime = null;
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
    this.waveRenderer = new WaveRenderer(this.grid, this, (ms) => this.delay(ms));
  }
}
