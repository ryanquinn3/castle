export interface WetCell {
  col: number;
  row: number;
  depth: number;
  velX: number;
  velY: number;
}

export interface FluxStepInput {
  cells: WetCell[];
  width: number;
  height: number;
  /** Ground elevation = beach slope + raw terrain offset. */
  groundAt: (col: number, row: number) => number;
  /** Row-0 tap: while open, row 0 is pinned to at least `depth`. */
  source: { open: boolean; depth: number };
  /** When true, the border north of row 0 is the ocean sink (head 0, outflow discarded). */
  oceanSink: boolean;
  /** Per-step fraction of head difference moved across an edge (<= 0.25). */
  coeff: number;
  /** Cells at or below this depth are dropped. */
  drainThreshold: number;
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
  const key = (col: number, row: number): number => row * width + col;
  const inBounds = (col: number, row: number): boolean =>
    col >= 0 && col < width && row >= 0 && row < height;

  const depth = new Map<number, number>();
  for (const cell of cells) {
    depth.set(key(cell.col, cell.row), cell.depth);
  }
  if (source.open) {
    for (let col = 0; col < width; col++) {
      const k = key(col, 0);
      depth.set(k, Math.max(depth.get(k) ?? 0, source.depth));
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

    const desired: number[] = [];
    let sum = 0;
    for (const { dc, dr } of DIRS) {
      const nc = col + dc;
      const nr = row + dr;
      let neighborHead: number;
      if (inBounds(nc, nr)) {
        neighborHead = head(nc, nr);
      } else if (nr < 0 && oceanSink) {
        neighborHead = 0;
      } else {
        neighborHead = Number.POSITIVE_INFINITY;
      }
      const out = Math.max(0, h - neighborHead) * coeff;
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
      // Dirichlet boundary: reapply the source pin after flux so the row-0 head
      // stays at source.depth even if flux drained it within this step.
      nd = Math.max(nd, source.depth);
    }
    // Frontier cells (positive inflow) use 1e-9 so new wavefront cells survive below drainThreshold and can accumulate.
    const hasInflow = (delta.get(k) ?? 0) > 0;
    const cutoff = hasInflow ? 1e-9 : drainThreshold;
    if (nd <= cutoff) {
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
