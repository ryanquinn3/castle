# Wave segment actor design

## Context

Wave simulation currently runs in the model layer. `simulateWave()` computes advance and recede snapshots, puddle deltas, wall erosion events, and castle flooding. `WaveRenderer` then plays those snapshots by spawning short-lived Excalibur overlay actors.

That split has kept the rules easy to test, but wave behavior now wants to become more actor-like. We want individual wave columns to move, crash, recede, and eventually collide in the Excalibur world instead of being only rendered snapshots.

## Goal

Move wave runtime toward one Excalibur actor per wave column.

The first milestone should establish the new architecture, not rebuild every wave feature. A `WaveSegment` actor should move with Excalibur velocity, detect grid row entry, emit gameplay events, and drive immediate grid updates through session-level listeners.

This is an intentional behavior change. We are no longer trying to preserve exact parity with `simulateWave()`. The new flow should keep the same game concept: water advances from the ocean, terrain reduces or blocks it, holes absorb it, and reaching the castle ends the run.

## Non-goals for the first milestone

- No lateral water spread.
- No full terrain actor collision world.
- No exact parity test against `simulateWave()`.
- No complete rewrite of erosion tuning.
- No removal of the old simulation until the actor path has enough coverage.

## Chosen architecture

The runtime should use one `WaveSegment extends Actor` per column.

Wave spawning creates segment configs from the current grid layout and wave parameters. Each segment is initialized with its column, pixel spawn position, initial depth, velocity, travel limits, and whatever grid access it needs to evaluate tile entry.

The segment owns its lifecycle:

```ts
type WaveState = 'surging' | 'crashing' | 'receding' | 'dead';
```

During `surging`, the segment moves south using Excalibur `vel`. It tracks row crossings from its pixel position. When it enters a new grid row, it evaluates the tile in its column, updates its own depth/state, and emits an event. The session binds listeners to those events and mutates `GridModel` immediately.

This keeps the runtime actor-first. The grid does not simulate the wave in advance. It responds to events from moving wave actors.

## Wave generation

Wave generation should stop producing only `columnHeights` for `simulateWave()`. It should produce spawn configs for actors:

```ts
interface WaveSegmentSpawn {
  col: number;
  x: number;
  y: number;
  initialDepth: number;
  speed: number;
  maxTravelDistance: number;
}
```

For the first pass, `initialDepth` can still come from the existing peak and valley wave curve. That avoids changing depth balance and movement architecture at the same time.

The new part is spawn position. Each column gets a `y` offset from a noise-shaped wave front, similar to the sample `SimplexNoise` approach. The result is a staggered wave front with one actor per column. Later, depth, speed, width, foam amount, and drift can also use noise.

## Events and grid mutation

Segments emit gameplay events as they move:

```ts
type WaveSegmentEvent =
  | { type: 'tileEntered'; col: number; row: number; depth: number }
  | { type: 'blocked'; col: number; row: number; depth: number }
  | { type: 'overtopped'; col: number; row: number; depth: number }
  | { type: 'absorbed'; col: number; row: number; depth: number }
  | { type: 'castleFlooded'; col: number; row: number; depth: number }
  | { type: 'dissipated'; col: number; row: number };
```

Session-level listeners apply events to `GridModel` immediately. Every segment event counts, including repeated hits to the same tile during one wave. This may make erosion and filling stronger than the current snapshot-based model, but it matches the chosen actor mental model.

Initial rules should stay simple:

- Flat ground reduces segment depth by terrain slope when entered.
- A wall or tower blocks the segment if elevation is at least the current depth.
- A lower wall or tower is overtopped and reduces the remaining depth.
- A hole absorbs as much depth as it can.
- Reaching a castle tile emits `castleFlooded` and ends the run.
- If the segment is blocked, absorbed, exhausted, or reaches its travel limit, it crashes and then recedes.

The first actor version should not redistribute blocked water into neighboring columns. Sideways flow can return later as segment splitting, neighbor influence, or a separate lateral event pass.

## Rendering and lifecycle

`WaveSegment` owns its water visual. The first visual can be a rectangle or simple canvas graphic with color and alpha based on depth. It does not need the current smoothed per-cell overlay.

Lifecycle:

- `surging`: move south using `vel`, update depth/color, emit tile events.
- `crashing`: stop movement, show foam or impact color, pause briefly.
- `receding`: move north using `vel`, fade out through Excalibur actions.
- `dead`: remove the actor from the scene.

`WaveRenderer` should be replaced or reduced to a small runtime class that spawns and tracks wave segment actors. Existing flash helpers for erosion and castle flooding can stay temporarily if they still fit. The water body itself should come from the segment actors.

## Testing and migration

Keep the old simulation code while the actor path is built. It remains useful as reference material and for existing tests until the new runtime is stable.

Add focused tests for the new behavior:

- Spawn generation creates one segment per column with valid depth, position, speed, and travel limits.
- Row-entry tracking emits tile events as a segment crosses grid rows.
- Segment lifecycle transitions from `surging` to `crashing`, `receding`, and `dead`.
- Event listeners apply immediate mutations to `GridModel`.
- Session integration starts a wave, tracks segment cleanup, and still triggers game over on castle flooding.

Do not write exact parity tests against `simulateWave()`. The actor-first runtime changes event ordering and repeated-hit behavior by design.

## Open implementation details

The implementation plan should decide these details before coding:

- Whether `WaveSegment` receives a direct grid adapter or only a terrain snapshot plus event callbacks.
- Whether the noise function should use a dependency or a tiny local deterministic noise helper.
- How completion is detected when many segments die at different times.
- Where immediate erosion and puddle updates should live so sessions do not grow too large.
