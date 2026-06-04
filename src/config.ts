export const GRID_WIDTH = 16;
export const GRID_HEIGHT = 16;
export const MAX_ELEVATION = 20;
export const MIN_ELEVATION = -20;

export const CASTLE_COL = 7;
export const CASTLE_ROW = 12;
export const CASTLE_WIDTH = 2;
export const CASTLE_HEIGHT = 2;
export const SCOOP_START = 5;
export const SCOOP_INCREMENT = 1;
export const WAVE_HEIGHT_START = 4;
export const WAVE_HEIGHT_INCREMENT = 0.5;
/** Base elevation cost per row on natural terrain. Wave height = 0 after waveHeight/TERRAIN_SLOPE rows on flat ground. */
export const TERRAIN_SLOPE = 0.5;
/** Within-level wave height step: each successive wave in a level is this much stronger. */
export const WAVE_HEIGHT_PER_WAVE_INC = 0.5;
/** Valley height as a fraction of peak height in the multi-peaked wave curve. */
export const WAVE_VALLEY_FRACTION = 0.55;
/** Milliseconds of delay between animating each row of the wave. */
export const WAVE_ROW_DELAY_MS = 180;
/** Milliseconds of delay between each row of the recede animation. Slightly faster than advance for drain feel. */
export const WAVE_RECEDE_ROW_DELAY_MS = 130;
/** Pixel speed for actor-driven wave segments during the surge phase. */
export const WAVE_SEGMENT_SURGE_SPEED = 90;
/** Pixel speed for actor-driven wave segments during the recede phase. */
export const WAVE_SEGMENT_RECEDE_SPEED = -45;
/** Maximum organic front offset, in pixels, applied to actor wave spawn Y. */
export const WAVE_FRONT_NOISE_AMPLITUDE = 50;
/** Frequency used by the deterministic actor wave front noise helper. */
export const WAVE_FRONT_NOISE_FREQUENCY = 0.2;
/** Extra pixel travel distance per unit of starting depth. */
export const WAVE_SEGMENT_TRAVEL_PER_DEPTH = 350;
/** Base pixel travel distance before starting-depth scaling. */
export const WAVE_SEGMENT_BASE_TRAVEL = 150;
/** Number of waves on level 1. */
export const WAVES_BASE = 1;
/** Additional waves added per level above level 1. waves(N) = WAVES_BASE + (N-1) * WAVES_INCREMENT */
export const WAVES_INCREMENT = 1;
export const TOWER_HITS_PER_EROSION = 10;
export const TOWER_HEIGHT = 15;
export const TOWER_COST = 15;

/**
 * Removes direct dependency on window to make this config usable in node
 */
export interface Viewport {
  innerWidth: number;
  innerHeight: number;
}

export const TILEMAP_ROWS = 17;
export const TILEMAP_OCEAN_ROWS = 1;
export const TILEMAP_SAND_ROWS = TILEMAP_ROWS - TILEMAP_OCEAN_ROWS;

export interface Layout {
  tileSize: number;
  gridPixelWidth: number;
  gridPixelHeight: number;
  gridLeft: number;
  gridTop: number;
  mapTop: number;
  canvasWidth: number;
  canvasHeight: number;
}

const HUD_TOP = 0;
const PADDING = 20;

export function computeLayout(viewport: Viewport): Layout {
  const tileSize = Math.max(
    16,
    Math.min(
      36,
      Math.min(
        Math.floor((viewport.innerWidth - PADDING * 2) / GRID_WIDTH),
        Math.floor(
          (viewport.innerHeight - HUD_TOP - PADDING * 2) / TILEMAP_ROWS,
        ),
      ),
    ),
  );
  const gridPixelWidth = GRID_WIDTH * tileSize;
  const gridPixelHeight = GRID_HEIGHT * tileSize;
  const mapPixelHeight = TILEMAP_ROWS * tileSize;
  const gridLeft = Math.floor((viewport.innerWidth - gridPixelWidth) / 2);
  const mapTop =
    HUD_TOP + Math.floor((viewport.innerHeight - HUD_TOP - mapPixelHeight) / 2);
  const gridTop = mapTop + TILEMAP_OCEAN_ROWS * tileSize;
  return {
    tileSize,
    gridPixelWidth,
    gridPixelHeight,
    gridLeft,
    gridTop,
    mapTop,
    canvasWidth: viewport.innerWidth,
    canvasHeight: viewport.innerHeight,
  };
}
/** Minimum water level to render a water overlay. */
export const WATER_RENDER_THRESHOLD = 0.15;
/** Weights for randomly selecting 1, 2, or 3 peaks per wave. Index 0 = 1 peak, 1 = 2 peaks, 2 = 3 peaks. */
export const WAVE_PEAK_WEIGHTS = [1, 3, 2];
export const SETTLE_STEPS = 8;

export const TIDE_WAVE_INTERVAL_MS = 10_000;
export const TIDE_BASE_HEIGHT = 2;
export const TIDE_GROWTH_FACTOR = 0.3;
export const TIDE_EXPONENT = 1.3;
