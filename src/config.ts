export const GRID_WIDTH = 16;
export const GRID_HEIGHT = 16;
export const MAX_ELEVATION = 20;
export const MIN_ELEVATION = -20;

export const CASTLE_COL = 7;
export const CASTLE_ROW = 11;
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
export const WAVE_SEGMENT_SURGE_SPEED = 120;
/** Maximum organic front offset, in pixels, applied to actor wave spawn Y. */
export const WAVE_FRONT_NOISE_AMPLITUDE = 16;
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

/** Wall blocking elevation per level (index = level - 1). L1=5, L2=10, L3=15, L4=20. */
export const WALL_LEVEL_ELEVATION = [5, 10, 15, 20];
/** Sand cost to build each wall level (index = level - 1). */
export const WALL_LEVEL_COST = [1, 5, 10, 20];
/** Cumulative max HP per wall level (index = level - 1). 3x elevation per tier, summed. */
export const WALL_LEVEL_HP = [15, 45, 90, 150];
/** Highest wall level. */
export const MAX_WALL_LEVEL = 4;

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
export const TOOLBAR_RESERVED_HEIGHT = 70;

export function computeLayout(viewport: Viewport): Layout {
  const vw = viewport.innerWidth;
  const vh = viewport.innerHeight;
  const clampTile = (t: number) => Math.max(16, Math.min(36, t));
  const widthTile = Math.floor((vw - PADDING * 2) / GRID_WIDTH);
  const tallHeightTile = Math.floor(
    (vh - HUD_TOP - PADDING * 2) / TILEMAP_ROWS,
  );
  const shortHeightTile = Math.floor(
    (vh - HUD_TOP - PADDING * 2 - TOOLBAR_RESERVED_HEIGHT) / TILEMAP_ROWS,
  );
  const tallTile = clampTile(Math.min(widthTile, tallHeightTile));
  const tallMapHeight = TILEMAP_ROWS * tallTile;
  const tallMapTop = HUD_TOP + Math.floor((vh - HUD_TOP - tallMapHeight) / 2);
  const tallSandBottom = tallMapTop + tallMapHeight;
  const fits = tallSandBottom + TOOLBAR_RESERVED_HEIGHT + PADDING <= vh;
  const tileSize = fits
    ? tallTile
    : clampTile(Math.min(widthTile, shortHeightTile));

  const gridPixelWidth = GRID_WIDTH * tileSize;
  const gridPixelHeight = GRID_HEIGHT * tileSize;
  const mapPixelHeight = TILEMAP_ROWS * tileSize;
  const gridLeft = Math.floor((vw - gridPixelWidth) / 2);
  const availableHeight = fits ? vh : vh - TOOLBAR_RESERVED_HEIGHT;
  const mapTop =
    HUD_TOP + Math.floor((availableHeight - HUD_TOP - mapPixelHeight) / 2);
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

/** Pressure-driven water: per-step fraction of head difference moved across an edge (<= 0.25 for stability). */
export const PRESSURE_FLUX_COEFF = 0.2;
/** Depth at or below which a water cell is dropped (its actor killed). */
export const PRESSURE_DRAIN_THRESHOLD = 0.01;
/** Fixed simulation timestep in ms (decoupled from render frame delta). */
export const PRESSURE_SIM_STEP_MS = 1000 / 60;
/** How long the ocean source tap is held open per wave, in ms. */
export const PRESSURE_SURGE_WINDOW_MS = 1500;
/** Pressure-driven water: master flag gating the field simulation path (off by default). */
export const PRESSURE_WATER_ENABLED = false;
