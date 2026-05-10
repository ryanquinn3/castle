export const GRID_WIDTH = 20;
export const GRID_HEIGHT = 20;
export const MAX_ELEVATION = 10;
export const MIN_ELEVATION = -10;
export const CASTLE_COL = 10;
export const CASTLE_ROW = 13;
export const SCOOP_START = 5;
export const SCOOP_INCREMENT = 1;
export const WAVE_HEIGHT_START = 1;
export const WAVE_HEIGHT_INCREMENT = 1;
/** Per-column wave height random deviation (±). Each column's initial height
 *  is clamped to [0, ∞] after applying the variance. */
export const WAVE_HEIGHT_VARIANCE = 1;
/** Row at which the wave stops on level 1 (exclusive upper bound on row index).
 *  E.g. 10 means rows 0–9 are simulated; rows 10–29 are untouched. */
export const WAVE_REACH_START = 10;
/** Additional rows of reach added per level. */
export const WAVE_REACH_INCREMENT = 1;
/** Milliseconds of delay between animating each row of the wave. */
export const WAVE_ROW_DELAY_MS = 120;
/** How many rows the wave center lags behind the outer edges (U-shape depth). */
export const WAVE_U_DEPTH = 4;
/** Number of waves on level 1. */
export const WAVES_BASE = 1;
/** Additional waves added per level above level 1. waves(N) = WAVES_BASE + (N-1) * WAVES_INCREMENT */
export const WAVES_INCREMENT = 1;
// Canvas is 800x600. Grid is 20 wide x 20 tall.
// Max tile by width: floor(800/20) = 40
// Max tile by height: floor(600/20) = 30
// Use 20 (consistent with width tile size): 20*20=400 wide, 20*20=400 tall (100px top/bottom padding)
export const TILE_SIZE = 20;
