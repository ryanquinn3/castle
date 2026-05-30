import { Scene, Actor, Canvas, Color, Rectangle, Vector, Text, Font } from 'excalibur';
import type { WaveResult, WallErosionEvent } from '../model/wave-simulation.ts';
import { GridView } from './grid-view.ts';
import { Tile } from './tile.ts';
import { CASTLE_COL, CASTLE_ROW, CASTLE_WIDTH, CASTLE_HEIGHT, GRID_WIDTH, GRID_HEIGHT, WAVE_ROW_DELAY_MS, WAVE_RECEDE_ROW_DELAY_MS, WATER_RENDER_THRESHOLD, computeLayout } from '../config.ts';

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

function waveColorRGBA(waveHeight: number): { r: number; g: number; b: number; a: number } {
  if (waveHeight <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const t = Math.min((waveHeight - 1) / 8, 1.0);
  const r = Math.round(180 * (1 - t));
  const g = Math.round(220 * (1 - t) + 10);
  const a = 0.25 + t * 0.65;
  return { r, g, b: 255, a };
}

function cornerHeight(
  frame: number[][],
  row: number,
  col: number,
  dRow: number,
  dCol: number,
): number {
  const cells: number[] = [frame[row][col]];
  const nr = row + dRow;
  const nc = col + dCol;
  if (nr >= 0 && nr < frame.length && frame[nr][col] > WATER_RENDER_THRESHOLD) {
    cells.push(frame[nr][col]);
  }
  if (nc >= 0 && nc < frame[0].length && frame[row][nc] > WATER_RENDER_THRESHOLD) {
    cells.push(frame[row][nc]);
  }
  if (nr >= 0 && nr < frame.length && nc >= 0 && nc < frame[0].length && frame[nr][nc] > WATER_RENDER_THRESHOLD) {
    cells.push(frame[nr][nc]);
  }
  let sum = 0;
  for (const v of cells) {
    sum += v;
  }
  return sum / cells.length;
}

const POST_WAVE_PAUSE_MS = 800;
const CASTLE_FLASH_MS = 200;
const labelFont = new Font({ size: 10 });

export class WaveRenderer {
  private overlayActors: Actor[] = [];
  private edgeMap = new Map<string, Actor>();

  constructor(private grid: GridView, private scene: Scene) {}

  async playWave(result: WaveResult): Promise<void> {
    const hasWater: boolean[][] = Array.from({ length: GRID_HEIGHT }, () =>
      Array.from({ length: GRID_WIDTH }, () => false),
    );
    const overlayGrid: (Actor | null)[][] = Array.from({ length: GRID_HEIGHT }, () =>
      Array.from({ length: GRID_WIDTH }, () => null),
    );
    const flashed: boolean[][] = Array.from({ length: GRID_HEIGHT }, () =>
      Array.from({ length: GRID_WIDTH }, () => false),
    );

    // 1. Advance: iterate frame snapshots showing lateral flow
    for (const frame of result.advanceFrames) {
      let changed = false;
      for (let row = 0; row < GRID_HEIGHT; row++) {
        for (let col = 0; col < GRID_WIDTH; col++) {
          const hasWaterNow = frame[row][col] > WATER_RENDER_THRESHOLD;

          if (hasWaterNow && !hasWater[row][col]) {
            hasWater[row][col] = true;
            changed = true;
            const overlay = this.spawnOverlay(col, row, frame);
            overlayGrid[row][col] = overlay;

            if (!flashed[row][col]) {
              flashed[row][col] = true;
              if (result.wallErosionEvents[row][col] === 'blocked') {
                this.spawnBlockFlash(col, row);
              } else if (result.wallErosionEvents[row][col] === 'overtopped') {
                this.spawnOvertopBar(col, row);
              }
            }
          } else if (!hasWaterNow && hasWater[row][col]) {
            hasWater[row][col] = false;
            changed = true;
            const existing = overlayGrid[row][col];
            if (existing) {
              existing.actions.fade(0, 120).callMethod(() => this.scene.remove(existing));
              overlayGrid[row][col] = null;
            }
          }
        }
      }
      if (changed) {
        this.rebuildEdges(hasWater);
        await this.delay(WAVE_ROW_DELAY_MS);
      }
    }

    // 1b. Recede: fade out advance overlays as water drains
    for (const frame of result.recedeFrames) {
      let changed = false;
      for (let row = 0; row < GRID_HEIGHT; row++) {
        for (let col = 0; col < GRID_WIDTH; col++) {
          const hasWaterNow = frame[row][col] > WATER_RENDER_THRESHOLD;

          if (!hasWaterNow && hasWater[row][col]) {
            hasWater[row][col] = false;
            changed = true;
            const existing = overlayGrid[row][col];
            if (existing) {
              existing.actions.fade(0, 120).callMethod(() => this.scene.remove(existing));
              overlayGrid[row][col] = null;
            }
          }
        }
      }
      if (changed) {
        this.rebuildEdges(hasWater);
        await this.delay(WAVE_RECEDE_ROW_DELAY_MS);
      }
    }
    this.clearEdges();

    // 2. Column-top height labels
    for (let col = 0; col < GRID_WIDTH; col++) {
      let firstRow = -1;
      for (let row = 0; row < GRID_HEIGHT; row++) {
        if (result.advanceHeightMap[row][col] > 0) {
          firstRow = row;
          break;
        }
      }
      if (firstRow === -1) {
        continue;
      }

      const height = result.advanceHeightMap[firstRow][col];
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
        font: labelFont,
      }));
      this.scene.add(labelActor);
      this.overlayActors.push(labelActor);
    }

    // 3. Pause after wave
    await this.delay(POST_WAVE_PAUSE_MS);

    // 4. Flash castle if flooded
    if (result.castleFlooded) {
      const castleTiles: Tile[] = [];
      for (let dr = 0; dr < CASTLE_HEIGHT; dr++) {
        for (let dc = 0; dc < CASTLE_WIDTH; dc++) {
          const t = this.grid.getTile(CASTLE_COL + dc, CASTLE_ROW + dr);
          if (t) {
            castleTiles.push(t);
          }
        }
      }
      if (castleTiles.length > 0) {
        for (let i = 0; i < 3; i++) {
          for (const t of castleTiles) {
            const redRect = new Rectangle({
              width: TILE_SIZE - 1,
              height: TILE_SIZE - 1,
              color: Color.Red,
            });
            t.graphics.use(redRect);
          }
          await this.delay(CASTLE_FLASH_MS);
          for (const t of castleTiles) {
            t.updateVisual();
          }
          await this.delay(CASTLE_FLASH_MS);
        }
      }
    }
  }

  async flashSandRedistribution(events: WallErosionEvent[][]): Promise<void> {
    const actors: Actor[] = [];
    for (let row = 0; row < events.length; row++) {
      for (let col = 0; col < events[row].length; col++) {
        if (events[row][col] === null) {
          continue;
        }
        for (const r of [row, row - 1]) {
          if (r < 0 || r >= GRID_HEIGHT) {
            continue;
          }
          const actor = new Actor({
            pos: new Vector(
              GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
              GRID_TOP + r * TILE_SIZE + TILE_SIZE / 2,
            ),
            width: TILE_SIZE - 1,
            height: TILE_SIZE - 1,
            color: Color.fromRGB(230, 200, 140, 0.75),
            z: 7,
          });
          this.scene.add(actor);
          actors.push(actor);
          actor.actions.fade(0, 240);
        }
      }
    }
    if (actors.length === 0) {
      return;
    }
    await this.delay(260);
    for (const a of actors) {
      this.scene.remove(a);
    }
  }

  async flashErodedTiles(tiles: Tile[]): Promise<void> {
    if (tiles.length === 0) {
      return;
    }

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
    this.clearEdges();
  }

  private rebuildEdges(hasWater: boolean[][]): void {
    const needed = new Set<string>();
    for (let row = 0; row < GRID_HEIGHT; row++) {
      for (let col = 0; col < GRID_WIDTH; col++) {
        if (!hasWater[row][col]) {
          continue;
        }
        if (row === 0 || !hasWater[row - 1][col]) {
          needed.add(`${col}:${row}:top`);
        }
        if (row + 1 >= GRID_HEIGHT || !hasWater[row + 1][col]) {
          needed.add(`${col}:${row}:bottom`);
        }
        if (col === 0 || !hasWater[row][col - 1]) {
          needed.add(`${col}:${row}:left`);
        }
        if (col + 1 >= GRID_WIDTH || !hasWater[row][col + 1]) {
          needed.add(`${col}:${row}:right`);
        }
      }
    }

    for (const [key, actor] of this.edgeMap) {
      if (!needed.has(key)) {
        this.scene.remove(actor);
        this.edgeMap.delete(key);
      }
    }

    for (const key of needed) {
      if (!this.edgeMap.has(key)) {
        const [colStr, rowStr, pos] = key.split(':');
        const actor = this.spawnEdge(Number(colStr), Number(rowStr), pos as 'top' | 'bottom' | 'left' | 'right');
        this.edgeMap.set(key, actor);
      }
    }
  }

  private clearEdges(): void {
    for (const a of this.edgeMap.values()) {
      this.scene.remove(a);
    }
    this.edgeMap.clear();
  }

  private spawnEdge(col: number, row: number, position: 'top' | 'bottom' | 'left' | 'right'): Actor {
    const cx = GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2;
    const cy = GRID_TOP + row * TILE_SIZE + TILE_SIZE / 2;
    let x = cx;
    let y = cy;
    let w = TILE_SIZE - 1;
    let h = 2;
    if (position === 'top') {
      y = GRID_TOP + row * TILE_SIZE + 1;
    } else if (position === 'bottom') {
      y = GRID_TOP + row * TILE_SIZE + TILE_SIZE - 1;
    } else if (position === 'left') {
      x = GRID_LEFT + col * TILE_SIZE + 1;
      w = 2;
      h = TILE_SIZE - 1;
    } else {
      x = GRID_LEFT + col * TILE_SIZE + TILE_SIZE - 1;
      w = 2;
      h = TILE_SIZE - 1;
    }
    const actor = new Actor({
      pos: new Vector(x, y),
      width: w,
      height: h,
      color: Color.fromRGB(255, 255, 255, 0.9),
      z: 8,
    });
    this.scene.add(actor);
    return actor;
  }

  private spawnBlockFlash(col: number, row: number): void {
    const actor = new Actor({
      pos: new Vector(
        GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
        GRID_TOP + row * TILE_SIZE + TILE_SIZE / 2,
      ),
      width: TILE_SIZE - 1,
      height: TILE_SIZE - 1,
      color: Color.fromRGB(255, 255, 255, 0.85),
      z: 5,
    });
    this.scene.add(actor);
    actor.actions.fade(0, 120).callMethod(() => this.scene.remove(actor));
  }

  private spawnOvertopBar(col: number, row: number): void {
    const actor = new Actor({
      pos: new Vector(
        GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
        GRID_TOP + row * TILE_SIZE + 2,
      ),
      width: TILE_SIZE - 1,
      height: 3,
      color: Color.fromRGB(220, 245, 255, 0.75),
      z: 6,
    });
    this.scene.add(actor);
    actor.actions.fade(0, 90).callMethod(() => this.scene.remove(actor));
  }

  private spawnOverlay(col: number, row: number, frame: number[][]): Actor {
    const tl = waveColorRGBA(cornerHeight(frame, row, col, -1, -1));
    const tr = waveColorRGBA(cornerHeight(frame, row, col, -1, 1));
    const bl = waveColorRGBA(cornerHeight(frame, row, col, 1, -1));
    const br = waveColorRGBA(cornerHeight(frame, row, col, 1, 1));

    const size = TILE_SIZE;
    const canvas = new Canvas({
      width: size,
      height: size,
      cache: true,
      draw(ctx: CanvasRenderingContext2D) {
        const img = ctx.createImageData(2, 2);
        const d = img.data;
        d[0] = tl.r; d[1] = tl.g; d[2] = tl.b; d[3] = Math.round(tl.a * 255);
        d[4] = tr.r; d[5] = tr.g; d[6] = tr.b; d[7] = Math.round(tr.a * 255);
        d[8] = bl.r; d[9] = bl.g; d[10] = bl.b; d[11] = Math.round(bl.a * 255);
        d[12] = br.r; d[13] = br.g; d[14] = br.b; d[15] = Math.round(br.a * 255);

        const tmp = new OffscreenCanvas(2, 2);
        const tmpCtx = tmp.getContext('2d')!;
        tmpCtx.putImageData(img, 0, 0);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(tmp, 0, 0, size, size);
      },
    });

    const actor = new Actor({
      pos: new Vector(
        GRID_LEFT + col * TILE_SIZE + TILE_SIZE / 2,
        GRID_TOP + row * TILE_SIZE + TILE_SIZE / 2,
      ),
      width: size,
      height: size,
    });
    actor.graphics.use(canvas);
    this.scene.add(actor);
    return actor;
  }


  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
