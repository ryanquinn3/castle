import { Actor, Color, Rectangle } from 'excalibur';
import { TILE_SIZE, GRID_WIDTH, GRID_HEIGHT } from './config';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

const gridPixelWidth = GRID_WIDTH * TILE_SIZE;
const gridPixelHeight = GRID_HEIGHT * TILE_SIZE;

const gridLeft = (CANVAS_WIDTH - gridPixelWidth) / 2;
const gridTop = (CANVAS_HEIGHT - gridPixelHeight) / 2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function elevationToColor(elevation: number, isCastle: boolean): Color {
  if (isCastle) {
    return Color.fromRGB(180, 60, 60);
  }
  if (elevation === 0) {
    return Color.fromRGB(210, 180, 140);
  }
  if (elevation > 0) {
    const r = clamp(210 - elevation * 9, 0, 255);
    const g = clamp(180 - elevation * 10, 0, 255);
    const b = clamp(140 - elevation * 10, 0, 255);
    return Color.fromRGB(r, g, b);
  }
  // elevation < 0: interpolate toward deep blue at -10 (20, 60, 180)
  const r = clamp(210 + elevation * 19, 0, 255);
  const g = clamp(180 + elevation * 12, 0, 255);
  const b = clamp(140 - elevation * 4, 0, 255);
  return Color.fromRGB(r, g, b);
}

export class Tile extends Actor {
  elevation: number = 0;
  waveHitCount: number = 0;
  readonly isCastle: boolean;
  readonly col: number;
  readonly row: number;

  constructor(col: number, row: number, isCastle: boolean = false) {
    const x = gridLeft + (col + 0.5) * TILE_SIZE;
    const y = gridTop + (row + 0.5) * TILE_SIZE;
    super({ x, y, width: TILE_SIZE, height: TILE_SIZE });
    this.col = col;
    this.row = row;
    this.isCastle = isCastle;
    this.updateVisual();
  }

  updateVisual(): void {
    const color = elevationToColor(this.elevation, this.isCastle);
    const rect = new Rectangle({
      width: TILE_SIZE - 1,
      height: TILE_SIZE - 1,
      color,
    });
    this.graphics.use(rect);
  }
}
