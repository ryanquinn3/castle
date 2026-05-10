import { Engine, Scene, Actor, Color, Rectangle, Text, Font } from 'excalibur';
import { TileGrid } from './grid';
import { PlanningPhase } from './planning-phase';
import { WaveAnimator } from './wave-animator';
import { waveHeightForLevel, wavesForLevel } from './wave';
import { SCOOP_START, SCOOP_INCREMENT, GRID_HEIGHT, TERRAIN_SLOPE, WAVE_HEIGHT_PER_WAVE_INC, CASTLE_ROW, CASTLE_COL, GRID_WIDTH, ENHANCED_SHOVEL_WAVES_REQUIRED } from './config';
import { Tile } from './tile';
import { LevelDisplay } from './level-display';

export class MyLevel extends Scene {
  private grid!: TileGrid;
  private waveAnimator!: WaveAnimator;
  private levelDisplay!: LevelDisplay;
  currentLevel = 1;
  private consecutiveCleanWaves = 0;
  private hasEnhancedShovel = false;

  override onInitialize(_engine: Engine): void {
    this.grid = new TileGrid(this);
    this.waveAnimator = new WaveAnimator(this.grid, this);
    this.levelDisplay = new LevelDisplay();
    this.levelDisplay.activate(this, this.currentLevel);
    this.startPlanningPhase();
  }

  private startPlanningPhase(): void {
    const scoops = SCOOP_START + (this.currentLevel - 1) * SCOOP_INCREMENT;
    const naturalReach = Math.min(Math.round(waveHeightForLevel(this.currentLevel) / TERRAIN_SLOPE), GRID_HEIGHT);
    const phase = new PlanningPhase(this.grid, scoops, naturalReach, waveHeightForLevel(this.currentLevel), wavesForLevel(this.currentLevel), this.hasEnhancedShovel, () => {
      phase.deactivate(this);
      void this.runWavePhase();
    });
    phase.activate(this);
  }

  private async runWavePhase(): Promise<void> {
    const totalWaves = wavesForLevel(this.currentLevel);
    const baseHeight = waveHeightForLevel(this.currentLevel);

    for (let k = 1; k <= totalWaves; k++) {
      // Show "Wave k of N" banner for 500ms
      const banner = this.showWaveBanner(k, totalWaves);
      await this.delay(500);
      this.remove(banner);

      // Animate and simulate wave k
      const waveHeight = baseHeight + (k - 1) * WAVE_HEIGHT_PER_WAVE_INC;
      const result = await this.waveAnimator.animate(waveHeight);

      // Apply erosion and flash
      const erodedTiles = this.grid.applyErosion(result.waveHeightMap);
      if (erodedTiles.length > 0) {
        await this.waveAnimator.flashErodedTiles(erodedTiles);
      }

      // Check for clean wave and potentially award enhanced shovel
      await this.checkCleanWave(result.waveHeightMap);

      // Castle flooded: game over immediately
      if (result.castleFlooded) {
        this.showGameOver();
        return;
      }

      // Clean up overlays between waves, then pause (skip pause after last wave)
      this.waveAnimator.cleanup();
      if (k < totalWaves) {
        await this.delay(600);
      }
    }

    await this.showLevelComplete();
    this.advanceLevel();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private showWaveBanner(k: number, total: number): Actor {
    const actor = new Actor({ x: 400, y: 270, z: 50 });
    actor.graphics.use(new Text({
      text: `Wave ${k} of ${total}`,
      color: Color.fromRGB(100, 180, 255),
      font: new Font({ size: 28 }),
    }));
    this.add(actor);
    return actor;
  }

  private advanceLevel(): void {
    this.currentLevel++;
    this.levelDisplay.update(this.currentLevel);
    this.waveAnimator.cleanup();
    this.grid.resetHitCounts();
    this.waveAnimator = new WaveAnimator(this.grid, this);
    this.startPlanningPhase();
  }

  private showGameOver(): void {
    this.waveAnimator.cleanup();
    const bgActor = new Actor({ x: 400, y: 300, z: 100 });
    bgActor.graphics.use(new Rectangle({ width: 800, height: 600, color: Color.fromRGB(0, 0, 0, 0.75) }));

    const titleActor = new Actor({ x: 0, y: -40 });
    titleActor.graphics.use(new Text({ text: 'GAME OVER', color: Color.White, font: new Font({ size: 48 }) }));
    bgActor.addChild(titleActor);

    const subtitleActor = new Actor({ x: 0, y: 20 });
    subtitleActor.graphics.use(new Text({ text: `Level reached: ${this.currentLevel}`, color: Color.White, font: new Font({ size: 24 }) }));
    bgActor.addChild(subtitleActor);

    const restartActor = new Actor({ x: 0, y: 60 });
    restartActor.graphics.use(new Text({ text: 'Click anywhere to restart', color: Color.fromRGB(180, 180, 180), font: new Font({ size: 18 }) }));
    bgActor.addChild(restartActor);

    bgActor.on('pointerdown', () => {
      this.remove(bgActor);
      this.resetGame();
    });

    this.add(bgActor);
  }

  private resetGame(): void {
    this.currentLevel = 1;
    this.consecutiveCleanWaves = 0;
    this.hasEnhancedShovel = false;
    this.levelDisplay.update(this.currentLevel);
    this.waveAnimator.cleanup();
    const tilesToRemove = this.entities.filter(e => e instanceof Tile) as Tile[];
    for (const tile of tilesToRemove) {
      this.remove(tile);
    }
    this.grid = new TileGrid(this);
    this.waveAnimator = new WaveAnimator(this.grid, this);
    this.startPlanningPhase();
  }

  private async checkCleanWave(waveHeightMap: number[][]): Promise<void> {
    let isClean = true;
    for (let r = CASTLE_ROW - 1; r <= CASTLE_ROW + 1; r++) {
      for (let c = CASTLE_COL - 1; c <= CASTLE_COL + 1; c++) {
        if (r === CASTLE_ROW && c === CASTLE_COL) continue;
        if (r < 0 || r >= GRID_HEIGHT || c < 0 || c >= GRID_WIDTH) continue;
        if (waveHeightMap[r][c] > 0) {
          isClean = false;
        }
      }
    }
    if (isClean) {
      this.consecutiveCleanWaves++;
      if (this.consecutiveCleanWaves >= ENHANCED_SHOVEL_WAVES_REQUIRED && !this.hasEnhancedShovel) {
        this.hasEnhancedShovel = true;
        const banner = this.showTextBanner('Enhanced shovel earned!', Color.fromRGB(255, 220, 50));
        await this.delay(1500);
        this.remove(banner);
      }
    } else {
      this.consecutiveCleanWaves = 0;
    }
  }

  private showTextBanner(text: string, color: Color): Actor {
    const actor = new Actor({ x: 400, y: 240, z: 50 });
    actor.graphics.use(new Text({
      text,
      color,
      font: new Font({ size: 28 }),
    }));
    this.add(actor);
    return actor;
  }

  private showLevelComplete(): Promise<void> {
    return new Promise(resolve => {
      const actor = new Actor({ x: 400, y: 300, z: 50 });
      actor.graphics.use(new Text({
        text: `Level ${this.currentLevel} complete!`,
        color: Color.White,
        font: new Font({ size: 32 }),
      }));
      this.add(actor);
      setTimeout(() => {
        this.remove(actor);
        resolve();
      }, 1500);
    });
  }
}
