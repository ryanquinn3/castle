# Wave segment depth-driven alpha

## Goal

Remove the unused `color` property from `WaveSegment` and make rendered water depth visible through sprite alpha instead.

Shallow water should look more transparent. Deeper water should look less transparent, but still capped below full opacity.

## Current problem

`WaveSegment` currently assigns `color` in the actor constructor and updates it as depth changes. The visible water graphic is a sprite installed through `this.graphics.use(sprite)`, so the actor color does not drive the rendered result.

That leaves depth-based visual state effectively disconnected from the actual image on screen.

## Chosen approach

Keep the existing sprite-based rendering path and move depth visualization to sprite opacity.

- Remove `depthColor()` and all actor `color` assignments.
- Replace them with a small helper that maps depth to alpha.
- Apply the returned alpha directly to the sprite graphic used by the actor.
- Continue updating that visual state whenever `currentDepth` changes during surge.

This is the smallest change that fixes the current no-op behavior without introducing a new rendering system.

## Alpha mapping

Use clamped constants:

```ts
const MIN_WAVE_ALPHA = 0.2;
const MAX_WAVE_ALPHA = 0.85;
```

Map depth linearly across the same rough range implied by the current visual tuning, which is approximately depth `1..9`.

Behavior:

- depth at or below the low end uses `MIN_WAVE_ALPHA`
- depth at or above the high end uses `MAX_WAVE_ALPHA`
- depths in between interpolate linearly

This keeps very shallow water visible while making deeper water read as denser.

## Lifecycle behavior

- `surging`: update sprite opacity from `currentDepth`
- `crashing`: do not rely on actor color resets; keep the existing state transition behavior otherwise
- `receding`: no new fade system is needed for this change
- `dead`: unchanged

The scope here is only fixing depth visibility on the existing segment image.

## Testing

Add browser coverage around the real rendered actor path:

- a newly spawned shallow segment uses lower sprite opacity than a deeper segment
- opacity is clamped at the configured minimum and maximum
- opacity updates after gameplay changes reduce `currentDepth`

The tests should assert against the segment's active graphic state, not the actor `color`, so they cover the behavior the player actually sees.

## Out of scope

- changing the wave sprite asset
- adding custom canvas drawing or tint pipelines
- introducing nonlinear alpha curves
- changing gameplay depth rules
- changing static water or other water actors unless they already share this same broken pattern

## Verification

Before completion, run focused tests for `WaveSegment`, then the normal repo verification relevant to the change.
