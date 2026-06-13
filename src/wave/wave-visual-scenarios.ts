import type { Scene } from "excalibur";
import { GridModel } from "../model/grid-model.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave-segment-types.ts";

/**
 * Shared visual-scenario catalog (S1-S7) for the M5 pressure-water cutover.
 *
 * Each scenario builds a small, readable board on a bare scene and supplies the
 * per-column wave source so the same boards can be rendered by *both* runtimes
 * (legacy WaveActorRuntime and the pressure WaveFieldRuntime) at identical
 * frames. Boards are width 5 / height 16: the terrain slope is 0.5, so a source
 * of depth D travels roughly 2*D rows inland (D=6 -> ~row 12).
 *
 * The module is pure (no rendering, no runtime construction); the capture
 * harness (`wave-visual-capture.browser.test.ts`) owns runtime wiring and
 * screenshots. The adapter helper here is shared so both runtimes see an
 * identical grid view.
 */

export const SCENARIO_WIDTH = 5;
export const SCENARIO_HEIGHT = 16;

/** Pixel layout shared by every scenario (mirrors the field browser tests). */
const SCENARIO_GRID_LEFT = 0;
export const SCENARIO_GRID_TOP = 32;
export const SCENARIO_TILE_SIZE = 16;

/** A bottom-corner castle keeps it out of the wave path for non-castle scenarios. */
const CORNER_CASTLE = {
  castleCol: SCENARIO_WIDTH - 1,
  castleRow: SCENARIO_HEIGHT - 1,
  castleWidth: 1,
  castleHeight: 1,
};

interface WaveVisualScenario {
  id: string;
  /** Human-readable summary of what the board is meant to prove visually. */
  description: string;
  build(scene: Scene): GridModel;
  spawns(): WaveSegmentSpawn[];
}

/** Builds the runtime grid adapter both runtimes consume for a given grid. */
export function scenarioAdapter(grid: GridModel): WaveSegmentGrid {
  return {
    gridLeft: SCENARIO_GRID_LEFT,
    gridTop: SCENARIO_GRID_TOP,
    tileSize: SCENARIO_TILE_SIZE,
    height: SCENARIO_HEIGHT,
    getElevation: (c, r) => grid.getElevation(c, r),
    effectiveHoleDepth: (c, r) => grid.effectiveHoleDepth(c, r),
    isCastle: (c, r) => grid.isCastle(c, r),
  };
}

function buildBoard(
  scene: Scene,
  castle: { castleCol: number; castleRow: number; castleWidth: number; castleHeight: number },
): GridModel {
  return new GridModel(
    {
      width: SCENARIO_WIDTH,
      height: SCENARIO_HEIGHT,
      ...castle,
    },
    scene,
  );
}

/** Per-column source spawns from an explicit depth profile. */
function spawnsFromDepths(depths: number[]): WaveSegmentSpawn[] {
  return depths.map((initialDepth, col) => ({
    col,
    // x/y/speed/maxTravelDistance mirror generateWaveSegmentSpawns so the legacy
    // actor path travels; the field path reads only initialDepth + array length.
    x: SCENARIO_GRID_LEFT + col * SCENARIO_TILE_SIZE + SCENARIO_TILE_SIZE / 2,
    y: SCENARIO_GRID_TOP - 1,
    initialDepth,
    speed: 120,
    maxTravelDistance: 150 + initialDepth * 350,
  }));
}

/** Uniform per-column source across the full board width. */
function uniformSpawns(depth: number): WaveSegmentSpawn[] {
  return spawnsFromDepths(Array.from({ length: SCENARIO_WIDTH }, () => depth));
}

export const WAVE_VISUAL_SCENARIOS: WaveVisualScenario[] = [
  {
    id: "S1",
    description: "Flat ground, uniform source - front shape, depth gradient, recede-to-empty",
    build: (scene) => buildBoard(scene, CORNER_CASTLE),
    spawns: () => uniformSpawns(6),
  },
  {
    id: "S2",
    description: "One tall wall (L4) mid-grid - water flows around, wall cell stays dry",
    build: (scene) => {
      const grid = buildBoard(scene, CORNER_CASTLE);
      // Stack L1->L4 on the centre cell to reach a tall blocking wall.
      grid.placeWall(2, 6, 1);
      grid.placeWall(2, 6, 2);
      grid.placeWall(2, 6, 3);
      grid.placeWall(2, 6, 4);
      return grid;
    },
    spawns: () => uniformSpawns(7),
  },
  {
    id: "S3",
    description: "One low wall (L1) - overtopping reads as water on + past the wall",
    build: (scene) => {
      const grid = buildBoard(scene, CORNER_CASTLE);
      grid.placeWall(2, 6, 1);
      return grid;
    },
    spawns: () => uniformSpawns(7),
  },
  {
    id: "S4",
    description: "A hole/trench - pooling fill, puddle depth, finite capacity",
    build: (scene) => {
      const grid = buildBoard(scene, CORNER_CASTLE);
      // Dig a 3-deep trench across the middle (negative delta -> Hole terrain).
      grid.setElevation(1, 6, -3);
      grid.setElevation(2, 6, -3);
      grid.setElevation(3, 6, -3);
      return grid;
    },
    spawns: () => uniformSpawns(6),
  },
  {
    id: "S5",
    description: "Wall + tower in the path - erosion: terrain swaps, eroded flash fires",
    build: (scene) => {
      const grid = buildBoard(scene, CORNER_CASTLE);
      grid.placeWall(1, 5, 1); // L1 wall, erodible by a strong head
      grid.placeWall(1, 5, 2); // -> L2 (taller, still erodible over many hits)
      grid.placeTower(3, 6); // fixed height-15 tower in the path
      return grid;
    },
    spawns: () => uniformSpawns(9),
  },
  {
    id: "S6",
    description: "Castle in the path, strong source - castle-flood loss visual",
    build: (scene) =>
      buildBoard(scene, { castleCol: 2, castleRow: 11, castleWidth: 1, castleHeight: 1 }),
    spawns: () => uniformSpawns(9),
  },
  {
    id: "S7",
    description: "Multi-peak uneven source [6,1,6,1,6] - waves arrive unevenly across columns",
    build: (scene) => buildBoard(scene, CORNER_CASTLE),
    spawns: () => spawnsFromDepths([6, 1, 6, 1, 6]),
  },
];
