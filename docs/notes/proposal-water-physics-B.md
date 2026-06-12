# Proposal B: Runtime-Coordinated Wave Ticks

## 1. High-Level Approach

Convert `WaveActorRuntime` from a plain TypeScript class into an Excalibur `Actor` that runs a coordination pass in `onPreUpdate()` each frame, before individual `WaveSegment` actors run their own update. This coordination pass computes lateral spreading and pressure across all active segments, then adjusts segment depths and spawns new segments as needed.

Individual `WaveSegment` actors keep their existing vertical surge/recede physics. The runtime adds a horizontal pressure layer on top, running once per frame at the runtime actor level. This avoids N-squared segment-to-segment interactions and keeps the spreading algorithm centralized and tuneable.

The result: water blocked by a wall redistributes laterally into adjacent columns. High-depth columns bleed into lower-depth neighbors. The player sees water flowing around obstacles rather than stopping in rigid columns.

## 2. Runtime as an Excalibur Actor

### Current state

`WaveActorRuntime` is a plain class. It creates segments, subscribes to events, and tracks results. It has no update loop.

### Proposed change

```ts
// wave-actor-runtime.ts
export class WaveActorRuntime extends Actor {
  // z = -1 so onPreUpdate fires before segment updates (z=7)
  constructor(...) {
    super({ name: "WaveActorRuntime", z: -100 });
  }

  override onPreUpdate(_engine: Engine, delta: number): void {
    this.runSpreadingPass(delta);
  }
}
```

Excalibur processes actors in z-order within a scene's update loop. By giving the runtime a very low z-index, its `onPreUpdate()` fires before any `WaveSegment` (z=7) runs its own `onPreUpdate`/`onPostUpdate`. This guarantees the spreading pass runs first each frame.

**Important caveat**: Excalibur's z-order guarantee applies to draw order, not update order. If testing reveals that update order does not reliably follow z-order, the fallback is to use Excalibur's `Scene.on('preupdate', ...)` event handler instead, which fires before any actor updates. The runtime would register this handler when added to the scene and remove it on cleanup. The spreading logic is identical either way; only the hook point changes.

The runtime adds itself to the scene in `playWave()` and removes itself in cleanup/resolution, same as it currently manages the overlay.

### Segment registry

The runtime maintains a `Map<string, WaveSegment>` keyed by `"col:row"` for O(1) spatial lookup during the spreading pass. Every segment the runtime creates (initial spawns, spread spawns, still clones) is registered here. The registry replaces querying `scene.actors` -- it is faster and avoids coupling to unrelated actors.

```ts
private registry = new Map<string, WaveSegment>();

private key(col: number, row: number): string {
  return `${col}:${row}`;
}
```

## 3. Spreading/Redistribution Algorithm

### Per-frame spreading pass

Each frame, `runSpreadingPass(delta)` does:

1. **Build a depth snapshot.** Iterate the registry and collect `{ col, row, depth, state }` for every active segment. Also build a `Map<string, number>` of `"col:row" -> depth` for fast neighbor lookups.

2. **Compute pressure deltas.** For each surging or still segment at `(col, row)` with depth `d > spreadThreshold`:
   - Check left neighbor `(col-1, row)` and right neighbor `(col+1, row)`.
   - For each neighbor, compute `effectiveSurface = terrain_elevation + neighbor_depth` (0 if no segment present). Compare to `this_surface = terrain_elevation(col, row) + d`.
   - If `this_surface > neighbor_surface` and the neighbor cell is not a wall/tower that fully blocks (elevation >= this depth), compute a transfer: `transfer = (this_surface - neighbor_surface) * SPREAD_RATE * (delta / 1000)`.
   - Clamp transfer so neither cell goes negative. Accumulate transfers in a separate delta buffer (not applied in-place, to avoid order-dependent spreading within a single pass).

3. **Apply deltas.** For each cell with a net negative delta, reduce the source segment's `currentDepth`. For each cell with a net positive delta, either:
   - Add depth to an existing segment at that `(col, row)`, OR
   - Spawn a new `WaveSegment` at that cell (see section 4).

4. **Damping.** Each transfer loses a fraction (`SPREAD_DAMPING`, e.g. 0.05) to prevent infinite sloshing and to make spreading feel natural. Water is not perfectly conserved -- a small amount dissipates during lateral movement, which also serves gameplay (spreading weakens the wave).

### Key constants (new, in `config.ts`)

| Constant | Default | Description |
|---|---|---|
| `SPREAD_RATE` | 0.3 | Fraction of surface difference transferred per second |
| `SPREAD_DAMPING` | 0.05 | Fraction of transferred depth lost to dissipation |
| `SPREAD_THRESHOLD` | 0.5 | Minimum depth before a cell can spread laterally |
| `MAX_SPREAD_SEGMENTS` | 64 | Hard cap on runtime-spawned spread segments |

### Spreading direction

Spreading is horizontal only (left/right within the same row). Forward/backward spreading is not needed because vertical movement is already handled by the segment's surge physics. This keeps the algorithm simple and bounded.

### Why not use the dead `flow-field.ts` code?

The `EqualizingRowSolver` in `flow-field.ts` does iterative column-pair equalization per row. The core idea is similar, but the dead code operates on a snapshot grid, not live actors. The spreading pass here is inspired by the same principle (surface-level equalization between neighbors) but operates incrementally per frame on actor state. No code from `flow-field.ts` is reused directly, but the surface-comparison logic is the same conceptual model.

## 4. Segment Lifecycle Management

### Creation

Segments are created in three places, all by the runtime:

1. **Initial spawns** -- same as today, from `playWave(spawns)`.
2. **Spread spawns** -- created by the spreading pass when depth transfers into a cell with no existing segment. These are "still" segments (speed=0) positioned at the target cell center.
3. **Still clones** -- currently created inside `WaveSegment.spawnStillClone()`. This moves to the runtime (see section 5).

All three paths register the segment in the runtime's registry and subscribe to its events.

### Spread segment initialization

```ts
private spawnSpreadSegment(col: number, row: number, depth: number): WaveSegment {
  const x = this.grid.gridLeft + col * this.grid.tileSize + this.grid.tileSize / 2;
  const y = this.grid.gridTop + row * this.grid.tileSize + this.grid.tileSize / 2;
  const segment = new WaveSegment(
    { col, x, y, initialDepth: depth, speed: 0, maxTravelDistance: 0 },
    this.grid,
    this.terrainSlope,
  );
  segment.body.collisionType = CollisionType.Passive;
  // Register, subscribe, add to scene
  this.registerSegment(segment, col, row);
  return segment;
}
```

Spread segments do not surge. They sit in place, participate in the spreading pass (they can spread further laterally or receive more depth), and eventually recede when the runtime tells them to.

### Merging

When the spreading pass adds depth to an existing segment at `(col, row)`, no new actor is created -- the existing segment's `currentDepth` increases. This naturally handles the common case where multiple sources spread into the same cell.

The existing collision-based merge in `WaveSegment.onCollisionStart()` remains for surging segments that physically overlap. These are rare after spreading is added (blocked water redistributes before piling up), but the safety net stays.

### Cleanup and actor count limits

- **`MAX_SPREAD_SEGMENTS`** caps the total number of runtime-spawned spread segments. When the cap is hit, no new spread segments spawn; excess depth stays in the source cell. This prevents unbounded actor creation.
- The registry tracks all segments. When a segment emits `dissipated`, it is removed from the registry and unsubscribed (same as current `remaining` countdown logic).
- `cleanup()` iterates the registry and removes all segments and the overlay, same as today but using the registry instead of `this.actors`.

### Still clone lifecycle

Still clones currently have `agedMs` copied from their parent and recede after `maxLifetimeMs`. This stays the same. The spreading pass treats still clones like any other segment -- they can receive or donate depth.

## 5. Changes to WaveSegment

### What moves to the runtime

| Responsibility | Current owner | New owner | Rationale |
|---|---|---|---|
| Still clone creation | `WaveSegment.spawnStillClone()` | `WaveActorRuntime` | Runtime must register all segments for event accounting and spreading |
| Lateral spreading | N/A (doesn't exist) | `WaveActorRuntime` | Centralized coordination pass |
| Planned cell recomputation after spread depth changes | N/A | `WaveActorRuntime` calls `segment.replanFromRow()` | Runtime knows when depth changed externally |

### What stays on WaveSegment

- Vertical surge/recede physics (`updateSurgeVelocity`, `handleTileEntries`, `beginRecession`, `finishRecession`)
- Tile entry event emission (`enterRow` -> `emitWaveEvent`)
- Collision merge (`onCollisionStart`, `mergeWith`)
- Travel dissipation
- State machine (`surging`, `crashing`, `receding`, `still`, `dead`)
- `currentDepth` as the source of truth for this segment's depth

### Interface changes

`WaveSegment` needs a few new public surface points:

```ts
// Expose row for registry keying (currently only col is public via get col())
get row(): number { return this.gridLoc.y; }

// Allow runtime to adjust depth from spreading pass
adjustDepth(delta: number): void {
  this.currentDepth = Math.max(0, this.currentDepth + delta);
  if (this.lastEnteredRow >= 0) {
    this.replanFromRow(this.lastEnteredRow + 1, this.currentDepth);
  }
}

// Notify runtime when grid location changes (for registry re-keying)
onGridLocChange: ((oldCol: number, oldRow: number, newCol: number, newRow: number) => void) | null = null;
```

The `spawnStillClone` method becomes a runtime responsibility. `WaveSegment` emits a new event or calls a callback when it crosses a grid boundary, so the runtime can spawn the clone and register it.

```ts
// In WaveSegment.onPostUpdate, replace direct spawnStillClone call:
if (this.state === "surging" && !newGridLoc.equals(this.gridLoc)) {
  this.onGridLocChange?.(this.gridLoc.x, this.gridLoc.y, newGridLoc.x, newGridLoc.y);
  this.gridLoc = newGridLoc;
}
```

The runtime hooks this callback when creating segments:

```ts
segment.onGridLocChange = (oldCol, oldRow, newCol, newRow) => {
  this.registry.delete(this.key(oldCol, oldRow));
  this.registry.set(this.key(newCol, newRow), segment);
  this.spawnStillClone(segment, oldCol, oldRow);
};
```

## 6. Impact on WaveOverlay

### Current behavior

`WaveOverlay.onPreUpdate()` scans `this.scene.actors` for `WaveSegment` instances, buckets by `col`, and builds a coverage texture.

### Changes needed

The overlay's per-column bucketing still works. Spread segments are `WaveSegment` instances with valid `col`, `pos`, and `currentDepth`, so the overlay picks them up automatically via the scene actor scan.

However, with spreading, a single row may have segments in many columns. The overlay already handles multiple segments per column (it takes `maxDepth` and `bottomY` per column). The only issue is that spread segments are "still" and positioned at cell centers rather than surging downward. The overlay already handles still segments (the test "receding/still segments contribute coverage but G = 0" confirms this).

**No changes to `WaveOverlay` or `buildCoverageData` are needed in the initial implementation.** The overlay naturally picks up spread segments because they are normal `WaveSegment` actors in the scene.

If visual quality needs improvement later (e.g. smoother transitions at spread boundaries), that is a follow-up concern, not a blocker.

## 7. Impact on Event System and WaveEventApplier

### Event routing

Currently, `WaveActorRuntime.playWave()` subscribes to events from each initial segment. The `remaining` counter counts down as initial segments dissipate.

With spreading, runtime-spawned segments also emit events. These must be routed through the applier. The runtime subscribes to every segment it creates (spread spawns, still clones) using the same `onWaveEvent` listener pattern.

### Completion tracking

The current completion condition is "all initially-spawned segments have dissipated." This changes to "all registered segments have dissipated." The `remaining` counter increments when a spread segment or still clone is created and decrements when any segment dissipates.

```ts
private registerSegment(segment: WaveSegment, col: number, row: number): void {
  this.registry.set(this.key(col, row), segment);
  this.actors.add(segment);
  if (this.activeRun) {
    this.activeRun.remaining++;
    const unsub = segment.onWaveEvent(event => {
      // same event handling as initial segments
    });
    this.activeRun.unsubscribes.set(segment, unsub);
  }
  this.scene.add(segment);
}
```

### New events from spread segments

Spread segments are still with speed=0. They do not surge through rows, so they do not emit `tileEntered`, `tileCovered`, `blocked`, `overtopped`, or `castleFlooded` events through the normal path. They sit in one cell.

However, the runtime's spreading pass must check if water spreads into a castle cell. If the spreading pass transfers depth into `(col, row)` where `grid.isCastle(col, row)` is true, the runtime emits `castleFlooded` directly through the applier and triggers wave completion. This is the one gameplay-critical check that must happen at the runtime level rather than inside a segment.

Spread segments still emit `dissipated` when they recede/die, which the runtime needs for cleanup.

### WaveEventApplier changes

`WaveEventApplier.apply()` needs no changes. It already handles all event types. Spread segments that sit in place don't trigger erosion (no `tileEntered` with depth), which is correct -- lateral water arriving gently at a cell shouldn't erode it. If erosion from spread water is desired later, the runtime can emit synthetic `tileEntered` events when spread depth exceeds a threshold.

## 8. Preserving Existing Gameplay Semantics

| Mechanic | How it's preserved |
|---|---|
| **Castle flooding** | Surging segments still emit `castleFlooded` on entering a castle cell. The spreading pass additionally checks castle cells before creating spread segments there, emitting `castleFlooded` via the applier. |
| **Erosion (walls)** | Surging segments still emit `tileEntered` with depth, triggering `applyWaveWaterHit`. Spread segments do not erode (they are still). Wall HP is unchanged. |
| **Erosion (holes/towers)** | Same as walls -- only surging segments trigger erosion via `tileEntered`. |
| **Hole absorption** | Surging segments still emit `absorbed` events. Spread segments arriving at hole cells: the spreading pass checks `grid.getElevation(col, row)` and `grid.effectiveHoleDepth(col, row)` before placing water. If the target cell is a hole with capacity, the spread depth is absorbed (runtime emits `absorbed` event) rather than creating a segment. |
| **Sand redistribution** | `blocked` and `overtopped` events from surging segments still trigger `applySandRedistributionAt`. Spread segments do not trigger redistribution. |
| **Moist sand coverage** | `tileCovered` events from surging segments still drive `sandLayer.coverCell()`. Spread segments could optionally emit `tileCovered` for cells they occupy, but this is a visual-only concern and can be added later. |
| **Wave completion** | `playWave()` still returns `Promise<WaveActorRuntimeResult>`. The promise resolves when all registered segments (initial + spread + clones) have dissipated. |
| **Classic/Tide parity** | Both modes call `playWave(spawns)` on the same `WaveActorRuntime`. No mode-specific changes. |

## 9. Performance Considerations

### Actor count

A 16-column wave with spreading could theoretically spawn up to 16 x 16 = 256 spread segments (one per cell). In practice, spreading is bounded by `SPREAD_THRESHOLD`, `SPREAD_RATE`, damping, and `MAX_SPREAD_SEGMENTS`. Expected peak is 30-50 spread segments on top of the 16 initial surging segments.

Still clones are already created today (one per cell a surging segment crosses). Spreading does not substantially increase the clone count because spread segments are already "still" and don't create clones themselves.

### Spreading pass cost

The spreading pass iterates the registry once per frame. For N active segments, the pass is O(N) with O(1) neighbor lookups via the `Map`. At 60 FPS with ~80 segments, this is ~4800 iterations per second -- trivial.

### Registry maintenance

`Map.set` and `Map.delete` are O(1) amortized. Registry size tracks active segment count, which is bounded by `MAX_SPREAD_SEGMENTS` + initial spawn count + still clone count.

### Mitigation if performance degrades

- Reduce `SPREAD_RATE` to slow spreading (fewer segments created per second).
- Lower `MAX_SPREAD_SEGMENTS`.
- Run the spreading pass every other frame instead of every frame (delta accumulation handles this naturally).
- Skip spreading for segments with depth below a render threshold.

## 10. Migration / Incremental Delivery Strategy

### Phase 1: Runtime becomes an Actor (no spreading yet)

**Goal**: Mechanical refactor. No behavior change.

- Convert `WaveActorRuntime` from a plain class to an `Actor`.
- Add the segment registry alongside the existing `Set<WaveSegment>`.
- Move still clone creation from `WaveSegment` to the runtime via the `onGridLocChange` callback.
- Register all segments (initial + clones) in the registry.
- Change completion tracking to use the registry-based `remaining` counter.
- Verify: all existing tests pass. `wave-actor-runtime.test.ts` mocks need updating for the Actor base class. `wave-segment.browser.test.ts` tests still pass because `WaveSegment` behavior is unchanged.
- Verify: `node --run static-check` passes.

### Phase 2: Add spreading pass (behind a flag)

**Goal**: Implement the spreading algorithm, gated by a config constant `SPREADING_ENABLED = false`.

- Add `runSpreadingPass(delta)` to `WaveActorRuntime.onPreUpdate()`, gated by the flag.
- Add `adjustDepth()` and `get row()` to `WaveSegment`.
- Add `spawnSpreadSegment()` to the runtime.
- Add spreading constants to `config.ts`.
- Write unit tests for the spreading algorithm in isolation (mock segments, verify depth transfers).
- Write a browser test that enables spreading and verifies water spreads around a wall.
- Verify: `node --run static-check` passes with flag off (no behavior change) and with flag on (new tests pass).

### Phase 3: Castle flooding from spread + hole absorption

**Goal**: Handle the two gameplay-critical interactions for spread water.

- Runtime checks `isCastle` before placing spread segments.
- Runtime checks hole capacity and emits `absorbed` events for spread water entering holes.
- Write tests for both paths.
- Verify: `node --run static-check` passes.

### Phase 4: Enable spreading by default and tune

**Goal**: Flip the flag, tune constants, playtest.

- Set `SPREADING_ENABLED = true`.
- Tune `SPREAD_RATE`, `SPREAD_DAMPING`, `SPREAD_THRESHOLD`, `MAX_SPREAD_SEGMENTS` via playtesting.
- Remove the flag once stable.
- Update `docs/gameplay.md` to document lateral spreading behavior.

## 11. Risks and Open Questions

### Risks

1. **Excalibur update order is not guaranteed by z-index.** If the runtime's `onPreUpdate` does not reliably fire before segments, spreading deltas could be one frame stale. Mitigation: use `Scene.on('preupdate')` instead if z-order is unreliable. This is tested in Phase 1.

2. **Still clone explosion.** Still clones already exist today, but spreading increases the number of cells with active water. If clone count gets high, the overlay's per-frame scene scan (`this.scene.actors.filter(...)`) becomes expensive. Mitigation: the overlay could read from the runtime's registry instead of scanning the scene. This is a Phase 4 optimization if needed.

3. **Spread water reaching the castle through unexpected paths.** With lateral spreading, water can route around walls in ways the player didn't anticipate. This could feel unfair or could make walls less effective. Mitigation: tune `SPREAD_RATE` and `SPREAD_DAMPING` so spreading is visible but not dominant. Walls should still be the primary defense; spreading is a secondary pressure mechanic.

4. **Event ordering.** The spreading pass runs before segment updates. If the pass spawns a spread segment at `(col, row)` and a surging segment enters `(col, row)` in the same frame, the surging segment's collision merge will handle deduplication. But the order of event emission (spread segment's events vs. surging segment's events) could matter for erosion/absorption accounting. Mitigation: spread segments do not emit `tileEntered`, so no double-counting. The surging segment's events take priority.

5. **Interaction with `replanFromRow`.** When `adjustDepth()` calls `replanFromRow()`, it recomputes planned cells using current terrain state. If the terrain was modified earlier in the same frame by another segment's event, the replan sees the updated terrain. This is correct (terrain changes are immediate), but could produce surprising cascades. Mitigation: the spreading pass runs before segment updates, so terrain is stable during the spreading pass.

### Open questions

1. **Should spread water erode?** The current proposal says no -- only surging segments trigger erosion. But if a wall is flanked and spread water sits against it for many frames, should it contribute erosion? This is a gameplay design question, not a technical one. The runtime can emit synthetic `tileEntered` events for spread segments if desired.

2. **Should spread water cover sand (moist layer)?** Same as above. Spread segments could emit `tileCovered` events, but this changes the visual. Defer to playtesting.

3. **Diagonal spreading.** The current proposal is horizontal only. Should water spread diagonally (into `(col-1, row+1)` etc.)? This increases complexity and actor count. Recommendation: start horizontal-only and revisit after playtesting.

4. **Receding spread segments.** When should spread segments begin recession? Options:
   - When the source segment that donated their depth recedes (cascade recession).
   - After a fixed lifetime (same as still clones, via `maxLifetimeMs`).
   - When depth drops below `MIN_DEPTH` due to damping/further spreading.
   Recommendation: use the existing `maxLifetimeMs` mechanism. Spread segments inherit the parent's `agedMs` (same as still clones today), so they recede on a similar timeline.

5. **Spread through gaps in walls.** If columns 5 and 7 have walls but column 6 is flat, should water spread through the gap? Yes -- the spreading pass checks elevation at the target cell, not whether there's a wall "between" cells. Water at `(5, row)` blocked by a wall spreads to `(6, row)` if column 6 is flat, then to `(7, row)` where it hits the wall. This is physically correct and rewards gap-free wall construction.
