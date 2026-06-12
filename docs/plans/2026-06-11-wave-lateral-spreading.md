# Wave Lateral Spreading Implementation Plan

## Chosen approach

Proposal A (pressure-based lateral spreading) with selective elements from B and C. The core idea: `WaveActorRuntime` becomes an Excalibur `Actor` with an `onPreUpdate` pressure equalization pass that transfers depth between adjacent segments in the same row. Spread segments are real `WaveSegment` actors managed through a bounded pool. Still-clone creation moves from `WaveSegment` into the runtime.

## Why this approach

### Proposal A: pressure-based lateral spreading (selected)

Strengths:
- Cleanest separation of concerns. Segments stay simple; pressure logic lives in one place on the runtime.
- Spread segments emit standard events through the existing listener path. No synthetic event emission needed from the runtime.
- Bounded pool gives a hard actor-count cap with predictable performance.
- Preserves all gameplay semantics naturally: spread segments fire `tileEntered`, `absorbed`, `blocked`, `castleFlooded` through the same `WaveEventApplier` path.

Weaknesses:
- String-keyed spatial index rebuilt every frame is wasteful compared to a typed array grid. Minor at 64 actors.
- The `stillRequested` event adds a new event type that the applier must ignore. Slightly noisy.

### Proposal B: runtime-coordinated wave ticks (rejected)

Strengths:
- Similar runtime-as-Actor approach, which is good.
- Registry-based spatial lookup is clean.

Weaknesses:
- Spread segments do not emit `tileEntered`, meaning erosion from lateral water requires the runtime to emit synthetic events or a second pass. This is the biggest flaw: it splits event ownership between segments and the runtime, making the system harder to reason about and test.
- The `onGridLocChange` callback for still-clone creation adds coupling between segment and runtime that is less clean than an event.
- The `replanFromRow` call inside `adjustDepth` is dangerous. A depth change from lateral spreading should not cause a surging segment to recompute its plan mid-surge.
- Relies on z-order for update ordering, which Excalibur does not guarantee for `onPreUpdate`.

### Proposal C: hybrid grid-actor (rejected)

Strengths:
- The `WaterGrid` data structure gives a clean global view of water state. Reading from a 2D array is simpler than scanning actors.
- Reuses `EqualizingRowSolver` logic from `flow-field.ts`.
- The overlay could read from the grid directly, which is a nice optimization.

Weaknesses:
- Dual source of truth (grid vs. actors) is the fundamental problem. Surging segments write to the grid but the grid does not write back to them. Still segments read from the grid. This split creates subtle desync bugs: what happens when a surging segment recedes but the grid still has water? What happens when a merge changes a segment's depth but the grid does not know?
- `WaterGrid.step()` running `settleIterations` per tick is overkill for 16 columns and introduces a different timing model (convergence over frames) than the actor physics.
- Double-counting events is a real risk that the proposal acknowledges but does not fully solve.
- Terrain mutation mid-wave requires the grid snapshot to stay in sync with `GridModel`, adding another sync surface.
- Most complex of the three: new `WaterGrid` class, sync loop, registry, drain rate, terrain snapshot refresh.

## Key design decisions

**1. Runtime as Actor, not scene subscription.** The runtime extends `Actor` with `z: -100` and uses `onPreUpdate`. If testing shows update order is unreliable, fall back to `scene.on('preupdate', ...)`. This decision is shared by all three proposals and is clearly correct.

**2. No dual source of truth.** Actor state is the only truth. No `WaterGrid` shadow state. The pressure pass reads from and writes to live segment depth. This avoids the desync problems in Proposal C.

**3. Spread segments emit their own events.** When the runtime initializes a spread segment at a cell, the segment runs terrain interaction logic and emits events through its listeners. The runtime subscribes to those events through the same `onWaveEvent` path as initial segments. This keeps event ownership on the segment, not split between segment and runtime (Proposal B's flaw).

**4. Still-clone creation moves to runtime via callback, not event.** Proposal A suggested a `stillRequested` event type. This is unnecessary protocol noise. Instead, use a callback approach: `WaveSegment` calls a `onStillNeeded` callback when crossing a grid boundary. The runtime creates the still segment from the pool. Cleaner than a new event type that the applier must ignore.

**5. Spread segments do not call `replanFromRow`.** Unlike Proposal B, `adjustDepth` on a spread segment only changes depth. Spread segments have `speed: 0` and empty `plannedCells`. They do not surge. Surging segments are never targets of the pressure pass (their depth comes from their own planned cells, not from neighbors).

**6. No damping loss initially.** Start with 0% transfer loss. Add 2-5% if oscillation is observed during playtesting. The threshold + max-transfer-fraction already prevent most oscillation.

**7. Spread only targets still/crashed segments and dry cells.** The pressure pass skips surging and receding segments as both donors and recipients. Only still water and crashed (paused) water participate. This prevents interference with the vertical surge mechanics.

## Implementation

### Phase 1: Runtime as Actor + still-clone unification

Goal: mechanical refactor with zero behavior change. All existing tests pass.

#### Task 1.1: Convert `WaveActorRuntime` to `Actor`

File: `src/wave/wave-actor-runtime.ts`

- Change `class WaveActorRuntime` to `extends Actor`.
- Constructor calls `super({ name: "WaveActorRuntime", z: -100 })`, sets `this.graphics.isVisible = false`, `this.body.collisionType = CollisionType.PreventCollision`.
- In `playWave()`, add `this.scene.add(this)` (or accept scene in constructor and add there). In cleanup / resolve, `this.scene.remove(this)`.
- Add empty `override onPreUpdate(_engine: Engine, _delta: number): void {}` as a placeholder.

File: `src/wave/wave-actor-runtime.test.ts`

- The existing mock-based tests create `WaveActorRuntime` with a mock scene. Since `Actor` constructor does not require a scene, these tests still work. But `scene.add` will now also be called with the runtime itself. Update `expect(scene.add).toHaveBeenCalledTimes(3)` to `4` (runtime + overlay + 2 segments, or runtime + overlay + 1 segment depending on the test).

#### Task 1.2: Move still-clone creation to runtime

File: `src/wave/wave-segment.ts`

- Add a public callback property:
  ```ts
  onStillNeeded: ((col: number, row: number, depth: number, agedMs: number) => void) | null = null;
  ```
- In `onPostUpdate`, replace the `this.spawnStillClone(engine)` call with:
  ```ts
  if (this.onStillNeeded) {
    this.onStillNeeded(this.gridLoc.x, this.gridLoc.y, this.currentDepth, this.agedMs);
  }
  ```
- Keep `spawnStillClone` as a private method for now (used as reference). Mark it with a `// @deprecated` comment. Remove in Phase 5.

File: `src/wave/wave-actor-runtime.ts`

- Add a `createStillSegment(col, row, depth, agedMs)` method that:
  - Creates a `WaveSegment` with `speed: 0`, `maxTravelDistance: 0`, positioned at cell center.
  - Sets `CollisionType.Passive`, clears and resets collider to a small circle (same as current `spawnStillClone`).
  - Sets `agedMs` on the clone (need to make `agedMs` settable; currently `protected`. Change to public or add a setter).
  - Registers the segment: subscribes to events, adds to `actors`, increments `remaining`, adds to scene.
- When creating initial segments in `playWave()`, set `segment.onStillNeeded = (col, row, depth, agedMs) => this.createStillSegment(col, row, depth, agedMs)`.
- Schedule the scene add with `engine.clock.schedule(() => ..., 50)` to match the current 50ms delay in `spawnStillClone`.

File: `src/wave/wave-segment.ts`

- Change `protected agedMs` to `public agedMs` so the runtime can set it on still clones.

#### Task 1.3: Add `gridRow` accessor to `WaveSegment`

File: `src/wave/wave-segment.ts`

- Add:
  ```ts
  get gridRow(): number { return this.gridLoc.y; }
  ```

#### Task 1.4: Add `width` to `WaveSegmentGrid` interface

File: `src/wave/wave-segment-types.ts`

- Add `width: number` to the `WaveSegmentGrid` interface.

File: `src/model/grid-model.ts`

- `GridModel` already has `this.width`. Confirm it satisfies the interface. If `GridModel` implements `WaveSegmentGrid`, add the `width` property to its implementation.

#### Task 1.5: Validate

- Run `node --run static-check`. All tests pass. No behavior change.
- Visually confirm wave behavior is identical.

### Phase 2: Segment pool infrastructure

Goal: create the pool machinery without enabling lateral spreading yet.

#### Task 2.1: Add spread pool to runtime

File: `src/wave/wave-actor-runtime.ts`

- Add private fields:
  ```ts
  private spreadPool: WaveSegment[] = [];
  private activeSpreadCount = 0;
  ```
- Add constants (inline or from config):
  ```ts
  const MAX_SPREAD_SEGMENTS = 48;
  ```
- Add `acquireSpreadSegment(col, row, depth): WaveSegment | null`:
  - If `activeSpreadCount >= MAX_SPREAD_SEGMENTS`, return null.
  - Create a new `WaveSegment` with `speed: 0`, positioned at cell center, `CollisionType.Passive`.
  - Register it (subscribe events, add to `actors`, increment `remaining`).
  - Increment `activeSpreadCount`.
  - Add to scene.
  - Return the segment.
- On spread segment dissipation, decrement `activeSpreadCount`.

#### Task 2.2: Add `adjustDepth` to `WaveSegment`

File: `src/wave/wave-segment.ts`

```ts
adjustDepth(delta: number): void {
  this.currentDepth = Math.max(0, this.currentDepth + delta);
  if (this.currentDepth <= MIN_DEPTH && this.state === "still") {
    this.beginRecession();
  }
}
```

Also make `beginRecession` accessible. Currently private. Change to `protected` or extract the force-recede logic into a public method:

```ts
forceRecede(): void {
  if (this.state === "still" || this.state === "crashing") {
    this.beginRecession();
  }
}
```

#### Task 2.3: Spread segment terrain interaction

File: `src/wave/wave-segment.ts`

Add a method for spread segments to run terrain interaction on initialization:

```ts
initializeAtCell(col: number, row: number): void {
  if (this.grid.isCastle(col, row)) {
    this.emitWaveEvent({ type: "castleFlooded", col, row });
    return;
  }

  this.emitWaveEvent({ type: "tileEntered", col, row, depth: this.currentDepth });

  const elevation = this.grid.getElevation(col, row);
  if (elevation > 0) {
    if (elevation >= this.currentDepth) {
      this.emitWaveEvent({ type: "blocked", col, row });
      this.currentDepth = 0;
      this.forceRecede();
      return;
    }
    this.currentDepth -= elevation;
    this.emitWaveEvent({ type: "overtopped", col, row });
  } else if (elevation < 0) {
    const absorbed = Math.min(this.currentDepth, this.grid.effectiveHoleDepth(col, row));
    if (absorbed > 0) {
      this.currentDepth -= absorbed;
      this.emitWaveEvent({ type: "absorbed", col, row, absorbedDepth: absorbed });
    }
  }

  this.emitWaveEvent({ type: "tileCovered", col, row });

  if (this.currentDepth <= MIN_DEPTH) {
    this.forceRecede();
  }
}
```

This keeps event emission on the segment, matching the existing pattern. The runtime calls this after creating a spread segment.

#### Task 2.4: Validate

- Run `node --run static-check`. All tests pass. Pool exists but is never used.

### Phase 3: Lateral pressure pass

Goal: implement the spreading algorithm. Water spreads around obstacles.

#### Task 3.1: Add spreading constants to config

File: `src/config.ts`

```ts
export const SPREAD_RATE = 2.0;
export const SPREAD_THRESHOLD = 0.3;
export const MAX_TRANSFER_FRACTION = 0.4;
export const MAX_SPREAD_SEGMENTS = 48;
```

#### Task 3.2: Build spatial index

File: `src/wave/wave-actor-runtime.ts`

```ts
private buildSpatialIndex(): Map<string, WaveSegment[]> {
  const index = new Map<string, WaveSegment[]>();
  for (const seg of this.actors) {
    if (seg.state === "dead" || seg.state === "surging" || seg.state === "receding") {
      continue;
    }
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

Note: only still and crashing segments enter the index. Surging segments are excluded because their depth is managed by their own planned cells.

#### Task 3.3: Pressure pass in `onPreUpdate`

File: `src/wave/wave-actor-runtime.ts`

```ts
override onPreUpdate(_engine: Engine, delta: number): void {
  if (!this.activeRun) { return; }
  this.runSpreadingPass(delta);
}

private runSpreadingPass(delta: number): void {
  const index = this.buildSpatialIndex();
  const transfers: Array<{
    from: WaveSegment;
    toCol: number;
    toRow: number;
    amount: number;
  }> = [];

  for (const [key, segments] of index) {
    const [colStr, rowStr] = key.split(",");
    const col = Number(colStr);
    const row = Number(rowStr);

    // Use the highest-depth segment in this cell as the donor
    let primarySeg = segments[0];
    for (const seg of segments) {
      if (seg.currentDepth > primarySeg.currentDepth) {
        primarySeg = seg;
      }
    }

    if (primarySeg.currentDepth <= SPREAD_THRESHOLD) { continue; }

    const myElev = this.grid.getElevation(col, row);
    const mySurface = Math.max(0, myElev) + primarySeg.currentDepth;

    for (const neighborCol of [col - 1, col + 1]) {
      if (neighborCol < 0 || neighborCol >= this.grid.width) { continue; }
      if (this.grid.isCastle(neighborCol, row)) { continue; }

      const neighborElev = this.grid.getElevation(neighborCol, row);
      // Wall/tower fully blocks if its elevation >= our surface
      if (neighborElev > 0 && neighborElev >= mySurface) { continue; }

      const neighborKey = `${neighborCol},${row}`;
      const neighborSegs = index.get(neighborKey);
      let neighborDepth = 0;
      if (neighborSegs) {
        for (const s of neighborSegs) {
          if (s.currentDepth > neighborDepth) {
            neighborDepth = s.currentDepth;
          }
        }
      }
      const neighborSurface = Math.max(0, neighborElev) + neighborDepth;

      const diff = mySurface - neighborSurface;
      if (diff <= SPREAD_THRESHOLD) { continue; }

      const raw = diff * SPREAD_RATE * (delta / 1000);
      const maxDonation = primarySeg.currentDepth * MAX_TRANSFER_FRACTION;
      const amount = Math.min(raw, maxDonation, primarySeg.currentDepth);
      if (amount < 0.01) { continue; }

      transfers.push({ from: primarySeg, toCol: neighborCol, toRow: row, amount });
    }
  }

  this.applyTransfers(transfers, index);
}
```

#### Task 3.4: Apply transfers

File: `src/wave/wave-actor-runtime.ts`

```ts
private applyTransfers(
  transfers: Array<{ from: WaveSegment; toCol: number; toRow: number; amount: number }>,
  index: Map<string, WaveSegment[]>,
): void {
  for (const { from, toCol, toRow, amount } of transfers) {
    if (from.currentDepth < amount) { continue; }

    const neighborKey = `${toCol},${toRow}`;
    const neighborSegs = index.get(neighborKey);

    if (neighborSegs && neighborSegs.length > 0) {
      // Transfer into existing segment
      let target = neighborSegs[0];
      for (const s of neighborSegs) {
        if (s.currentDepth > target.currentDepth) {
          target = s;
        }
      }
      from.adjustDepth(-amount);
      target.adjustDepth(amount);
    } else {
      // Spawn new spread segment
      const seg = this.acquireSpreadSegment(toCol, toRow, amount);
      if (!seg) { continue; } // pool exhausted
      from.adjustDepth(-amount);
      seg.initializeAtCell(toCol, toRow);

      // Add to index so subsequent transfers in this frame can target it
      index.set(neighborKey, [seg]);
    }
  }

  // Force-dissipate negligible still segments
  for (const seg of this.actors) {
    if (seg.state === "still" && seg.currentDepth <= MIN_DEPTH) {
      seg.forceRecede();
    }
  }
}
```

Where `MIN_DEPTH = 0.05` (import from segment or define locally).

#### Task 3.5: Fix `WaveSegment.col` to return current column

File: `src/wave/wave-segment.ts`

Currently:
```ts
get col(): number {
  return this.spawn.col;
}
```

For surging segments this is correct (they stay in their spawn column). For spread segments and still clones, `spawn.col` is set to `gridLoc.x` at creation, so it is also correct. No change needed here. But verify this by checking that `createStillSegment` and `acquireSpreadSegment` both set `spawn.col` to the target column.

#### Task 3.6: Unit tests for pressure calculation

File: `src/wave/wave-spreading.test.ts` (new file)

Test the pure pressure logic:
- Two adjacent cells with depth 4 and 0: transfer occurs, amount is bounded by `MAX_TRANSFER_FRACTION`.
- Two cells with equal depth: no transfer (diff <= threshold).
- Cell adjacent to a wall taller than the water surface: no transfer.
- Cell adjacent to a wall shorter than the water surface: transfer occurs, effective transfer respects wall height.
- Castle cell as neighbor: no transfer.
- Out-of-bounds neighbor: no transfer.
- Pool exhaustion: transfer skipped when pool is full.

These tests can mock `WaveSegment` the same way `wave-actor-runtime.test.ts` does, or extract the pressure calculation into a pure function that takes depth/elevation arrays and returns transfers.

**Recommended**: extract the core pressure calculation into a pure function `computeTransfers(cells: CellSnapshot[], gridWidth: number, delta: number): Transfer[]` in a new file `src/wave/wave-spreading.ts`. This makes it unit-testable without Excalibur. The runtime calls this function and applies the results to actors.

File: `src/wave/wave-spreading.ts` (new file)

```ts
export interface CellSnapshot {
  col: number;
  row: number;
  depth: number;
  elevation: number;
  isCastle: boolean;
}

export interface Transfer {
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
  amount: number;
}

export function computeTransfers(
  cells: CellSnapshot[],
  gridWidth: number,
  delta: number,
  config: { spreadRate: number; spreadThreshold: number; maxTransferFraction: number },
): Transfer[] { ... }
```

#### Task 3.7: Browser tests for end-to-end spread

File: `src/wave/wave-spreading.browser.test.ts` (new file)

- Set up a grid with a wall in column 4. Spawn a wave with high depth in column 4. Step the engine forward. Verify that a spread segment exists in column 3 or 5 with positive depth.
- Set up a grid with a hole adjacent to a wall. Verify spread water is absorbed by the hole.
- Verify wave still resolves (promise settles) after spreading.

#### Task 3.8: Validate

- Run `node --run static-check`. All tests pass.
- Visual verification: water visibly spreads around walls.

### Phase 4: Overlay compatibility

Goal: ensure the overlay renders spread water correctly.

#### Task 4.1: Verify overlay picks up spread segments

The overlay queries `this.scene?.actors` for `WaveSegment` instances and reads `actor.col`, `actor.pos.y`, `actor.currentDepth`, and `actor.derivedState`. Spread segments are `WaveSegment` actors in the scene with all these properties. No code changes should be needed.

Verify visually that spread water renders. If there are visual artifacts at wall boundaries (Catmull-Rom bleeding water into wall columns), add zero-depth breaks: in `buildCoverageData`, skip columns where `getElevation(col, row) > 0` and no segment exists.

#### Task 4.2: Validate

- Visual verification. Fix overlay artifacts if any.

### Phase 5: Cleanup and docs

#### Task 5.1: Remove deprecated `spawnStillClone`

File: `src/wave/wave-segment.ts`

- Delete the `spawnStillClone` method.
- Remove the CircleCollider import if no longer needed.

#### Task 5.2: Update gameplay docs

File: `docs/gameplay.md`

- Update the "Wave phase" section to document lateral spreading behavior.
- Add a note that blocked water spreads into adjacent columns based on pressure differential.
- Document the tuning constants.

#### Task 5.3: Update AGENTS.md

File: `AGENTS.md`

- Add `wave-spreading.ts` to the wave runtime section.
- Update the `WaveActorRuntime` description to mention it extends `Actor` and runs a pressure pass.

#### Task 5.4: Final validation

- Run `node --run static-check`.

## Test strategy

**Unit tests** (Vitest, no browser):
- `wave-spreading.test.ts`: pure function tests for `computeTransfers`. Cover all edge cases: walls, holes, castles, bounds, pool exhaustion, threshold behavior, transfer clamping.
- `wave-actor-runtime.test.ts`: update existing mock-based tests to account for the runtime being an Actor. Add tests for: still-clone creation via callback, spread segment registration and dissipation counting, cleanup with active spread segments.

**Browser tests** (Vitest browser project):
- `wave-spreading.browser.test.ts`: end-to-end tests with a real Excalibur engine. Verify spread segments are created when water is blocked, events fire correctly, wave resolves.
- `wave-segment.browser.test.ts`: existing tests should pass unchanged. Add a test for `initializeAtCell` on a spread segment.

**Manual playtesting**:
- Build a wall across 3-4 columns. Verify water spreads around the edges.
- Build a U-shaped moat behind a wall. Verify spread water fills the moat.
- Build a complete wall across all 16 columns. Verify water does not spread (no open neighbor).
- Play Tide mode with overlapping waves. Verify no actor explosion or wave resolution hang.
- Verify castle flooding still works from both direct surge and lateral spread paths.

## Risks and mitigations

**Gameplay balance shift.** Walls become less effective as standalone defenses because water routes around them. Mitigation: start with conservative `SPREAD_RATE` (2.0) and high `SPREAD_THRESHOLD` (0.3). Tune after playtesting. Spreading should feel like a secondary effect, not the primary wave driver.

**Wave resolution delay.** More segments means the wave takes longer to resolve. Mitigation: force-dissipate spread segments with depth below `MIN_DEPTH`. Add a runtime-level timeout (15s) that force-resolves the wave if segments are stuck.

**Tide mode overlapping waves.** Spread segments from wave N could interact with surge segments from wave N+1. The pool is shared. Mitigation: the pool cap (48) limits total spread segments across all concurrent waves. If this causes starvation, partition the pool per wave run.

**Still-clone refactor risk.** Moving still-clone creation from `WaveSegment` to the runtime is the riskiest change in Phase 1. It touches the critical path for every wave. Mitigation: Phase 1 has zero behavior change as its success criterion. Run all existing browser tests and visually confirm before proceeding.

**Excalibur update order.** The runtime relies on `onPreUpdate` firing before segment updates. If Excalibur does not guarantee this by z-order, fall back to `scene.on('preupdate', ...)`. Test this in Phase 1 by adding a log and verifying ordering.

**Collision merging with spread segments.** Spread segments use `CollisionType.Passive` with a small circle collider. They should not trigger `onCollisionStart` merges with surging segments. Verify this in browser tests. If merges happen, switch spread segments to `CollisionType.PreventCollision`.
