export const GRID_WIDTH = 20;
export const GRID_HEIGHT = 20;
export const MAX_ELEVATION = 10;
export const MIN_ELEVATION = -10;
export const CASTLE_COL = 10;
export const CASTLE_ROW = 13;
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
/** Number of waves on level 1. */
export const WAVES_BASE = 1;
/** Additional waves added per level above level 1. waves(N) = WAVES_BASE + (N-1) * WAVES_INCREMENT */
export const WAVES_INCREMENT = 1;
// Canvas is 800x600. Grid is 20 wide x 20 tall.
// Max tile by width: floor(800/20) = 40
// Max tile by height: floor(600/20) = 30
// Use 20 (consistent with width tile size): 20*20=400 wide, 20*20=400 tall (100px top/bottom padding)
export const TILE_SIZE = 20;
/** Fraction of a column's wave height that bleeds into each adjacent column per row step.
 *  0 = fully column-independent; 1 = instant equalisation. */
export const WAVE_SPREAD_FACTOR = 0.2;
/** Number of consecutive clean waves required to earn the enhanced shovel. */
export const ENHANCED_SHOVEL_WAVES_REQUIRED = 5;
/** Weights for randomly selecting 1, 2, or 3 peaks per wave. Index 0 = 1 peak, 1 = 2 peaks, 2 = 3 peaks. */
export const WAVE_PEAK_WEIGHTS = [1, 3, 2];
/** Elevation delta per scoop when the enhanced shovel is active. */
export const ENHANCED_SHOVEL_DELTA = 2;
