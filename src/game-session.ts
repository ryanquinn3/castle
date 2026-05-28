import { Engine, Scene, Actor, Keys, vec } from "excalibur";
import { GridView } from "./view/grid-view.ts";
import { GridModel } from "./model/grid-model.ts";
import { PlanningPhase } from "./view/planning-phase.ts";
import { WaveRenderer } from "./view/wave-renderer.ts";
import {
  showWaveBanner,
  showLevelComplete,
  showGameOver,
  showElevationLabels,
  hideElevationLabels,
} from "./view/screen-overlays.ts";
import { simulateWave, generateWaveCurve } from "./model/wave-simulation.ts";
import {
  GRID_HEIGHT,
  TERRAIN_SLOPE,
  WAVE_HEIGHT_PER_WAVE_INC,
  CASTLE_ROW,
  CASTLE_COL,
  GRID_WIDTH,
  WAVE_VALLEY_FRACTION,
  WAVE_PEAK_WEIGHTS,
  computeLayout,
} from "./config.ts";

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, mapTop: MAP_TOP } = computeLayout(window);
import type { GameMode, GameState } from "./modes/game-mode.ts";
import { LevelMode } from "./modes/level-mode.ts";
import { Tile } from "./view/tile.ts";
import { Hud } from "./view/hud.ts";
import { InventoryModel } from "./model/inventory-model.ts";
import { Toolbar } from "./view/toolbar.ts";
import { tiledMap } from "./resources.ts";

export class GameSession extends Scene {
  private model!: GridModel;
  private grid!: GridView;
  private waveRenderer!: WaveRenderer;
  private hud!: Hud;
  private inventory = new InventoryModel();
  private toolbar = new Toolbar();
  private elevationLabelActors: Actor[] = [];
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


    this.model = new GridModel({
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      castleCol: CASTLE_COL,
      castleRow: CASTLE_ROW,
    });
    this.grid = new GridView(this.model, this);
    this.waveRenderer = new WaveRenderer(this.grid, this);
    this.hud = new Hud();
    this.hud.activate(this, this.state.level);
    this.toolbar.activate(this);
    this.toolbar.updateSandCount(this.inventory.sand);
    this.startPlanningPhase();

    _engine.input.keyboard.on("hold", (evt) => {
      if (evt.key === Keys.L && this.elevationLabelActors.length === 0) {
        this.elevationLabelActors = showElevationLabels(this, this.grid);
      }
    });
    _engine.input.keyboard.on("release", (evt) => {
      if (evt.key === Keys.L) {
        hideElevationLabels(this, this.elevationLabelActors);
        this.elevationLabelActors = [];
      }
    });

    _engine.input.keyboard.on("press", (evt) => {
      if (evt.key === Keys.D) {
        const text = this.model.serialize();
        void navigator.clipboard.writeText(text);
      }
    });
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
        phase.deactivate(this);
        void this.runWavePhase();
      },
    );
    phase.activate(this);
  }

  private async runWavePhase(): Promise<void> {
    const waveParams = this.gameMode.nextWaveParams(this.state);
    const totalWaves = waveParams.waveCount;
    const baseHeight = waveParams.peakHeight;

    for (let k = 1; k <= totalWaves; k++) {
      // Show "Wave k of N" banner for 500ms
      const banner = showWaveBanner(this, k, totalWaves);
      await this.delay(500);
      this.remove(banner);

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
      const columnHeights = generateWaveCurve(
        GRID_WIDTH,
        waveHeight,
        WAVE_VALLEY_FRACTION,
        peakPhase,
        numPeaks,
      );

      // Build simulation input from grid model
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

      // Render the pre-computed result
      await this.waveRenderer.playWave(result);

      // Apply erosion and flash
      const erodedTiles = this.grid.applyErosion(
        result.advanceHeightMap,
        result.recedeHeightMap,
      );
      if (erodedTiles.length > 0) {
        await this.waveRenderer.flashErodedTiles(erodedTiles);
      }

      // Persist absorbed water as puddles for future waves.
      const puddleDeltas: { col: number; row: number; depth: number }[] = [];
      for (let r = 0; r < result.puddleDelta.length; r++) {
        for (let c = 0; c < result.puddleDelta[r].length; c++) {
          if (result.puddleDelta[r][c] > 0) {
            puddleDeltas.push({
              col: c,
              row: r,
              depth: result.puddleDelta[r][c],
            });
          }
        }
      }
      this.grid.applyPuddleDeltas(puddleDeltas);
      this.grid.applySandRedistribution(result.wallErosionEvents);
      await this.waveRenderer.flashSandRedistribution(result.wallErosionEvents);

      // Use gameMode to resolve wave outcome
      const transition = this.gameMode.resolveWave(this.state, {
        castleFlooded: result.castleFlooded,
        allWavesComplete: k === totalWaves,
      });

      if (transition.type === "gameover") {
        this.waveRenderer.cleanup();
        showGameOver(this, this.state.level, {
          onRestart: () => this.resetGame(),
        });
        return;
      }

      // Clean up overlays between waves, then pause (skip pause after last wave)
      this.waveRenderer.cleanup();
      if (k < totalWaves) {
        await this.delay(600);
      }
    }

    await showLevelComplete(this, this.state.level);
    this.advanceLevel();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private advanceLevel(): void {
    this.state.level++;
    const bounds = this.gameMode.elevationBounds(this.state.level);
    this.grid.model.setElevationBounds(bounds.min, bounds.max);
    this.hud.updateLevel(this.state.level);
    this.waveRenderer.cleanup();
    this.grid.resetHitCounts();
    this.waveRenderer = new WaveRenderer(this.grid, this);
    this.startPlanningPhase();
  }

  private resetGame(): void {
    this.state = {
      level: 1,
      wavesCompleted: 0,
    };
    this.inventory = new InventoryModel();
    this.toolbar.deactivate(this);
    this.toolbar = new Toolbar();
    this.toolbar.activate(this);
    this.toolbar.updateSandCount(this.inventory.sand);
    this.hud.updateLevel(this.state.level);
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
    this.startPlanningPhase();
  }
}
