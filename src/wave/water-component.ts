import { Component, Vector } from "excalibur";

export interface WaterComponentInit {
  depth: number;
  vel?: Vector;
  col?: number;
  row?: number;
}

/**
 * Per-cell water state for the pressure-driven simulation: the single source of
 * truth for one water cell's grid coordinate, depth, and velocity. The only
 * contract between WaveDynamicSystem (writes) and WaveRenderSystem (reads, M2b).
 */
export class WaterComponent extends Component {
  depth: number;
  vel: Vector;
  col: number;
  row: number;

  constructor(init: WaterComponentInit) {
    super();
    this.depth = init.depth;
    this.vel = init.vel ?? new Vector(0, 0);
    this.col = init.col ?? 0;
    this.row = init.row ?? 0;
  }
}
