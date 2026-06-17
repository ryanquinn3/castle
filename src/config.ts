export const GRID_WIDTH = 16;
export const GRID_HEIGHT = 18;
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
/** Maximum organic front offset, in pixels, applied to wave spawn Y. */
export const WAVE_FRONT_NOISE_AMPLITUDE = 16;
/** Frequency used by the deterministic wave front noise helper. */
export const WAVE_FRONT_NOISE_FREQUENCY = 0.2;
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

export const TILEMAP_ROWS = 19;
export const TILEMAP_OCEAN_ROWS = 1;

/** Fixed logical tile size in pixels. The stage uses native 1:1 tiles; FitScreen scales to fill the window. */
export const TILE_SIZE = 16;
/** Left edge of the grid in stage-local coordinates. */
export const GRID_LEFT = 0;
/** Top edge of the Tiled tilemap in stage-local coordinates. */
export const MAP_TOP = 0;
/** Top edge of the playfield grid rows (below the ocean strip). */
export const GRID_TOP = TILEMAP_OCEAN_ROWS * TILE_SIZE;
/** Width of the grid in pixels (stage-local). */
export const GRID_PIXEL_WIDTH = GRID_WIDTH * TILE_SIZE;
/**
 * Height of the grid in pixels (stage-local).
 * @lintignore available for layout consumers; not yet wired to a specific component
 */
export const GRID_PIXEL_HEIGHT = GRID_HEIGHT * TILE_SIZE;
/** Logical width of the stage (same as the grid width at native tile size). */
export const STAGE_WIDTH = GRID_WIDTH * TILE_SIZE;
/** Logical height of the stage: full tilemap at native tile size. */
export const STAGE_HEIGHT = TILEMAP_ROWS * TILE_SIZE;
/** Weights for randomly selecting 1, 2, or 3 peaks per wave. Index 0 = 1 peak, 1 = 2 peaks, 2 = 3 peaks. */
export const WAVE_PEAK_WEIGHTS = [1, 3, 2];

export const TIDE_WAVE_INTERVAL_MS = 10_000;
export const TIDE_BASE_HEIGHT = 2;
export const TIDE_GROWTH_FACTOR = 0.3;
export const TIDE_EXPONENT = 1.3;

/** Pressure-driven water: per-step fraction of head difference moved across an edge (<= 0.25 for stability). */
export const PRESSURE_FLUX_COEFF = 0.18;
/**
 * Flux coefficient once the source closes (the recede phase). Lower than the
 * surge coeff so water drains back to the ocean more slowly than it advanced:
 * the slope + ocean sink make an unchecked drain snap out far faster than the
 * surge. Feel knob; must stay <= 0.25 for stability.
 */
export const PRESSURE_RECEDE_COEFF = 0.08;
/**
 * Momentum/inertia coefficient for the flux kernel. Each cell carries a velocity
 * (net flux) frame-to-frame; this is the fraction of that carried velocity's
 * outward component added to the desired per-edge outflow, so water keeps moving
 * in its established direction instead of relaxing purely on the pressure
 * gradient. 0 = pure first-order pressure relaxation (legacy). Higher = more
 * sustained advance and a more natural swash/recede, at the cost of stability.
 *
 * The carried velocity is the previous step's net flux, so momentum decays
 * geometrically (~inertiaCoeff per step) once a cell stops being fed — it cannot
 * coast forever, and a blocked face produces ~0 net flux so the momentum term
 * self-extinguishes at obstacles instead of ringing. The total-outflow clamp
 * (outflow <= depth) keeps mass conservation and non-negativity for any value.
 * Empirically 0.5 keeps the closed-box spread symmetric and checkerboard-free
 * (with only a small, bounded, decaying ripple at the advancing front); values
 * approaching 1 push the per-edge momentum term toward the 0.25 stability bound
 * the pressure coeff already lives under. Feel knob.
 */
export const PRESSURE_INERTIA_COEFF = 0.55;
/** Depth at or below which a water cell is dropped (its actor killed). */
export const PRESSURE_DRAIN_THRESHOLD = 0.01;
/**
 * Recede-phase seepage: depth removed per millisecond from every resting water
 * cell once the source closes, representing the sand absorbing standing water.
 * Applied per render frame (scaled by elapsed) in WaveDynamicSystem.postupdate,
 * so it is frame-rate independent. Its real job is termination: water trapped in
 * a wall-enclosed basin has no flux sink, so without this the wave phase hangs
 * (see docs/bugs/2026-06-14-trapped-water-never-drains.md). It is negligible for
 * flowing water (flux removes far more) and decisive only where flux is absent.
 * A depth-2 basin drains in ~2 / rate ms (~1.7s at 0.0012). Feel/tuning knob.
 */
export const PRESSURE_SEEP_RATE_PER_MS = 0.0012;
/** Fixed simulation timestep in ms (decoupled from render frame delta). */
export const PRESSURE_SIM_STEP_MS = 1000 / 60;
/** How long the ocean source tap is held open per wave, in ms. */
export const PRESSURE_SURGE_WINDOW_MS = 1500;
/** Depth on a castle cell at or above which the castle counts as flooded (wave ends as a loss). Tuning knob. */
export const PRESSURE_CASTLE_FLOOD_DEPTH = 0.5;
/** Pressure erosion: charge per unit of flux driven straight into a wall/tower face. Feel knob. */
export const PRESSURE_EROSION_FRONTAL_COEFF = 1.5;
/** Pressure erosion: charge per unit of flux running parallel past a face (glancing/shear, << frontal). Feel knob. */
export const PRESSURE_EROSION_SHEAR_COEFF = 0.05;
/**
 * Pressure erosion: depth-driven hydrostatic term. Each step, blocked water
 * above a wall/tower face contributes this fraction of its depth as erosion
 * charge, modelling the sustained pressure of standing water pushing into the
 * structure rather than purely dynamic flux impacts.
 */
export const PRESSURE_EROSION_HYDROSTATIC_COEFF = 0.05;
/** Speed (hypot of velX/velY) below which a cell is considered "at rest" for settle detection. */
export const PRESSURE_SETTLE_VELOCITY_EPSILON = 0.02;
/** Number of consecutive frames the field must be settled before the wave ends. */
export const PRESSURE_SETTLE_STABLE_STEPS = 5;
/** Max recede phase duration in ms; wave ends if water hasn't drained after this long. */
export const PRESSURE_MAX_RECEDE_MS = 8000;
