import { Engine, Scene, Actor, Color, Rectangle, Keys } from 'excalibur';
import { TileGrid } from './grid';
import { GridModel } from './model/grid-model';
import { PlanningPhase } from './view/planning-phase';
import { WaveRenderer } from './view/wave-renderer';
import { showWaveBanner, showTextBanner, showLevelComplete, showGameOver, showElevationLabels, hideElevationLabels } from './view/screen-overlays';
import { simulateWave, generateWaveCurve } from './model/wave-simulation';
import { GRID_HEIGHT, TERRAIN_SLOPE, WAVE_HEIGHT_PER_WAVE_INC, CASTLE_ROW, CASTLE_COL, GRID_WIDTH, CANVAS_WIDTH, GRID_TOP, WAVE_VALLEY_FRACTION, WAVE_PEAK_WEIGHTS } from './config';
import type { GameMode, GameState } from './modes/game-mode';
import { LevelMode } from './modes/level-mode';
import { Tile } from './view/tile';
import { LevelDisplay } from './view/level-display';

export class GameSession extends Scene {
  private model!: GridModel;
  private grid!: TileGrid;
  private waveRenderer!: WaveRenderer;
  private levelDisplay!: LevelDisplay;
  private elevationLabelActors: Actor[] = [];
  private gameMode: GameMode = new LevelMode();
  private state: GameState = {
    level: 1,
    wavesCompleted: 0,
    consecutiveCleanWaves: 0,
    hasEnhancedShovel: false,
  };

  override onInitialize(_engine: Engine): void {
    // Ocean blue strip above the grid -- signals where the wave comes from.
    const oceanBg = new Actor({ x: CANVAS_WIDTH / 2, y: GRID_TOP / 2, z: -1 });
    oceanBg.graphics.use(new Rectangle({
      width: CANVAS_WIDTH,
      height: GRID_TOP,
      color: Color.fromRGB(30, 90, 160),
    }));
    this.add(oceanBg);

    this.model = new GridModel({ width: GRID_WIDTH, height: GRID_HEIGHT, castleCol: CASTLE_COL, castleRow: CASTLE_ROW });
    this.grid = new TileGrid(this.model, this);
    this.waveRenderer = new WaveRenderer(this.grid, this);
    this.levelDisplay = new LevelDisplay();
    this.levelDisplay.activate(this, this.state.level);
    this.startPlanningPhase();

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
  }

  private startPlanningPhase(): void {
    const waveParams = this.gameMode.nextWaveParams(this.state);
    const scoops = this.gameMode.scoopBudget(this.state);
    const naturalReach = Math.min(Math.round(waveParams.peakHeight / TERRAIN_SLOPE), GRID_HEIGHT);
    const phase = new PlanningPhase(this.grid, scoops, naturalReach, waveParams.peakHeight, waveParams.waveCount, this.state.hasEnhancedShovel, () => {
      phase.deactivate(this);
      void this.runWavePhase();
    });
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
        if (r <= 0) { numPeaks = i + 1; break; }
      }
      const columnHeights = generateWaveCurve(GRID_WIDTH, waveHeight, WAVE_VALLEY_FRACTION, peakPhase, numPeaks);

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
      const erodedTiles = this.grid.applyErosion(result.advanceHeightMap, result.recedeHeightMap);
      if (erodedTiles.length > 0) {
        await this.waveRenderer.flashErodedTiles(erodedTiles);
      }

      // Persist absorbed water as puddles for future waves.
      const puddleDeltas: { col: number; row: number; depth: number }[] = [];
      for (let r = 0; r < result.puddleDelta.length; r++) {
        for (let c = 0; c < result.puddleDelta[r].length; c++) {
          if (result.puddleDelta[r][c] > 0) {
            puddleDeltas.push({ col: c, row: r, depth: result.puddleDelta[r][c] });
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

      if (transition.type === 'gameover') {
        this.waveRenderer.cleanup();
        showGameOver(this, this.state.level, { onRestart: () => this.resetGame() });
        return;
      }

      // Check for clean wave and potentially award enhanced shovel
      await this.checkCleanWave(result.advanceHeightMap);

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
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private advanceLevel(): void {
    this.state.level++;
    const bounds = this.gameMode.elevationBounds(this.state.level);
    this.grid.model.setElevationBounds(bounds.min, bounds.max);
    this.levelDisplay.update(this.state.level);
    this.waveRenderer.cleanup();
    this.grid.resetHitCounts();
    this.waveRenderer = new WaveRenderer(this.grid, this);
    this.startPlanningPhase();
  }

  private resetGame(): void {
    this.state = {
      level: 1,
      wavesCompleted: 0,
      consecutiveCleanWaves: 0,
      hasEnhancedShovel: false,
    };
    this.levelDisplay.update(this.state.level);
    this.waveRenderer.cleanup();
    const tilesToRemove = this.entities.filter(e => e instanceof Tile) as Tile[];
    for (const tile of tilesToRemove) {
      this.remove(tile);
    }
    this.model = new GridModel({ width: GRID_WIDTH, height: GRID_HEIGHT, castleCol: CASTLE_COL, castleRow: CASTLE_ROW });
    this.grid = new TileGrid(this.model, this);
    this.waveRenderer = new WaveRenderer(this.grid, this);
    this.startPlanningPhase();
  }

  private async checkCleanWave(waveHeightMap: number[][]): Promise<void> {
    let isClean = true;
    for (let r = CASTLE_ROW - 1; r <= CASTLE_ROW + 1; r++) {
      for (let c = CASTLE_COL - 1; c <= CASTLE_COL + 1; c++) {
        if (r === CASTLE_ROW && c === CASTLE_COL) { continue; }
        if (r < 0 || r >= GRID_HEIGHT || c < 0 || c >= GRID_WIDTH) { continue; }
        if (waveHeightMap[r][c] > 0) {
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
      const banner = showTextBanner(this, 'Enhanced shovel earned!', Color.fromRGB(255, 220, 50));
      await this.delay(1500);
      this.remove(banner);
    }
  }
}
