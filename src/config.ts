export const GRID_WIDTH = 16;
export const GRID_HEIGHT = 16;
export const MAX_ELEVATION = 10;
export const MIN_ELEVATION = -10;


export const CASTLE_COL = 8;
export const CASTLE_ROW = 12;
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
export const WAVE_ROW_DELAY_MS = 120;
/** Milliseconds of delay between each row of the recede animation. Slightly faster than advance for drain feel. */
export const WAVE_RECEDE_ROW_DELAY_MS = 90;
/** Number of waves on level 1. */
export const WAVES_BASE = 1;
/** Additional waves added per level above level 1. waves(N) = WAVES_BASE + (N-1) * WAVES_INCREMENT */
export const WAVES_INCREMENT = 1;
// HUD zones: top strip holds scoop/wave/state labels; bottom strip holds Send Wave button.
const _hudTop = 80;
const _hudBottom = 50;
const _padding = 20;
// Tile size fills the remaining space, clamped to [16, 36].
export const TILE_SIZE = Math.max(
  16,
  Math.min(
    36,
    Math.min(
      Math.floor((window.innerWidth - _padding * 2) / GRID_WIDTH),
      Math.floor(
        (window.innerHeight - _hudTop - _hudBottom - _padding * 2) /
          GRID_HEIGHT,
      ),
    ),
  ),
);
// Grid pixel dimensions and top-left origin, derived from tile size.
export const GRID_PIXEL_WIDTH = GRID_WIDTH * TILE_SIZE;
export const GRID_PIXEL_HEIGHT = GRID_HEIGHT * TILE_SIZE;
export const GRID_LEFT = Math.floor((window.innerWidth - GRID_PIXEL_WIDTH) / 2);
export const GRID_TOP =
  _hudTop +
  Math.floor(
    (window.innerHeight - _hudTop - _hudBottom - GRID_PIXEL_HEIGHT) / 2,
  );
/** Number of equalization steps to run after each row injection. More steps = more lateral spread per row. */
export const FLOW_EQUALIZATION_STEPS = 4;
/** Fraction of water level differential that flows to a neighbor per equalization step. */
export const FLOW_RATE = 0.25;
/** Momentum decays by this factor each equalization step. 0 = instant stop, 1 = no decay. */
export const MOMENTUM_DECAY = 0.8;
/** Fraction of momentum that transfers to perpendicular axes when water hits a wall. */
export const MOMENTUM_REDIRECT_FACTOR = 0.6;
/** Pressure increments by this amount per equalization step when a cell has no outflow. */
export const PRESSURE_BUILDUP_RATE = 0.3;
/** Pressure is added to effective water level when checking if water can overtop a wall. */
export const PRESSURE_OVERTOP_FACTOR = 0.5;
/** Minimum water level to consider a cell "wet" (avoids float dust). */
export const FLOW_MIN_WATER = 0.01;
/** Number of consecutive clean waves required to earn the enhanced shovel. */
export const ENHANCED_SHOVEL_WAVES_REQUIRED = 5;
/** Weights for randomly selecting 1, 2, or 3 peaks per wave. Index 0 = 1 peak, 1 = 2 peaks, 2 = 3 peaks. */
export const WAVE_PEAK_WEIGHTS = [1, 3, 2];
/** Elevation delta per scoop when the enhanced shovel is active. */
export const ENHANCED_SHOVEL_DELTA = 2;

export const CANVAS_WIDTH = window.innerWidth;
export const CANVAS_HEIGHT = window.innerHeight;
