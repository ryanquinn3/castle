# Static water wave trail design

## Context

`docs/plans/2026-06-04-wave-segment-actor.md` moved the wave runtime toward one `WaveSegment` actor per column. The implemented actor path now has `WaveSegment` instances moving south during surge, emitting gameplay events as they enter grid rows, then switching to a northward recede and fading out.

The current actor visual only represents the moving segment. When a segment moves south, cells it has already crossed visually dry immediately. The previous snapshot renderer kept water overlays in visited cells until the recede frames removed them, so actor-driven waves need an equivalent trail.

## Goal

When a `WaveSegment` surges south, each visited cell should retain visible water until that segment physically recedes through the cell.

The retained water should be actor-based, not only data in a renderer. A receding wave segment should remove static water by colliding with the static water actor.

## Non-goals

- No gameplay state changes from static water occupancy in this milestone.
- No puddle persistence after recede.
- No lateral spread or merging between neighboring static water actors.
- No terrain actor collision integration.
- No timer-first cleanup behavior, except as a defensive fallback if needed later.

## Chosen architecture

Add a visual-only `StaticWaterActor` for retained water in grid cells visited by a wave segment.

`WaveSegment` remains responsible for movement, row entry, terrain interaction, depth changes, and wave lifecycle. `WaveActorRuntime` remains responsible for coordinating segment actors and applying gameplay events.

The new trail behavior should sit beside the existing runtime:

- During surge, `WaveSegment` emits `tileEntered` for each newly entered row.
- Runtime creates a `StaticWaterActor` at the matching grid cell for that same segment.
- The static water actor remains fixed in world space while the segment keeps moving south.
- During recede, the `WaveSegment` moves north with collision enabled.
- When the receding segment collides with one of its static water actors, the static water fades or kills itself.
- Runtime cleanup removes any remaining static water actors if the wave is cancelled, scene resets, or a segment dies before all trail actors are removed.

This makes the trail actor-native while preserving the model/runtime separation: static water is visible wave residue, not persisted terrain state.

## Collision design

Excalibur actors have box colliders from width and height, but collision events require participating collision types. Excalibur collision docs indicate `Passive` actors produce collision events without physical resolution, which is the right behavior for water visuals.

Use passive collision for both water actor types:

- `WaveSegment`: `CollisionType.Passive`
- `StaticWaterActor`: `CollisionType.Passive`

Handle `collisionstart` on `StaticWaterActor` or `WaveSegment`. Static water should only remove itself when the other actor is its owning segment and that segment is currently `receding`. This guard prevents the surge segment from immediately deleting water it just created.

Add a water collision group or equivalent type guard so these water actors do not accidentally interact with future terrain or UI actors. If collision groups prove awkward in the current Excalibur version, keep a strict runtime type/owner check in the collision handler for the first pass.

## Static water actor

`StaticWaterActor` should be a small actor class with these responsibilities:

- Store `col`, `row`, and owning `WaveSegment` identity.
- Render a fixed water tile at the grid cell center using `Resources.BeachTileset`.
- Build water graphics from `beach_tileset.png`, a 16x16 spritesheet. Use row 0 columns 5 and 6, and row 1 columns 5 and 6 as the available static water sprite variants.
- Pick a sprite variant deterministically from the cell position or segment identity so the trail has texture variation without flicker.
- Ignore collisions unless the owner segment is receding.
- Fade then kill itself when removed by recede collision.
- Expose a direct `cleanup()` or `removeNow()` path for runtime cancellation.

It should not mutate `GridModel`, apply erosion, fill holes, or dispatch gameplay events.

## Runtime responsibilities

`WaveActorRuntime` should own the collection of static water actors created during a wave run.

On `tileEntered`, runtime creates and adds the static water actor before or after applying the gameplay event. The actor may store the event depth for future effects, but the first visual should be the selected beach tileset water sprite.

On segment `dissipated`, runtime should not assume every static water actor has already been removed by collision. It should clean up any remaining static water owned by that segment. This handles edge cases such as low frame rates, skipped collision pairs, or a segment killed during scene cleanup.

On `cleanup()`, runtime should remove active moving segments and all static water actors.

## Excalibur API notes

Docs reviewed:

- Actors: custom actors should put per-frame logic in `onPostUpdate`; actors must be added to a scene to update and draw; actors default to centered anchors.
- Sprite sheets: the existing `SandLayer` builds beach tile graphics with `SpriteSheet.fromImageSource`; static water should use the same `Resources.BeachTileset` source and 16x16 tile sizing.
- Collision events: `collisionstart` fires once when two bodies first touch; `precollision` fires every intersecting frame.
- Collision types: `Passive` actors raise events without resolution; `PreventCollision` actors do not raise events.
- Timers and clock: `Timer` and `Clock.schedule()` are useful for scene-synchronized delayed callbacks, but they should not drive the primary trail removal because the desired behavior is physical recede contact.

## Testing

Add focused unit tests around actor behavior and runtime coordination:

- Static water ignores collisions while the owner segment is surging.
- Static water removes itself on collision with its owner segment when the owner is receding.
- Static water ignores collisions with non-owner wave segments.
- Runtime creates static water on `tileEntered` events.
- Runtime removes remaining static water on segment `dissipated` and `cleanup()`.
- Existing wave runtime tests continue to verify result aggregation and gameplay event application.

Avoid parity tests against the old snapshot renderer. The actor runtime is intentionally behaviorally different.

## Open implementation decisions

The implementation plan should decide:

- Whether the collision handler lives in `StaticWaterActor` or in `WaveActorRuntime`.
- Whether to introduce collision groups immediately or rely on owner/type guards for the first pass.
- Whether static water should fade on removal or disappear instantly in tests with fade only in production actor actions.
