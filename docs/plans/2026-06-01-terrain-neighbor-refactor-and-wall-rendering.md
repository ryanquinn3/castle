# Terrain neighbor refactor + contiguous wall rendering

Date: 2026-06-01

## Goal

Render walls as a contiguous mass in the cardinal directions (runs, corners, T-junctions, crosses read as one solid structure) instead of independent per-tile sprites. Reach this in two sequenced phases:

1. **Refactor** the model so every `Terrain` instance knows its cardinal neighbors.
2. **Implement** the new wall rendering on top of that knowledge.

The visual target was locked via prototype (`.tmp/wall-mass-proto.html`): flat / top-down, full-tile per-tier texture with seamless interiors, and the *perimeter* (exposed edges) carrying the definition.

## Supersedes the sprite-autotile plan

`docs/plans/2026-05-31-autotile-system.md` proposed a **sprite-based** 16-variant autotile (4-bit neighbor mask, height-proportional per-tier sprites). That approach is the source of the "tier 1 trimmed on height" problem and requires authoring ~16 seamless variants per tier - the art burden that has been the main blocker. **This plan replaces the sprite approach with procedural `customDraw` rendering** (connectivity computed, not authored), which guarantees seamless joins by construction and needs only 4 flat tileable textures.

Two ideas carried over from that plan:

- **`Terrain.connectsTo(other: Terrain | null): boolean`** - a domain method for the connectivity decision instead of inline `instanceof` checks. `Wall` and `Tower` connect to each other and themselves; `FlatGround`/`Hole`/`null` do not.
- **Cross-type wall<->tower connectivity** (confirmed again today).

## Locked visual parameters (from prototype)

Single light source from the **north**:

- `bevelStrength: 0.58` (north edge highlight, south edge shadow at 0.85x)
- `bevelWidthPx: 3`
- `cornerRadiusPx: 10` (rounded only on outer convex corners)
- `dropShadow: 0.24` (south sliver only, cast with the wall's rounded-rect path offset straight down)
- `outlineDarkness: 0.34` (all exposed edges)
- crenellations: off for now
- Per-tier material textures sampled from `public/images/wall-level-1..4.png`. **Tier 4 texture needs rework** (flagged during review).

---

## Phase 1 - Neighbor refactor (model only, no behavior change)

Generalizes the one bespoke case that already exists: `detectPools()` writes `cell.neighbors` (`PoolNeighborFlags`) onto each `Hole` after every mutation. We replace that with a robust, lazy mechanism used by all terrain.

### Why lazy lookup (not cached refs)

Cells are *replaced*, not mutated, on type changes: `applyDelta` returns a new instance (flat->wall, wall->hole), and `setElevation`/`placeTower`/`applyErosion`/`reset` reassign `cells[row][col]`. Cached neighbor refs would go stale on every adjacent type change, and there are gaps already (e.g. `placeTower` skips `detectPools`). Live lookup is correct-by-construction.

### Design

`src/model/terrain.ts`:

```ts
export type Neighbors = {
  north: Terrain | null;
  south: Terrain | null;
  east: Terrain | null;
  west: Terrain | null;
};

// Grid owns the n/s/e/w direction arithmetic + bounds.
export interface NeighborGrid {
  neighborsOf(col: number, row: number): Neighbors;
}

const NO_NEIGHBORS: Neighbors = { north: null, south: null, east: null, west: null };

// On Terrain base class:
//   private grid: NeighborGrid | null = null;
//   col = -1; row = -1;
//   attach(grid: NeighborGrid, col: number, row: number): void { this.grid = grid; this.col = col; this.row = row; }
//   get neighbors(): Neighbors { return this.grid?.neighborsOf(this.col, this.row) ?? NO_NEIGHBORS; }
```

`src/model/grid-model.ts`:

- Implement `NeighborGrid.neighborsOf(col,row)`: returns each direction via a private helper that yields `null` when out of bounds (edge = "no neighbor"), otherwise `this.cells[r][c]`. (Distinct from `getCell`, which returns a transient `FlatGround` for OOB.)
- Add a private `setCell(col,row,terrain)` choke point that calls `terrain.attach(this,col,row)` then assigns `this.cells[row][col]`. Route **every** assignment through it: `makeFlatGrid`, `setElevation`, `placeTower`, `applyErosion`, `reset`. (Audited: these are the only assignment sites - `tools/replay-wave.ts` builds cells outside the model but uses them for wave simulation only, never rendering/neighbors, so it needs no change.)
- In `detectPools()`, delete the block that writes `cell.neighbors` (current lines ~323-335). Pool detection itself stays (absorption logic depends on it).
- Remove `getPoolNeighbors()` and the `PoolNeighbors` interface once no caller remains.

`src/model/terrain.ts` - `Hole`:

- Adjacent holes are always in the same pool (pools are a flood-fill over adjacent holes), so `neighbor instanceof Hole` is exactly equivalent to today's pool-membership flag. `Hole.getRenderInfo()` derives its edge flags from `this.neighbors` (e.g. `top = this.neighbors.north instanceof Hole`). Remove the `neighbors: PoolNeighborFlags` field.

### Rendering plumbing (decouples view from neighbor computation)

- Add optional `cacheKey?: string` to `TileRenderInfo`. Each terrain computes its own key from elevation/puddle + a neighbor bitmask. `tile.ts` uses `info.cacheKey` instead of building the key from a `neighbors` arg.
- `customDraw` no longer needs a `neighbors` parameter threaded from the view - it reads `this.neighbors` on the terrain. Simplify `Tile.updateVisual` and `GridView.refreshTileVisual` accordingly (drop the `getPoolNeighbors` call).

### Verification (Phase 1)

- Rendering output is unchanged (holes derive identical flags), so **Playwright visual baselines must stay green** - that is the proof the refactor is behavior-preserving.
- Add unit tests: `GridModel.neighborsOf` (bounds -> null, correct instances) and `Terrain.neighbors` after mutations that replace instances (flat->wall->hole, erosion to flat, tower placement).
- `node --run lint && node --run build && node --run test:unit` all green before moving on.

---

## Phase 2 - Contiguous wall rendering

Depends on Phase 1.

- `src/resources.ts`: add `WallLevel1..4` `ImageSource`s for the per-tier textures and register in `loader`.
- `Terrain.connectsTo(other)`: add as an abstract/base method (see "Supersedes" above). `Wall`/`Tower` return true for `Wall`/`Tower`; default false.
- `Wall.getRenderInfo()`: switch from sprite+tint to `customDraw` using the locked parameters. An edge is **connected** when `this.connectsTo(this.neighbors.<dir>)`. Connected edges fill flush (no bevel/outline); exposed edges get outline + north/south bevel + rounded outer corners + south drop shadow. Tier from the existing `tierIndex` buckets (1-5, 6-10, 11-15, 16-20) selects the texture.
- Decide rendering architecture (open question, see below): per-tile cached canvases vs a single grid-level wall overlay.
- Rework the tier-4 texture.
- Retire `wall-spritesheet.png` / `getWallSpriteSheet()` once unused.
- Update Playwright baselines intentionally; update `docs/gameplay.md` and `AGENTS.md` core-files notes.

### Open implementation question (decide at start of Phase 2)

The prototype drew the whole grid on one canvas, which made two effects trivial that are awkward with per-tile cached graphics:

1. **Texture continuity across tiles** - the pattern was anchored to one canvas. Per-tile canvases reset the pattern origin; we'd need to offset the pattern by `(col,row)*TILE_SIZE mod swatchSize` per tile, so `customDraw` must receive the tile's grid position.
2. **Drop shadow spilling onto the sand tile below** - cross-tile draw isn't possible inside a per-tile canvas clipped to `TILE_SIZE`.

Options: (a) keep per-tile actors and approximate (pass col/row for pattern offset; draw the shadow inside the wall's own bottom edge), or (b) add a single grid-overlay wall renderer drawn from model state like the prototype. To be chosen when Phase 2 starts; does not affect Phase 1.

---

## Risks / audit items

- **All cell-construction sites must route through `setCell`/`attach`** or those cells have `grid = null` and silently report no neighbors. Audited: only `GridModel`'s own assignments matter (`tools/replay-wave.ts` is wave-sim only, no rendering). Keep this in mind if a serialized-board loader is added later.
- `cacheKey` must include everything that affects the draw (elevation, puddle, neighbor bitmask) or tiles will render stale from the cache.

