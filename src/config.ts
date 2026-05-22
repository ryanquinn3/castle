export const GRID_WIDTH = 20;
export const GRID_HEIGHT = 20;
export const MAX_ELEVATION = 20;
export const MIN_ELEVATION = -20;

export const CASTLE_COL = 10;
export const CASTLE_ROW = 15;
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
/** Number of waves on level 1. */
export const WAVES_BASE = 1;
/** Additional waves added per level above level 1. waves(N) = WAVES_BASE + (N-1) * WAVES_INCREMENT */
export const WAVES_INCREMENT = 1;

/**
 * Removes direct dependency on window to make this config usable in node
 */
export interface Viewport {
  innerWidth: number;
  innerHeight: number;
}

export interface Layout {
  tileSize: number;
  gridPixelWidth: number;
  gridPixelHeight: number;
  gridLeft: number;
  gridTop: number;
  canvasWidth: number;
  canvasHeight: number;
}

const HUD_TOP = 80;
const HUD_BOTTOM = 50;
const PADDING = 20;

export function computeLayout(viewport: Viewport): Layout {
  const tileSize = Math.max(
    16,
    Math.min(
      36,
      Math.min(
        Math.floor((viewport.innerWidth - PADDING * 2) / GRID_WIDTH),
        Math.floor(
          (viewport.innerHeight - HUD_TOP - HUD_BOTTOM - PADDING * 2) /
            GRID_HEIGHT,
        ),
      ),
    ),
  );
  const gridPixelWidth = GRID_WIDTH * tileSize;
  const gridPixelHeight = GRID_HEIGHT * tileSize;
  const gridLeft = Math.floor((viewport.innerWidth - gridPixelWidth) / 2);
  const gridTop =
    HUD_TOP +
    Math.floor(
      (viewport.innerHeight - HUD_TOP - HUD_BOTTOM - gridPixelHeight) / 2,
    );
  return {
    tileSize,
    gridPixelWidth,
    gridPixelHeight,
    gridLeft,
    gridTop,
    canvasWidth: viewport.innerWidth,
    canvasHeight: viewport.innerHeight,
  };
}
/** Minimum water level to render a water overlay. */
export const WATER_RENDER_THRESHOLD = 0.15;
/** Number of consecutive clean waves required to earn the enhanced shovel. */
export const ENHANCED_SHOVEL_WAVES_REQUIRED = 5;
/** Weights for randomly selecting 1, 2, or 3 peaks per wave. Index 0 = 1 peak, 1 = 2 peaks, 2 = 3 peaks. */
export const WAVE_PEAK_WEIGHTS = [1, 3, 2];
/** Elevation delta per scoop when the enhanced shovel is active. */
export const ENHANCED_SHOVEL_DELTA = 2;
/** Fraction of height difference transferred laterally when adjacent columns differ by more than 1. */
export const LATERAL_SPREAD_FACTOR = 0.3;
/** Minimum height difference between adjacent columns before lateral spreading kicks in. */
export const LATERAL_SPREAD_THRESHOLD = 1;

export const TIDE_WAVE_INTERVAL_MS = 10_000;
export const TIDE_BASE_HEIGHT = 2;
export const TIDE_GROWTH_FACTOR = 0.3;
export const TIDE_EXPONENT = 1.3;
export const TIDE_HIGH_TIDE_WAVE = 30;
