# Wave Behavior Problem Statement

## Purpose

This note summarizes the current wave behavior problem, known assumptions, and relevant code state. It is intended as input for an engineer to propose implementation options. It does not choose or recommend an approach.

## Problem Statement

The live wave system behaves primarily as independent vertical column travelers. Each wave column moves downward through the grid, interacts with terrain in that same column, then recedes when blocked, absorbed, exhausted, or out of bounds.

This creates behavior that can feel less natural than water should. Examples:

- A wave blocked by a wall or tower does not meaningfully spread into adjacent cells.
- A high-depth column does not naturally bleed into lower-depth or dry neighboring cells.
- Water motion is visually smoother than the older row animation, but the underlying behavior remains column-oriented.
- The current live wave path does not model local pressure between adjacent wet cells.

The desired exploration is a more natural actor-driven wave behavior where Excalibur runtime actors remain the source of truth, but water can respond locally to surrounding wetness, dry cells, and terrain constraints.

## Current High-Level Code State

### Live Wave Runtime

The live gameplay path uses the actor runtime:

- `src/wave/wave-actor-runtime.ts`
- `src/wave/wave-segment.ts`
- `src/wave/wave-segment-types.ts`
- `src/wave/wave-spawner.ts`
- `src/wave/wave-overlay.ts`
- `src/wave/wave-event-applier.ts`

`LevelSession` and `TideSession` create `WaveActorRuntime`, generate one `WaveSegmentSpawn` per column, and await `playWave(spawns)`.

### WaveSegment

`WaveSegment` is an Excalibur `Actor`.

Current behavior:

- One segment is spawned per wave column.
- The segment stores its original `spawn.col` and reports that as `col`.
- Surge movement is vertical; `updateSurgeVelocity()` sets `vel` to `(0, easedY)`.
- The segment precomputes `plannedCells` for a single column.
- `planWaveCells()` starts at row `0` and advances down the original spawn column.
- `enterRow()` emits gameplay events for the current row in the original spawn column.
- Blocking terrain causes a `blocked` event, sets depth to `0`, and triggers recession.
- Overtopped terrain reduces depth and continues downward in the same column.
- Holes absorb depth in the same column.
- Castle entry emits `castleFlooded` and triggers recession.
- Segment-to-segment collision can merge overlapping wave segments with momentum conservation.
- Still-water clones are currently created inside `WaveSegment.spawnStillClone()`.

Relevant lifecycle hooks:

- `onPreUpdate()` updates mass from current depth.
- `onPostUpdate()` handles grid-row entry, surge/recession state transitions, travel dissipation, and still clone creation.
- `onCollisionStart()` merges with another `WaveSegment`.

### WaveActorRuntime

`WaveActorRuntime` is currently a plain TypeScript class, not an Excalibur actor or ECS system.

Current responsibilities:

- Creates initial `WaveSegment` actors from input spawns.
- Subscribes to each initial segment's wave events.
- Applies events through `WaveEventApplier`.
- Tracks result state: castle flooding, eroded tiles, sand redistribution, event history.
- Resolves the wave promise after all initially registered segments dissipate.
- Creates and removes the `WaveOverlay`.
- Cleans up active wave actors on session cleanup.

Important constraint:

- Runtime event/result accounting is based on registered segments.
- Segments created outside the runtime registration path may not be included in result accounting unless explicitly registered.

### WaveOverlay

`WaveOverlay` is an Excalibur `Actor` that queries `this.scene?.actors` during `onPreUpdate()` and collects all `WaveSegment` actors.

It renders a smoothed water mask from segment data:

- Buckets segments by `col`.
- Computes per-column maximum depth and leading edge.
- Produces a visual coverage texture with depth and foam channels.

This is a useful precedent for scene-level querying of wave actors, but the overlay is visual-only.

### Wave Events and Terrain Application

`WaveSegment` emits events such as:

- `tileEntered`
- `tileCovered`
- `blocked`
- `overtopped`
- `absorbed`
- `castleFlooded`
- `dissipated`

`WaveEventApplier` applies those events to `GridModel` and `SandLayer`.

Current effects:

- `absorbed` adds puddle depth to holes.
- `blocked` and `overtopped` may trigger sand redistribution, but walls do not redistribute.
- `tileCovered` updates moist sand coverage.
- `tileEntered` applies wave hit erosion.
- `castleFlooded` marks loss state.

### Dead or Non-Live Flow Model

The model layer still contains a grid/row flow implementation:

- `src/model/flow-field.ts`
- `src/model/wave-simulation.ts`
- `src/model/water-column.ts`

It includes tested behavior for lateral spreading, blocked-water redistribution, holes, receding water, and enclosed pools. However, this is not the live wave implementation used by the current wave phase. It should be treated as reference material only unless an explicit design chooses to revive or reuse parts of it.

## Assumptions

- Excalibur actors and physics should remain the live source of truth for wave behavior.
- The feature should not replace the live actor runtime with the older grid simulation by default.
- More natural behavior means local water movement should respond to adjacent wetness, dry cells, and terrain, not only to the starting column.
- The solution should preserve existing gameplay event semantics where possible, especially castle flooding, erosion, hole absorption, sand coverage, and wave completion.
- Any newly created gameplay-relevant wave actor must be included in runtime accounting, cleanup, and event application.
- The visual overlay may need updates if wave actors stop mapping cleanly to one immutable column.
- Performance matters because pressure or spreading can increase active wave actor count.
- The implementation should avoid unbounded actor creation.
- The current row/column grid remains tile-based; sub-tile fluid simulation is not assumed.

## Open Questions For Design Options

- Should the runtime itself become an Excalibur actor with `onPreUpdate()` so it can coordinate pressure before physics updates?
- Should pressure calculations query `scene.actors` directly, maintain a runtime-owned segment registry, or both?
- Should local spreading happen only left/right in the same row, or also into rows above/below under some conditions?
- Should spread create new `WaveSegment` actors, transfer depth into existing neighboring actors, or both?
- Should transferred water conserve depth exactly, or should it lose some depth for damping and gameplay stability?
- How should pressure-spawned segments plan their future terrain interactions if they start below row `0`?
- Should still-water clones remain inside `WaveSegment`, or should runtime own all segment creation?
- How should terrain elevation, hole depth, wall height, and existing wet depth contribute to a local pressure calculation?
- How should collisions and pressure transfer interact when multiple segments occupy or enter the same cell?

## Constraints To Preserve

- Classic and Tide both use the same live actor runtime path.
- Existing sessions expect `playWave(spawns)` to resolve with `WaveActorRuntimeResult`.
- `WaveEventApplier` is the current bridge from wave events to terrain changes.
- `GridModel` owns terrain actors and terrain mutation.
- `SandLayer` coverage is currently driven by `tileCovered` events.
- Castle flooding is terminal for the wave outcome.
- Existing tests cover current `WaveSegment`, `WaveActorRuntime`, `WaveOverlay`, and event-applier behavior.

## Files Worth Reviewing First

- `src/wave/wave-segment.ts`
- `src/wave/wave-actor-runtime.ts`
- `src/wave/wave-segment-types.ts`
- `src/wave/wave-overlay.ts`
- `src/wave/wave-event-applier.ts`
- `src/wave/wave-segment.browser.test.ts`
- `src/wave/wave-actor-runtime.test.ts`
- `src/wave/wave-overlay.test.ts`
- `src/model/flow-field.ts`
- `src/model/flow-field.test.ts`
- `docs/gameplay.md`
