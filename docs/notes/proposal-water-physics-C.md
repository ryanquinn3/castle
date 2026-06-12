# Proposal C: Hybrid Grid-Actor Water Physics

## 1. High-Level Approach

Introduce a lightweight per-tick grid simulation that computes water spreading and pressure. `WaveSegment` actors remain the gameplay truth for events, collisions, and rendering, but their depth and existence are synchronized to match grid state each frame.

The flow:

1. Surging `WaveSegment` actors advance downward as they do today, writing their depth into a shared `WaterGrid` as they enter new rows.
2. Each engine tick, `WaterGrid.step()` runs a fixed number of lateral equalization passes across all wet cells, redistributing depth between neighbors based on surface level differences and terrain.
3. After stepping, `WaveActorRuntime` syncs actors to match grid state: updating depth on existing segments, spawning new segments where the grid became wet without an actor, and killing segments where the grid dried out.
4. Actors continue to own event emission (`tileEntered`, `blocked`, `absorbed`, etc.) and collision handling. The grid never emits gameplay events directly.

```
WaveSegment surges --> writes depth into WaterGrid
                              |
                       WaterGrid.step() (lateral equalize)
                              |
                  WaveActorRuntime.syncActorsToGrid()
                     /          |           \
              update depth   spawn new    kill dry
              on existing    segments     segments
```

## 2. Grid-Layer Water Simulation

### Data structure: `WaterGrid`

New file: `src/wave/water-grid.ts`

```ts
interface WaterCell {
  depth: number;        // current water depth at this cell
  elevation: number;    // terrain elevation snapshot (refreshed from GridModel each wave)
  holeCapacity: number; // remaining hole absorption capacity
  isCastle: boolean;
  blocked: boolean;     // true if a wall/tower fully blocked water here this tick
}

class WaterGrid {
  private cells: WaterCell[][];
  constructor(
    readonly width: number,
    readonly height: number,
    private readonly terrainSlope: number,
  ) { /* allocate cells */ }

  /** Snapshot terrain from GridModel at wave start. */
  refreshTerrain(grid: WaveSegmentGrid): void;

  /** Called by WaveSegment when it enters a row. */
  writeDepth(col: number, row: number, depth: number): void;

  /** Run lateral equalization. Called once per engine tick. */
  step(settleIterations: number): void;

  /** Read current depth. Used by sync and overlay. */
  getDepth(col: number, row: number): number;

  /** Mark cell as dry (segment receded or absorbed). */
  clearDepth(col: number, row: number): void;

  /** Reset all cells for a new wave. */
  reset(): void;
}
```

### What it computes

`step()` runs `settleIterations` (default: 4) left-to-right then right-to-left passes per tick. Each pass iterates all wet cells and for each adjacent pair `(col, col+1)` in the same row:

1. Compute effective surface: `surface = max(0, terrainSlope + elevation) + depth`
2. If `|surfaceA - surfaceB| > threshold` (suggest 0.3), transfer `min(transferFraction * diff, donor.depth)` from the higher surface to the lower.
3. Walls and towers with elevation >= donor surface act as barriers; skip that pair.
4. Hole absorption happens inline: if water transfers into a hole cell, reduce depth by `min(depth, holeCapacity)` and decrement `holeCapacity`.

This is directly adapted from `EqualizingRowSolver.settle()` in `flow-field.ts` (lines 113-165), converted from a batch row solver to an incremental per-tick stepper.

### How often

Once per engine tick during `WaveActorRuntime.onPreUpdate()`. At 60fps this is ~16ms. The grid is 16x16 = 256 cells. Even with 4 settle iterations, that is ~1024 pair comparisons per tick, which is trivial.

### Vertical spreading

The grid does not propagate water downward. Downward movement remains segment-driven (surging actors). The grid handles only lateral (left/right within a row) equalization. This preserves the visual drama of a wave front advancing row by row rather than instantly flooding.

A surging segment entering row R writes its depth to `WaterGrid[col][R]`. Adjacent dry cells in row R can then receive water via lateral spreading on the next tick. This is where blocked water "spills sideways" -- the core missing behavior identified in the problem statement.

## 3. Actor Sync to Grid State

`WaveActorRuntime` gains a `syncActorsToGrid()` method called after `WaterGrid.step()` each tick.

### Segment registry

`WaveActorRuntime` maintains a `Map<string, WaveSegment>` keyed by `"col:row"` for all still-water segments. Surging segments are tracked separately (they move between cells). This replaces the current pattern where still clones are created inside `WaveSegment.spawnStillClone()` without runtime knowledge.

### Sync rules

For each cell `(col, row)` in the grid:

| Grid state | Actor state | Action |
|---|---|---|
| `depth > 0` | No actor | Spawn a new still `WaveSegment` via runtime, register it, subscribe to events |
| `depth > 0` | Actor exists | Update `actor.currentDepth = gridDepth` |
| `depth <= 0` | Actor exists, still | Kill actor, emit `dissipated`, unregister |
| `depth <= 0` | No actor | No-op |

Surging segments are never killed by sync. They write into the grid but the grid does not write back into a surging segment. This means a surging column still does its own terrain interaction (enterRow, planned cells, etc.). Only once it stops surging and becomes still does grid state take over.

### Creation

New segments spawned by sync are created as still (`speed: 0`, `CollisionType.Passive`, no planned cells). They receive a `WaveSegmentSpawn` with the cell's pixel position and the grid's current depth. The runtime registers their event listener and adds them to `activeRun.remaining` / `unsubscribes`.

### Removal

When grid depth drops to 0 for a still segment, the segment emits `dissipated` and is killed. The runtime's existing dissipation accounting handles the rest. This is the same path used today.

### Depth updates

For existing still segments, `currentDepth` is set directly from the grid each tick. No event is emitted for depth changes from spreading -- events only fire on discrete gameplay transitions (entering a new tile, blocking, absorption).

## 4. Reviving flow-field.ts

`flow-field.ts` contains two things worth reusing:

### EqualizingRowSolver logic

The settle loop at lines 113-165 of `flow-field.ts` is the direct ancestor of `WaterGrid.step()`. The key adaptation: instead of running the full settle to convergence on a snapshot, we run a bounded number of iterations per tick and let convergence happen over multiple frames. This produces visually smooth spreading.

Specific reuse:
- The surface-level computation (`terrainSlope + elevation + waterLevel`) ports directly.
- The `floor(abs(diff) / 2)` transfer amount can be softened to `diff * transferFraction` for smoother per-tick behavior.
- The wall-barrier check (`elevations[col] > 0 && rowWater[col] === 0`) ports as-is.

### Pool absorption

`absorbIntoPoolGroups()` (lines 267-345) handles contiguous hole groups sharing water. This can be called within `WaterGrid.step()` after lateral equalization, operating on each row's hole groups. The existing implementation is row-local, which matches the grid's row-based spreading.

### What stays dead

`simulateAdvance()` and `simulateRecede()` are not revived. They are full-grid batch simulations designed for the old row-animation path. The hybrid approach replaces them with incremental per-tick computation.

`WaterColumn` is not directly needed since the grid cells store depth directly, but its `applyTerrain()` method is a useful reference for the blocked/overtopped threshold logic.

## 5. Changes to WaveActorRuntime

`WaveActorRuntime` becomes an Excalibur `Actor` (or uses the scene's `onPreUpdate` hook) so it can run logic each tick.

### New responsibilities

```ts
class WaveActorRuntime extends Actor {
  private waterGrid: WaterGrid;
  private stillRegistry: Map<string, WaveSegment>;  // "col:row" -> segment

  onPreUpdate(engine: Engine, delta: number): void {
    this.waterGrid.step(SETTLE_ITERATIONS);
    this.syncActorsToGrid();
  }
}
```

### Modified `playWave()`

1. Create `WaterGrid`, call `refreshTerrain()` from grid.
2. Spawn surging segments as before.
3. Add `this` (the runtime actor) to the scene so `onPreUpdate` fires.
4. Still-clone creation moves from `WaveSegment.spawnStillClone()` to the sync loop.

### New `registerSegment()` method

Extracted from the inline loop in `playWave()`. Used by both initial spawn and sync-spawned segments. Handles event subscription, `activeRun.remaining++`, and `actors.add()`.

### Modified completion check

`maybeResolve()` must account for the grid still containing water. The wave is complete when:
- All surging segments have dissipated AND
- `WaterGrid` reports all cells dry (or only puddle-trapped water remains)

This replaces the current `remaining === 0` check with `remaining === 0 && waterGrid.isDrained()`.

### Modified `cleanup()`

Also calls `waterGrid.reset()` and clears `stillRegistry`.

## 6. Changes to WaveSegment

### Grid write-through

When a surging segment enters a row via `enterRow()`, it calls `this.waterGrid.writeDepth(col, row, this.currentDepth)` after computing its new depth. This feeds the grid with the surge front.

Constructor takes an optional `WaterGrid` reference. Still segments created by sync do not write back (they are read-only consumers of grid state).

### Remove `spawnStillClone()`

Still-clone creation is removed from `WaveSegment`. The runtime's sync loop handles this instead. This addresses the problem statement's constraint that "segments created outside the runtime registration path may not be included in result accounting."

### Keep planned cells for surging segments

The `planWaveCells()` / `replanFromRow()` / `enterRow()` pipeline stays for surging segments. These are the gameplay truth for terrain interaction. The grid reflects the result of these interactions, not the other way around.

### Depth override for still segments

Still segments gain a `syncDepth(depth: number)` method that sets `currentDepth` without emitting events. Called by the runtime sync loop.

### New event: `tileEntered` from lateral spread

When the sync loop spawns a new segment at a cell that gained water from lateral spreading (not from a surging segment entering the row), the runtime emits `tileEntered` on behalf of that segment. This ensures erosion, castle flooding, and sand coverage still fire for laterally-spread water.

The runtime checks: if the cell is a castle tile, emit `castleFlooded`. If the cell has a wall, check blocked/overtopped. If it is a hole, apply absorption. These checks happen in `syncActorsToGrid()` before spawning the segment, using the same logic as `WaveSegment.enterRow()` but driven by the grid.

## 7. Impact on WaveOverlay

`WaveOverlay` currently queries `scene.actors` for all `WaveSegment` instances and buckets by `col`. This continues to work because:

- Surging segments still exist as actors with `col` and `currentDepth`.
- Still segments spawned by sync have the same shape.
- The overlay's `buildCoverageData()` function needs no changes.

One improvement: the overlay could optionally read directly from `WaterGrid` instead of scanning actors. This would be more efficient and eliminate the actor-scan:

```ts
// In WaveOverlay.onPreUpdate():
for (let row = 0; row < height; row++) {
  for (let col = 0; col < width; col++) {
    const depth = this.waterGrid.getDepth(col, row);
    if (depth > 0) {
      segments.push({ col, pixelY: ..., currentDepth: depth, state: 'still', tileSize });
    }
  }
}
```

This is an optional optimization for a later phase. The actor-scan approach works immediately with no overlay changes.

## 8. Impact on Event System and WaveEventApplier

### Events that don't change

| Event | Source | Notes |
|---|---|---|
| `tileEntered` | Surging segment's `enterRow()` | Unchanged |
| `blocked` | Surging segment's `enterRow()` | Unchanged |
| `overtopped` | Surging segment's `enterRow()` | Unchanged |
| `absorbed` | Surging segment's `enterRow()` | Unchanged |
| `tileCovered` | Surging segment's `enterRow()` | Unchanged |
| `dissipated` | Surging segment's `finishRecession()` | Unchanged |
| `castleFlooded` | Surging segment's `enterRow()` | Unchanged |

### Events from lateral spread

When `syncActorsToGrid()` detects a newly wet cell from lateral spread, it must emit appropriate events before spawning the segment:

- `tileEntered` with the grid depth at that cell.
- If the cell is castle: `castleFlooded`.
- If the cell has a wall: `blocked` or `overtopped` (and clear the grid cell if blocked).
- If the cell is a hole: `absorbed` with absorbed amount.

These events go through the same `WaveEventApplier.apply()` path. The applier needs no changes. The runtime emits them on behalf of a "virtual" entry, then creates the still segment.

### New consideration: erosion from lateral spread

Lateral spread water entering a tile should trigger erosion via `tileEntered`. This means walls can be eroded by water that arrived sideways, not just from the surge column. This is a gameplay behavior change, but it is the desired outcome: water blocked by a wall spills around it and erodes adjacent defenses.

### `WaveEventApplier` changes

None. The applier is event-driven and does not care whether the event came from a surging segment or the sync loop.

## 9. Preserving Gameplay Semantics

### Castle flooding

Surging segments still emit `castleFlooded` when they enter a castle tile. Additionally, if lateral spread pushes water into a castle tile, the sync loop emits `castleFlooded`. Both paths set `run.castleFlooded = true`. No change to loss condition.

### Erosion

`tileEntered` events with depth trigger `grid.applyWaveWaterHit()`. Surging segments produce these as before. Lateral-spread entries produce them from the sync loop. Wall HP, hole hit counts, and tower hit counts accumulate from both sources.

### Hole absorption

Two absorption paths:
1. **Surge path**: surging segment enters a hole, reduces its depth, emits `absorbed`. Writes reduced depth to `WaterGrid`.
2. **Grid path**: `WaterGrid.step()` transfers water into hole cells and reduces depth by `min(depth, holeCapacity)`. The sync loop detects the absorption and emits `absorbed` events.

To avoid double-absorption, the grid must track its own `holeCapacity` separately from the `GridModel`'s hole state. At wave start, `refreshTerrain()` snapshots capacities. Surging segments that emit `absorbed` also decrement `WaterGrid`'s `holeCapacity` for that cell.

### Sand redistribution

`blocked` and `overtopped` events trigger `grid.applySandRedistributionAt()`. This happens through the same event applier path. Lateral-spread blocking triggers the same events.

### Sand coverage

`tileCovered` events drive `SandLayer.coverCell()`. Surging segments emit these for the row behind their leading edge. For lateral spread, the sync loop emits `tileCovered` when a cell transitions from dry to wet.

### Wave completion

The wave resolves when all surging segments have dissipated AND the water grid has drained (all non-puddle water is gone). Still segments spawned by sync will eventually lose depth through recession (which the grid models as decay over time after surges stop) or hole absorption. A configurable `drainRate` per tick ensures standing water eventually recedes.

## 10. Performance Considerations

### Grid computation cost

16x16 grid, 4 settle iterations per tick = 1024 pair comparisons. Each comparison is ~5 arithmetic ops. Total: ~5000 ops/tick. Negligible at 60fps.

### Actor count

Current system: 16 surging segments + up to 16*16 = 256 still clones (one per cell traversed). The hybrid system has the same worst case. In practice, still segments only exist where the grid has water, so the count is bounded by wet cell count.

The key improvement: still segments spawned by sync replace the unregistered still clones that `WaveSegment.spawnStillClone()` currently creates. The runtime controls their lifecycle, preventing unbounded creation.

### Memory

`WaterGrid` adds 256 cells * ~40 bytes = ~10KB. Negligible.

### Hot path

`syncActorsToGrid()` iterates all 256 cells per tick. For each wet cell, it does a map lookup and possibly an actor spawn. Actor spawns are the expensive part (Excalibur actor initialization), but they only happen when new cells become wet, which is bounded by the spreading rate.

To limit spawn rate: cap new segment spawns to `MAX_SPAWNS_PER_TICK` (suggest 4). Remaining spawns are deferred to the next tick. This smooths the visual and prevents frame spikes.

## 11. Migration / Incremental Delivery Strategy

### Phase 1: WaterGrid + write-through (no spreading yet)

- Create `WaterGrid` with `writeDepth()`, `getDepth()`, `reset()`, but `step()` is a no-op.
- `WaveActorRuntime` becomes an `Actor`, creates `WaterGrid`, passes it to segments.
- Surging segments call `writeDepth()` in `enterRow()`.
- Still-clone creation moves from `WaveSegment` to runtime sync loop, reading from `WaterGrid`.
- **Behavior is identical to today.** All existing tests pass. This validates the plumbing.
- Tests: unit test `WaterGrid` write/read. Verify runtime sync creates the same still clones as before.

### Phase 2: Lateral equalization

- Enable `WaterGrid.step()` with the equalizing settle logic.
- `syncActorsToGrid()` spawns new segments for cells that become wet from spreading.
- Add event emission for lateral-spread entries.
- **New behavior**: blocked water spreads sideways. This is the core feature.
- Tests: unit test `WaterGrid.step()` with various terrain configurations. Browser test showing water spreading around a wall.

### Phase 3: Event parity and gameplay tuning

- Verify all gameplay events fire correctly for lateral-spread water.
- Tune `settleIterations`, `transferFraction`, and `threshold` for feel.
- Add `drainRate` for standing water recession.
- Verify castle flooding, erosion, hole absorption work from lateral paths.
- Tests: gameplay scenario tests (wall with gap, U-shaped moat, etc.).

### Phase 4: Overlay optimization (optional)

- Switch `WaveOverlay` to read from `WaterGrid` directly instead of scanning actors.
- Remove actor scan from overlay's `onPreUpdate()`.

### Phase 5: Cleanup

- Remove dead `flow-field.ts` `simulateAdvance()`/`simulateRecede()` functions if no longer referenced.
- Remove `WaveSegment.spawnStillClone()`.
- Update `AGENTS.md` architecture docs.

## 12. Risks and Open Questions

### Risks

**Double-counting events.** A surging segment enters a cell and emits `tileEntered`. Then lateral spread moves water into the same cell from a neighbor. The sync loop must not re-emit `tileEntered` for cells that already have a registered segment. The `stillRegistry` map prevents this, but edge cases (surging segment leaves, grid still has water) need careful handling.

**Surge/grid desync.** A surging segment's planned depth may disagree with the grid's post-equalization depth. The design handles this by making surging segments authoritative: they write to the grid, not the other way around. But if a surging segment reads grid state (e.g., after a merge), it could see stale data. Solution: surging segments never read from the grid; they use their own `plannedCells`.

**Recession timing.** Today, a surging segment triggers recession when blocked and then recedes upward. The grid needs to reflect this: when a segment begins recession, its cells should start draining. Without this, the grid would show standing water forever. The `drainRate` parameter handles passive drain, and explicit `clearDepth()` calls on recession handle active drain.

**Still-segment event ordering.** If multiple cells become wet in one tick, the order of event emission matters for gameplay (e.g., castle flooding should terminate the wave before more erosion events fire). The sync loop should process cells in row-major order (top to bottom, left to right) and short-circuit on `castleFlooded`.

### Open questions

**Should lateral spread happen across rows?** This proposal limits spreading to left/right within a row. Downward spread is surge-driven. Upward spread (backflow) is not modeled. If water pools behind a wall and rises, upward spread could be added later by extending `WaterGrid.step()` to include vertical neighbors, but this adds complexity and may not be needed for the core "water goes around walls" behavior.

**What is the drain rate for standing water?** The grid needs standing water to eventually drain so the wave can complete. Options: (a) constant drain rate per tick, (b) drain only after all surging segments are done, (c) drain proportional to distance from surge front. Option (b) is simplest and matches the current behavior where still clones have a `maxLifetimeMs` age-out.

**Should `WaveActorRuntime` be an `Actor` or use a scene subscription?** Making it an `Actor` is cleanest for `onPreUpdate()` access, but it means adding/removing it from the scene. An alternative: `scene.on('preupdate', ...)` subscription in `playWave()`, removed in `cleanup()`. The subscription approach avoids actor overhead but couples to Excalibur's event API. Recommend: make it an `Actor` with no graphics and `z: -1`. It is already added/removed with wave lifecycle.

**Interaction between merging and the grid.** When two surging segments collide and merge (momentum conservation), the surviving segment's depth increases. The grid cells for both segments' positions need updating. The merge logic in `WaveSegment.mergeWith()` should call `waterGrid.writeDepth()` for the surviving segment's cell and `waterGrid.clearDepth()` for the killed segment's cell.

**Should the grid handle terrain mutation mid-wave?** Today, `WaveEventApplier` mutates terrain (e.g., erosion lowers a wall). The grid's terrain snapshot could become stale. Two options: (a) re-snapshot after every event application (expensive, simple), (b) have the event applier also update the grid's terrain snapshot (targeted, requires wiring). Recommend (b): add a `WaterGrid.updateElevation(col, row, newElevation)` method called from the applier after terrain changes.

**How does this interact with Tide mode's overlapping waves?** In Tide, a new wave can start before the previous one fully recedes. The `WaterGrid` naturally handles this: new surge depth writes on top of existing standing water. The grid's equalization runs on the combined state. This is actually an improvement: currently, overlapping waves' still clones are independent and unaware of each other.
