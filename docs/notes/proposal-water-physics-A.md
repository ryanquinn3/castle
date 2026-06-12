# Proposal A: Local Pressure-Based Lateral Spreading

## 1. High-Level Approach

Add a per-frame pressure equalization pass that runs across all active `WaveSegment` actors within the same row. Each tick, the runtime builds a spatial index of segments by `(col, row)`, computes pressure differentials between neighboring cells, and transfers depth from high-pressure cells to low-pressure or dry neighbors. Transfers can spawn new segments (bounded by a pool) or adjust depth on existing neighbors.

Key principles:

- Pressure is local: each wet cell only considers its immediate left/right neighbors in the same row (no vertical backflow for now).
- Transfers are damped and conserve total depth (minus a configurable friction loss).
- New segment creation is bounded by a pool managed by the runtime.
- Existing vertical surge/recession mechanics remain the primary wave driver; pressure is a secondary redistribution layer.
- All pressure-spawned segments are registered with `WaveActorRuntime` for event accounting and cleanup.

## 2. Pressure Calculation and Lateral Spreading

### 2.1 Effective Surface Level

For each wet cell at `(col, row)`, define its **effective surface level**:

```
surfaceLevel(col, row) = terrain_elevation(col, row) + segment.currentDepth
```

Where `terrain_elevation` comes from `WaveSegmentGrid.getElevation(col, row)`:
- Positive elevation (wall/tower): adds to surface level.
- Negative elevation (hole): the floor is lower, so surface = elevation + depth (elevation is negative, so a hole with depth 3 at elevation -2 has surface = 1).
- Zero (flat): surface = depth.

### 2.2 Pressure Differential

For two adjacent cells `A` and `B` in the same row:

```
pressureDiff = surfaceLevel(A) - surfaceLevel(B)
```

Transfer occurs when `|pressureDiff| > PRESSURE_THRESHOLD` (suggested: 0.3). The amount transferred per tick:

```
transfer = clamp(pressureDiff * SPREAD_RATE * (deltaMs / 1000), 0, donor.currentDepth * MAX_TRANSFER_FRACTION)
```

Where:
- `SPREAD_RATE`: tunable rate constant (suggested starting point: 2.0). Higher = faster equalization.
- `MAX_TRANSFER_FRACTION`: cap on how much depth a cell can lose per tick (suggested: 0.4). Prevents oscillation.
- `PRESSURE_THRESHOLD`: minimum differential to trigger transfer (suggested: 0.3). Prevents jitter.

### 2.3 Terrain Constraints on Transfer

Transfers are blocked when:
- The neighbor cell has a wall/tower with elevation >= the donor's surface level (water can't flow over a wall taller than the water).
- The neighbor is a castle cell.
- The neighbor is out of grid bounds.

When the neighbor has a wall with elevation < the donor's surface level, only the excess above the wall flows:

```
effectiveTransfer = min(transfer, donor.currentDepth - neighborElevation)
```

Holes on the receiving side are handled naturally: the segment's depth lands in the hole cell and will be absorbed by the normal `enterRow` / event path when the segment is processed.

### 2.4 Spreading Direction

Phase 1 (this proposal): lateral only, left/right within the same row. This matches the most visible gap in current behavior (water blocked by a wall doesn't go around it).

Phase 2 (future): backward spreading (into the row above) when a cell's surface level exceeds its upstream neighbor. This would model backwash behind walls but adds complexity and is deferred.

## 3. Segment Creation and Pool Management

### 3.1 The Problem

Unconstrained lateral spreading could spawn a new `WaveSegment` for every dry neighbor cell every frame. On a 16-wide grid with an active wave, this could mean hundreds of actors per wave.

### 3.2 Bounded Segment Pool

`WaveActorRuntime` maintains a `spreadPool: WaveSegment[]` of pre-allocated, inactive segments. Configuration:

```ts
const MAX_SPREAD_SEGMENTS = 48; // 3 per column on a 16-wide grid
```

When a pressure transfer targets a dry cell (no existing segment):
1. Pop a segment from `spreadPool`. If pool is empty, skip this transfer (depth stays on donor).
2. Initialize the segment at `(col, row)` with the transferred depth, zero velocity, `"still"` state.
3. Register it with the active run (subscribe to events, add to `remaining` count, add to `actors` set).
4. Add to the scene.

When a spread segment dissipates:
1. Normal dissipation flow fires `dissipated` event, runtime unsubscribes and decrements `remaining`.
2. The segment is reset and returned to `spreadPool` for reuse.

### 3.3 Transfer Into Existing Segments

When the target cell already has a `WaveSegment`, depth is added directly:

```ts
targetSegment.currentDepth += transfer;
donorSegment.currentDepth -= transfer;
```

No new actor is created. This is the common case once water has spread and reduces pool pressure.

### 3.4 Still-Clone Consolidation

Currently `WaveSegment.spawnStillClone()` creates unregistered clones during surge. These clones are the natural recipients of lateral pressure transfers. Two options:

**Option chosen**: Move still-clone creation into `WaveActorRuntime` so all segment creation goes through one path. The runtime's pressure pass naturally produces still water in cells the surge has visited. `WaveSegment.spawnStillClone()` is replaced by the runtime calling a new `createStillSegment(col, row, depth)` method, which draws from the same pool.

This means:
- `WaveSegment.onPostUpdate()` no longer calls `spawnStillClone()`. Instead, it emits a `{ type: "stillRequested", col, row, depth }` event.
- The runtime handles this event by creating a pooled still segment.
- All segments are registered. Accounting is unified.

## 4. WaveActorRuntime Changes

### 4.1 Become an Excalibur Actor

Yes. `WaveActorRuntime` should extend `Actor` (or use a custom `System` -- but `Actor` is simpler for this codebase).

Why: the pressure equalization pass must run every frame *before* individual segments update. `onPreUpdate()` on the runtime actor gives a reliable hook for this. The alternative (a `setInterval` or hooking into the scene's update) is less clean and harder to synchronize.

```ts
export class WaveActorRuntime extends Actor {
  constructor(
    private readonly scene: Scene,
    private readonly grid: WaveSegmentGrid,
    private readonly applier: WaveEventApplier,
    private readonly terrainSlope: number,
  ) {
    super({ name: "WaveActorRuntime", z: -1 });
    this.graphics.isVisible = false;
    this.body.collisionType = CollisionType.PreventCollision;
  }
```

The runtime actor is added to the scene in `playWave()` and removed on cleanup/resolve.

### 4.2 Spatial Index

A per-frame `Map<string, WaveSegment[]>` keyed by `"col,row"`. Built at the start of `onPreUpdate()` by iterating the registered `actors` set:

```ts
private buildSpatialIndex(): Map<string, WaveSegment[]> {
  const index = new Map<string, WaveSegment[]>();
  for (const seg of this.actors) {
    if (seg.state === "dead") continue;
    const key = `${seg.col},${seg.gridRow}`;
    let bucket = index.get(key);
    if (!bucket) {
      bucket = [];
      index.set(key, bucket);
    }
    bucket.push(seg);
  }
  return index;
}
```

This requires `WaveSegment` to expose `gridRow` (currently computed internally as `gridLoc.y`).

### 4.3 Pressure Pass in onPreUpdate

```ts
override onPreUpdate(_engine: Engine, delta: number): void {
  if (!this.activeRun) return;

  const index = this.buildSpatialIndex();
  const transfers: Array<{ from: WaveSegment; toCol: number; toRow: number; amount: number }> = [];

  for (const [key, segments] of index) {
    const [colStr, rowStr] = key.split(",");
    const col = Number(colStr);
    const row = Number(rowStr);
    const primarySeg = segments[0]; // highest-depth segment in cell

    for (const neighborCol of [col - 1, col + 1]) {
      if (neighborCol < 0 || neighborCol >= this.gridWidth) continue;
      if (this.grid.isCastle(neighborCol, row)) continue;

      const neighborElev = this.grid.getElevation(neighborCol, row);
      const mySurface = this.grid.getElevation(col, row) + primarySeg.currentDepth;
      const neighborKey = `${neighborCol},${row}`;
      const neighborSegs = index.get(neighborKey);
      const neighborDepth = neighborSegs ? Math.max(...neighborSegs.map(s => s.currentDepth)) : 0;
      const neighborSurface = neighborElev + neighborDepth;

      const diff = mySurface - neighborSurface;
      if (diff <= PRESSURE_THRESHOLD) continue;

      // Can water flow there? Wall/tower must be shorter than our surface
      if (neighborElev > 0 && neighborElev >= mySurface) continue;

      const raw = diff * SPREAD_RATE * (delta / 1000);
      const maxDonation = primarySeg.currentDepth * MAX_TRANSFER_FRACTION;
      const amount = Math.min(raw, maxDonation, primarySeg.currentDepth);

      if (amount < 0.01) continue;

      transfers.push({ from: primarySeg, toCol: neighborCol, toRow: row, amount });
    }
  }

  this.applyTransfers(transfers, index);
}
```

`applyTransfers` deducts from donors and either adds to existing neighbor segments or spawns pooled segments.

### 4.4 Updated playWave Signature

No change to the external signature. `playWave(spawns)` still returns `Promise<WaveActorRuntimeResult>`. The runtime now additionally:
- Adds itself to the scene.
- Initializes the spread pool.
- Tracks `gridWidth` from spawns (or accept it as a constructor arg via `WaveSegmentGrid`).

### 4.5 Updated Completion Logic

`remaining` now includes spread segments. The wave resolves when all segments (initial + spread) have dissipated. Spread segments with depth below `MIN_DEPTH` (0.05) are force-dissipated by the pressure pass to prevent lingering puddles from blocking resolution.

A timeout safety net (existing `maxLifetimeMs` on segments, plus a runtime-level max of ~15s) ensures the wave always resolves even if spread segments get stuck.

## 5. WaveSegment Changes

### 5.1 New Public API

```ts
// Expose grid row for spatial indexing
get gridRow(): number {
  return this.gridLoc.y;
}

// Allow runtime to adjust depth externally (for pressure transfers)
adjustDepth(delta: number): void {
  this.currentDepth = Math.max(0, this.currentDepth + delta);
  if (this.currentDepth <= MIN_DEPTH && this.state === "still") {
    this.beginRecession();
  }
}
```

### 5.2 Remove spawnStillClone

Replace the direct `spawnStillClone()` call in `onPostUpdate()` with a new event:

```ts
// In onPostUpdate, where spawnStillClone was called:
if (this.state === "surging" && !newGridLoc.equals(this.gridLoc)) {
  this.emitWaveEvent({
    type: "stillRequested",
    col: this.gridLoc.x,
    row: this.gridLoc.y,
    depth: this.currentDepth,
  });
  this.gridLoc = newGridLoc;
}
```

### 5.3 Spread Segments Skip Planning

Spread segments (spawned laterally, not from original wave spawns) have `speed: 0` and empty `plannedCells`. They don't surge or recede vertically. They exist only to hold depth, participate in pressure equalization, emit terrain interaction events for their cell, and eventually dissipate.

They do need to emit `tileEntered` on creation so erosion/absorption applies. The runtime handles this when initializing a spread segment:

```ts
private initSpreadSegment(seg: WaveSegment, col: number, row: number, depth: number): void {
  // ... position, depth setup ...
  // Fire tile interaction
  seg.emitWaveEvent({ type: "tileEntered", col, row, depth });
  // Handle terrain at this cell
  const elev = this.grid.getElevation(col, row);
  if (elev < 0) {
    const absorbed = Math.min(depth, this.grid.effectiveHoleDepth(col, row));
    if (absorbed > 0) {
      seg.currentDepth -= absorbed;
      seg.emitWaveEvent({ type: "absorbed", col, row, absorbedDepth: absorbed });
    }
  }
  // Castle check
  if (this.grid.isCastle(col, row)) {
    seg.emitWaveEvent({ type: "castleFlooded", col, row });
  }
}
```

This means `emitWaveEvent` needs to become accessible to the runtime, or the runtime subscribes normally and the segment self-emits on init. The latter is cleaner: give spread segments a `initializeAtCell()` method that runs the terrain interaction logic and emits events through the normal listener path.

## 6. Impact on WaveOverlay

### 6.1 Column Bucketing

`WaveOverlay.onPreUpdate()` currently buckets segments by `seg.col` (which returns `spawn.col`). Spread segments have a different column than their donor's spawn column.

Fix: `WaveOverlay` already reads `actor.col` from each `WaveSegment`. Change `WaveSegment.col` to return the *current* column (from `gridLoc.x`) instead of `spawn.col`. For original surge segments, these are the same. For spread segments and still clones, they reflect the actual cell.

This is already partially true: still clones are created with a spawn whose `col` matches `gridLoc.x`. Spread segments will follow the same pattern.

### 6.2 Multi-Row Awareness

Currently the overlay computes per-column coverage using pixel Y positions. Spread segments at various rows will naturally appear at different pixel Y positions, so the overlay's vertical coverage calculation works without changes. The overlay already handles multiple segments per column at different Y positions via its `colBottoms`/`colTops` tracking.

### 6.3 No Structural Changes Needed

The overlay queries `scene.actors` for all `WaveSegment` instances. Since spread segments are proper `WaveSegment` actors added to the scene, they'll be picked up automatically. The `buildCoverageData` function works on `SegmentData[]` which already has all the fields spread segments provide.

## 7. Event System and WaveEventApplier Impact

### 7.1 New Event Type

Add `stillRequested` to `WaveSegmentEvent`:

```ts
| { type: "stillRequested"; col: number; row: number; depth: number }
```

`WaveEventApplier.apply()` ignores this event (returns default result). It's only used by the runtime to trigger still-segment creation.

### 7.2 Spread Segment Events

Spread segments emit standard events (`tileEntered`, `absorbed`, `blocked`, `castleFlooded`, `dissipated`) through their listeners. The runtime subscribes to these just like initial segments. `WaveEventApplier` processes them identically.

This means:
- Spread water entering a hole emits `absorbed`, which calls `grid.applyPuddleDelta`.
- Spread water reaching a castle cell emits `castleFlooded`.
- Spread water entering a wall cell where it can't pass emits `blocked`, which triggers `applySandRedistributionAt`.
- Spread water covering a cell emits `tileCovered`, updating `SandLayer`.

### 7.3 Erosion From Spread

Spread segments emit `tileEntered` with their depth. This triggers `grid.applyWaveWaterHit(col, row, depth)` through the normal applier path. Walls, towers, and holes erode from lateral water just as they do from vertical surge water.

This is a gameplay change: water spreading around a wall can now erode neighboring terrain. This is desirable -- it makes lateral flow feel consequential.

## 8. Preserving Existing Gameplay Semantics

### 8.1 Castle Flooding

Spread segments that reach a castle cell emit `castleFlooded`. The runtime's `ActiveWaveRun.castleFlooded` flag gets set, and the wave resolves with `castleFlooded: true`. No change to session handling.

Risk: lateral spreading could make castle flooding easier. Mitigation: `SPREAD_RATE` and `PRESSURE_THRESHOLD` are tunable. The castle sits at row 11 in a 16-row grid, so water must travel 11+ rows vertically before spreading laterally near the castle. Lateral flow near the top rows (where most spreading happens) is far from the castle.

### 8.2 Erosion

Wall HP erosion (`applyWaveWaterHit`) fires on `tileEntered`. Spread segments fire `tileEntered` once on creation. Walls near spread paths take damage. Tower and hole erosion work identically.

### 8.3 Hole Absorption

Spread water flowing into a hole is absorbed via `effectiveHoleDepth`. The spread segment's depth is reduced. If fully absorbed, the segment dissipates. Puddle depth increases via `applyPuddleDelta`.

### 8.4 Sand Redistribution

When spread water is blocked by a wall, `applySandRedistributionAt` fires. This is existing behavior -- the event type (`blocked`) is the same.

### 8.5 Wave Completion

The wave completes when `remaining` reaches 0. All spread segments are counted in `remaining`. Spread segments with negligible depth are force-dissipated by the pressure pass (depth < `MIN_DEPTH`). The runtime's timeout safety net catches any stragglers.

### 8.6 Tile Coverage (Moist Sand)

Spread segments emit `tileCovered` for cells they occupy. `SandLayer.coverCell` marks these cells. Lateral spreading will increase moist sand coverage, which is visually desirable (water stains where it flows).

## 9. Performance Considerations

### 9.1 Actor Count

Worst case: 16 initial segments + 48 spread segments = 64 actors. Excalibur handles hundreds of actors fine. The pool cap of 48 is the hard limit.

### 9.2 Spatial Index

Rebuilt every frame. For 64 actors, this is a trivial Map construction. No optimization needed.

### 9.3 Pressure Pass Cost

O(A * 2) where A = active actors, checking 2 neighbors each. For 64 actors, 128 comparisons per frame. Negligible.

### 9.4 Overlay

`buildCoverageData` iterates all segments. More segments means more entries in `colBuckets`, but the pixel-fill loop cost dominates and is unchanged (bounded by `pixelW * pixelH`).

### 9.5 Event Processing

More segments means more events flowing through `WaveEventApplier`. Each event does a constant amount of work (grid lookups, state mutations). The increase is proportional to spread segments, capped at 48.

### 9.6 Potential Concern: Depth Oscillation

If `SPREAD_RATE` is too high or `PRESSURE_THRESHOLD` too low, depth can slosh back and forth between cells. Mitigations:
- `MAX_TRANSFER_FRACTION` caps per-tick donation.
- `PRESSURE_THRESHOLD` creates a dead zone.
- Damping loss: optionally lose a small fraction (e.g., 2%) of transferred depth. This makes the system dissipative and guarantees convergence.

## 10. Migration and Incremental Delivery

### Phase 1: Runtime as Actor + Still-Clone Unification

1. Convert `WaveActorRuntime` from a plain class to an `Actor`.
2. Move still-clone creation from `WaveSegment.spawnStillClone()` into the runtime, triggered by the new `stillRequested` event.
3. Add the spread pool infrastructure (but don't use it for lateral spreading yet).
4. Add `gridRow` and `adjustDepth` to `WaveSegment`.
5. Add `width` to `WaveSegmentGrid` interface; update `GridModel` to provide it.
6. All existing tests should pass with no behavior change.

Validation: run `node --run static-check`. Visually confirm wave behavior is unchanged.

### Phase 2: Lateral Pressure Pass

1. Implement `buildSpatialIndex` and the `onPreUpdate` pressure pass.
2. When a transfer targets a dry cell, spawn a pooled spread segment.
3. When a transfer targets a wet cell, adjust depth directly.
4. New config constants: `PRESSURE_THRESHOLD`, `SPREAD_RATE`, `MAX_TRANSFER_FRACTION`, `MAX_SPREAD_SEGMENTS`.
5. Add unit tests for the pressure calculation logic (pure function, no Excalibur dependency).
6. Add browser tests for end-to-end spread behavior.

Validation: `node --run static-check`. Visual verification that water spreads around walls. Check that wave completion still resolves.

### Phase 3: Tuning and Edge Cases

1. Tune `SPREAD_RATE`, `PRESSURE_THRESHOLD`, `MAX_TRANSFER_FRACTION` for good feel.
2. Add damping loss if oscillation is observed.
3. Handle edge case: spread segment enters a cell whose terrain changed mid-wave (wall destroyed by erosion). Re-evaluate terrain on each pressure tick.
4. Update `docs/gameplay.md` to document lateral spreading behavior.

### Phase 4 (Optional): Backward Spreading

Add vertical backflow for cells where surface level exceeds the row above. Reuses the same pressure infrastructure with `row - 1` neighbors in addition to `col +/- 1`.

## 11. Risks and Open Questions

### Risks

1. **Gameplay balance**: Lateral spreading makes walls less effective as standalone defenses. A single-column wall can now be flanked. This is arguably more realistic but may frustrate players who learned column-based strategies. Tuning `SPREAD_RATE` low initially helps.

2. **Wave resolution time**: More segments = potentially longer waves. The timeout safety net and force-dissipation of low-depth segments mitigate this, but playtest verification is needed.

3. **Still-clone migration**: Moving still-clone creation to the runtime is a meaningful refactor that touches the critical path. Phase 1 should be carefully tested in isolation.

4. **Tide mode interaction**: Tide has overlapping waves. Spread segments from wave N mixing with surge segments from wave N+1 could create unexpected interactions. The pool is shared across all active waves. May need per-wave pool partitions if this causes issues.

5. **Collision merging**: `WaveSegment.onCollisionStart` merges overlapping segments. Spread segments in adjacent cells could collide and merge unexpectedly. Spread segments should use `CollisionType.Passive` (or `PreventCollision`) to avoid unwanted merges -- they only participate in the pressure system, not physics collisions.

### Open Questions

1. **Should depth transfer include a damping loss?** Suggested: yes, 2-5% per transfer. This prevents perpetual sloshing and makes the system converge. But it reduces total water volume, which could affect balance. Start with 0% and add if oscillation is observed.

2. **Should spread segments emit `tileCovered` continuously or only once?** Once on creation is sufficient for `SandLayer` coverage. But if a spread segment moves (future vertical backflow), it would need to emit again. For Phase 2, once is fine.

3. **How should the overlay handle the "column gap" when water spreads around a wall?** The Catmull-Rom interpolation in `buildCoverageData` already smooths between columns. If column 5 has water and column 7 has water but column 6 has a wall, the interpolation will bleed water visually into column 6. This might look wrong. May need to insert zero-depth breaks at wall columns to prevent visual bleed. Worth evaluating visually before fixing.

4. **Should `WaveSegmentGrid` grow a `getWidth()` or accept width in constructor?** Adding `width: number` to the interface is cleanest. `GridModel` already has `this.width`. Minor interface change, no structural risk.

5. **What happens when a spread segment's cell is destroyed mid-wave (wall eroded to flat)?** The segment already occupies that cell. When the wall is destroyed, the cell becomes flat ground. The spread segment's depth is now sitting on flat ground -- it should apply terrain slope reduction. This needs explicit handling: on each pressure tick, re-evaluate terrain under still segments and apply slope/absorption if terrain changed since last tick.
