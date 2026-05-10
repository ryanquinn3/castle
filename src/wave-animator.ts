import { Scene, Actor, Color, Rectangle, Vector, Text, Font } from 'excalibur';
import { simulateWave, WaveResult, generateWaveCurve } from './wave';
import { TileGrid } from './grid';
import { Tile } from './tile';
import { CASTLE_COL, CASTLE_ROW, GRID_WIDTH, GRID_HEIGHT, TILE_SIZE, WAVE_ROW_DELAY_MS, WAVE_VALLEY_FRACTION, TERRAIN_SLOPE } from './config';

const GRID_LEFT = (800 - GRID_WIDTH * TILE_SIZE) / 2;
const GRID_TOP = (600 - GRID_HEIGHT * TILE_SIZE) / 2;
const POST_WAVE_PAUSE_MS = 800;
const CASTLE_FLASH_MS = 200;

export class WaveAnimator {
  private overlayActors: Actor[] = [];

  constructor(private grid: TileGrid, private scene: Scene) {}

  async animate(waveHeight: number): Promise<WaveResult> {
    const peakPhase = (Math.random() - 0.5) * 0.4;
    const columnHeights = generateWaveCurve(GRID_WIDTH, waveHeight, WAVE_VALLEY_FRACTION, peakPhase);
    const elevations = this.grid.getElevations();
    const result = simulateWave(elevations, columnHeights, CASTLE_COL, CASTLE_ROW, GRID_HEIGHT, TERRAIN_SLOPE);

    const animRows = Math.min(Math.round(waveHeight / TERRAIN_SLOPE) + 2, GRID_HEIGHT);

    // 1. Animate rows top to bottom
    for (let row = 0; row < animRows; row++) {
      await this.delay(WAVE_ROW_DELAY_MS);
      for (let col = 0; col < GRID_WIDTH; col++) {
        if (result.waveHeightMap[row][col] > 0) {
          this.spawnOverlay(col, row, result.waveHeightMap[row][col]);
        }
      }
    }

    // 2. Column-top height labels
    for (let col = 0; col < GRID_WIDTH; col++) {
      let firstRow = -1;
      for (let row = 0; row < GRID_HEIGHT; row++) {
        if (result.waveHeightMap[row][col] > 0) {
          firstRow = row;
          break;
        }
      }
      if (firstRow === -1) continue;

      const height = result.waveHeightMap[firstRow][col];
      const labelActor = new Actor({
        pos: new Vector(
          GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
          GRID_TOP + firstRow * TILE_SIZE + TILE_SIZE / 2,
        ),
        z: 10,
      });
      labelActor.graphics.use(new Text({
        text: String(Math.round(height)),
        color: Color.White,
        font: new Font({ size: 10 }),
      }));
      this.scene.add(labelActor);
      this.overlayActors.push(labelActor);
    }

    // 3. Pause after wave
    await this.delay(POST_WAVE_PAUSE_MS);

    // 4. Flash castle if flooded
    if (result.castleFlooded) {
      const castleTile = this.grid.getTile(CASTLE_COL, CASTLE_ROW);
      if (castleTile) {
        for (let i = 0; i < 3; i++) {
          // flash red
          const redRect = new Rectangle({
            width: TILE_SIZE - 1,
            height: TILE_SIZE - 1,
            color: Color.Red,
          });
          castleTile.graphics.use(redRect);
          await this.delay(CASTLE_FLASH_MS);
          // restore normal
          castleTile.updateVisual();
          await this.delay(CASTLE_FLASH_MS);
        }
      }
    }

    return result;
  }

  async flashErodedTiles(tiles: Tile[]): Promise<void> {
    if (tiles.length === 0) return;

    const flashActors: Actor[] = [];
    for (const tile of tiles) {
      const actor = new Actor({
        pos: new Vector(
          GRID_LEFT + tile.col * TILE_SIZE + TILE_SIZE / 2,
          GRID_TOP + tile.row * TILE_SIZE + TILE_SIZE / 2,
        ),
        width: TILE_SIZE - 1,
        height: TILE_SIZE - 1,
        color: Color.fromRGB(255, 140, 0, 0.7),
      });
      this.scene.add(actor);
      flashActors.push(actor);
    }

    await this.delay(350);

    for (const actor of flashActors) {
      this.scene.remove(actor);
    }
  }

  cleanup(): void {
    for (const actor of this.overlayActors) {
      this.scene.remove(actor);
    }
    this.overlayActors = [];
  }

  private spawnOverlay(col: number, row: number, waveHeight: number): void {
    const t = Math.min((waveHeight - 1) / 8, 1.0); // 0 at height 1, 1 at height 9+
    const r = Math.round(180 * (1 - t));            // 180 (light cyan) → 0 (navy)
    const g = Math.round(220 * (1 - t) + 10);      // 220 → 10
    const a = 0.25 + t * 0.65;                      // 0.25 (translucent) → 0.90 (opaque)
    const color = Color.fromRGB(r, g, 255, a);
    const actor = new Actor({
      pos: new Vector(
        GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
        GRID_TOP + row * TILE_SIZE + TILE_SIZE / 2,
      ),
      width: TILE_SIZE - 1,
      height: TILE_SIZE - 1,
      color,
    });
    this.scene.add(actor);
    this.overlayActors.push(actor);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
