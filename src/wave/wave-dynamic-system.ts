import { System, SystemType, Vector, type EventEmitter, type Scene } from "excalibur";
import {
  PRESSURE_DRAIN_THRESHOLD,
  PRESSURE_FLUX_COEFF,
  PRESSURE_INERTIA_COEFF,
  PRESSURE_RECEDE_COEFF,
  PRESSURE_SEEP_RATE_PER_MS,
  PRESSURE_SIM_STEP_MS,
  PRESSURE_SURGE_WINDOW_MS,
} from "../config.ts";
import { WaterComponent } from "./water-component.ts";
import { WaterCell } from "./water-cell.ts";

export interface WetCell {
  col: number;
  row: number;
  depth: number;
  velX: number;
  velY: number;
}

/**
 * Events broadcast by the pressure-water field. `WaterCellAdded` fires when a
 * dry cell first becomes wet (a WaterCell is spawned into the scene). Because the
 * system kills and re-spawns cells as water sloshes, the same grid cell may
 * announce itself more than once over a wave; consumers should treat it as
 * "cell became wet (possibly again)", not a strict first-touch.
 */
export interface WaterFieldEvents {
  WaterCellAdded: { col: number; row: number };
}

export interface FluxStepInput {
  cells: WetCell[];
  width: number;
  height: number;
  /** Ground elevation = beach slope + raw terrain offset. */
  groundAt: (col: number, row: number) => number;
  /** Row-0 tap: while open, column `col` of row 0 is pinned to at least `depths[col]`. */
  source: { open: boolean; depths: number[] };
  /** When true, the border north of row 0 is the ocean sink (head 0, outflow discarded). */
  oceanSink: boolean;
  /** Per-step fraction of head difference moved across an edge (<= 0.25). */
  coeff: number;
  /** Cells at or below this depth are dropped. */
  drainThreshold: number;
  /**
   * Momentum coefficient: fraction of each cell's carried velocity (its outward
   * component along an edge) added to that edge's desired outflow. Defaults to 0,
   * which makes the kernel pure first-order pressure relaxation (legacy behavior,
   * carried velocity ignored). See PRESSURE_INERTIA_COEFF.
   */
  inertiaCoeff?: number;
}

const DIRS = [
  { dc: -1, dr: 0 },
  { dc: 1, dr: 0 },
  { dc: 0, dr: -1 },
  { dc: 0, dr: 1 },
];

/**
 * One fixed simulation tick: a two-pass, mass-conserving, non-negative flux over
 * a sparse set of wet cells. Pure — no Excalibur, no shared state — so the
 * stability and reach invariants are unit-testable on plain data. Returns the
 * next set of wet cells (cells that drain below the threshold are omitted; dry
 * neighbors that gain enough depth appear).
 */
export function computeFluxStep(input: FluxStepInput): WetCell[] {
  const { cells, width, height, groundAt, source, oceanSink, coeff, drainThreshold } = input;
  const inertiaCoeff = input.inertiaCoeff ?? 0;
  const key = (col: number, row: number): number => row * width + col;
  const inBounds = (col: number, row: number): boolean =>
    col >= 0 && col < width && row >= 0 && row < height;

  const depth = new Map<number, number>();
  const carriedVelX = new Map<number, number>();
  const carriedVelY = new Map<number, number>();
  for (const cell of cells) {
    const k = key(cell.col, cell.row);
    depth.set(k, cell.depth);
    carriedVelX.set(k, cell.velX);
    carriedVelY.set(k, cell.velY);
  }
  if (source.open) {
    for (let col = 0; col < width; col++) {
      const k = key(col, 0);
      depth.set(k, Math.max(depth.get(k) ?? 0, source.depths[col] ?? 0));
    }
  }

  const head = (col: number, row: number): number =>
    groundAt(col, row) + (depth.get(key(col, row)) ?? 0);

  const delta = new Map<number, number>();
  const velX = new Map<number, number>();
  const velY = new Map<number, number>();
  const bump = (map: Map<number, number>, k: number, v: number): void => {
    map.set(k, (map.get(k) ?? 0) + v);
  };

  for (const [k, d] of depth) {
    const col = k % width;
    const row = Math.floor(k / width);
    const h = groundAt(col, row) + d;

    const cvx = carriedVelX.get(k) ?? 0;
    const cvy = carriedVelY.get(k) ?? 0;

    const desired: number[] = [];
    let sum = 0;
    for (const { dc, dr } of DIRS) {
      const nc = col + dc;
      const nr = row + dr;
      let neighborHead: number;
      let open: boolean;
      if (inBounds(nc, nr)) {
        neighborHead = head(nc, nr);
        open = true;
      } else if (nr < 0 && oceanSink) {
        neighborHead = 0;
        open = true;
      } else {
        neighborHead = Number.POSITIVE_INFINITY;
        open = false;
      }
      const pressureOut = Math.max(0, h - neighborHead) * coeff;
      // Momentum: the outward component of the carried velocity along this edge.
      // Only push through edges that are open (a wall/border absorbs no momentum).
      const momentum = open ? Math.max(0, cvx * dc + cvy * dr) * inertiaCoeff : 0;
      const out = pressureOut + momentum;
      desired.push(out);
      sum += out;
    }

    const scale = sum > d ? d / sum : 1;
    for (let i = 0; i < DIRS.length; i++) {
      const out = desired[i] * scale;
      if (out <= 0) {
        continue;
      }
      const { dc, dr } = DIRS[i];
      const nc = col + dc;
      const nr = row + dr;
      bump(delta, k, -out);
      if (inBounds(nc, nr)) {
        bump(delta, key(nc, nr), out);
      }
      bump(velX, k, dc * out);
      bump(velY, k, dr * out);
    }
  }

  const result: WetCell[] = [];
  // Row-0 keys are already present in depth.keys() (pinned in Pass 1 above), so
  // no extra loop is needed here.
  const keys = new Set<number>([...depth.keys(), ...delta.keys()]);
  for (const k of keys) {
    const col = k % width;
    const row = Math.floor(k / width);
    let nd = Math.max(0, (depth.get(k) ?? 0) + (delta.get(k) ?? 0));
    if (source.open && row === 0) {
      // Dirichlet boundary: reapply the per-column source pin after flux so the
      // row-0 head stays at source.depths[col] even if flux drained it this step.
      nd = Math.max(nd, source.depths[col] ?? 0);
    }
    if (nd <= drainThreshold) {
      continue;
    }
    result.push({
      col,
      row,
      depth: nd,
      velX: velX.get(k) ?? 0,
      velY: velY.get(k) ?? 0,
    });
  }
  return result;
}

export interface WaveDynamicSystemOptions {
  scene: Scene;
  width: number;
  height: number;
  sourceDepths: number[];
  groundAt: (col: number, row: number) => number;
  gridLeft: number;
  gridTop: number;
  tileSize: number;
  surgeWindowMs?: number;
  /** Flux coeff during recede (source closed); defaults to PRESSURE_RECEDE_COEFF. */
  recedeCoeff?: number;
  /** Shared field emitter forwarded to each spawned WaterCell for WaterCellAdded. */
  events?: EventEmitter<WaterFieldEvents>;
  /**
   * Optional per-frame terrain feedback. Receives the resolved cell set, may
   * return a rewritten set (e.g. hole absorption removed water) and `done: true`
   * to end the wave immediately (e.g. castle flood).
   */
  onResolveCells?: (cells: WetCell[]) => { cells: WetCell[]; done: boolean };
  onComplete?: () => void;
}

/**
 * Owns the pressure-driven simulation. Each fixed sim step it reads the live
 * WaterComponents, runs computeFluxStep, and reconciles the result onto scene
 * actors (update existing / spawn new WaterCells / kill drained ones). Reads the
 * query once per frame and reconciles once per frame, so deferred entity
 * add/remove never desyncs intermediate sub-steps.
 */
export class WaveDynamicSystem extends System {
  readonly systemType = SystemType.Update;
  static priority = -1;

  private readonly query;
  private accumulatorMs = 0;
  private simTimeMs = 0;
  private sourceOpen = true;
  private completed = false;

  constructor(private readonly opts: WaveDynamicSystemOptions) {
    super();
    this.query = opts.scene.world.query([WaterComponent]);
  }

  update(elapsed: number): void {
    if (this.completed) {
      return;
    }
    this.accumulatorMs = Math.min(this.accumulatorMs + elapsed, PRESSURE_SIM_STEP_MS * 8);
    if (this.accumulatorMs < PRESSURE_SIM_STEP_MS) {
      return;
    }

    const surgeMs = this.opts.surgeWindowMs ?? PRESSURE_SURGE_WINDOW_MS;
    let cells = this.readCells();
    while (this.accumulatorMs >= PRESSURE_SIM_STEP_MS) {
      if (this.sourceOpen && this.simTimeMs >= surgeMs) {
        this.sourceOpen = false;
      }
      // Drain slower than the surge: the slope + ocean sink would otherwise snap
      // the water out far faster than it advanced.
      const coeff = this.sourceOpen
        ? PRESSURE_FLUX_COEFF
        : this.opts.recedeCoeff ?? PRESSURE_RECEDE_COEFF;
      cells = computeFluxStep({
        cells,
        width: this.opts.width,
        height: this.opts.height,
        groundAt: this.opts.groundAt,
        source: { open: this.sourceOpen, depths: this.opts.sourceDepths },
        oceanSink: true,
        coeff,
        drainThreshold: PRESSURE_DRAIN_THRESHOLD,
        inertiaCoeff: PRESSURE_INERTIA_COEFF,
      });
      this.accumulatorMs -= PRESSURE_SIM_STEP_MS;
      this.simTimeMs += PRESSURE_SIM_STEP_MS;
    }

    let done = false;
    if (this.opts.onResolveCells) {
      const resolved = this.opts.onResolveCells(cells);
      cells = resolved.cells;
      done = resolved.done;
    }

    this.reconcile(cells);

    if (!this.completed && (done || (!this.sourceOpen && cells.length === 0))) {
      this.completed = true;
      this.opts.onComplete?.();
    }
  }

  /**
   * Environmental seepage (the sand absorbing standing water), applied only during
   * recede. Runs per render frame, after update() — so applyTerrainFeedback has
   * already pulled any filling hole's surface water into puddleDepth this frame.
   * That ordering is load-bearing: it means a universal decrement never steals
   * water from an actively-filling hole (it has no live surface cell left), only
   * from flat ground / full holes / wall-enclosed basins. Trapped basin water has
   * no flux sink, so this is what lets the wave terminate; the next update()'s
   * flux step drops any cell this pushes below the drain threshold.
   */
  postupdate(_scene: Scene, elapsed: number): void {
    if (this.completed || this.sourceOpen) {
      return;
    }
    const seep = PRESSURE_SEEP_RATE_PER_MS * elapsed;
    if (seep <= 0) {
      return;
    }
    for (const entity of this.query.entities) {
      const water = entity.get(WaterComponent)!;
      water.depth = Math.max(0, water.depth - seep);
    }
  }

  private readCells(): WetCell[] {
    const cells: WetCell[] = [];
    for (const entity of this.query.entities) {
      const w = entity.get(WaterComponent)!;
      cells.push({ col: w.col, row: w.row, depth: w.depth, velX: w.vel.x, velY: w.vel.y });
    }
    return cells;
  }

  private reconcile(cells: WetCell[]): void {
    const actorByKey = new Map<string, WaterCell>();
    for (const entity of this.query.entities) {
      if (!(entity instanceof WaterCell)) {
        continue;
      }
      const w = entity.get(WaterComponent)!;
      actorByKey.set(`${w.col}:${w.row}`, entity);
    }

    const nextKeys = new Set<string>();
    for (const cell of cells) {
      const k = `${cell.col}:${cell.row}`;
      nextKeys.add(k);
      const existing = actorByKey.get(k);
      if (existing) {
        existing.water.depth = cell.depth;
        existing.water.vel = new Vector(cell.velX, cell.velY);
      } else {
        const actor = new WaterCell({
          col: cell.col,
          row: cell.row,
          depth: cell.depth,
          vel: new Vector(cell.velX, cell.velY),
          gridLeft: this.opts.gridLeft,
          gridTop: this.opts.gridTop,
          tileSize: this.opts.tileSize,
        });
        this.opts.scene.add(actor);
        actorByKey.set(k, actor);
        this.opts.events?.emit("WaterCellAdded", { col: cell.col, row: cell.row });
      }
    }

    for (const [k, actor] of actorByKey) {
      if (!nextKeys.has(k)) {
        actor.kill();
      }
    }
  }

  /** Kill every live water actor (teardown, used by M2b's runtime). */
  clear(): void {
    for (const entity of this.query.entities) {
      if (!(entity instanceof WaterCell)) {
        continue;
      }
      entity.kill();
    }
  }
}
