# Water-filled holes stopped eroding

**Status:** Resolved.
**Introduced by:** `d043000` (refactor: remove legacy wave system, migrate sessions to WaveFieldRuntime).

**Resolved by:** Hole basin pooling and siltation. See `docs/plans/2026-06-15-hole-basin-pooling-and-siltation.md` and `docs/plans/2026-06-15-hole-basin-pooling-and-siltation-design.md`.

## Symptom

Holes that fill with water no longer erode. Per `docs/gameplay.md:127`, a hole should
lose 1 elevation step every 3 water hits (elevation -2 → -1 → ... → 0 = flat ground).
That no longer happens; a water-filled hole's `depth` never changes.

## Root cause

`Hole.applyHits` (`src/model/terrain/hole.ts:38`) still implements the 3-hits-per-step
erosion correctly. The bug is upstream: **nothing feeds hits to holes anymore.**

There are two erosion entry points on `GridModel`:

| Path | Gate | Holes eligible? | Live now? |
|------|------|-----------------|-----------|
| `applyWaveWaterHit` (`grid-model.ts:282`) | `depth - elevation >= 2` (true for any water-filled hole, since hole elevation is negative) | yes | **dead** |
| `applyErosionHits` (`grid-model.ts:313`) | fed by `computeErosionHits`, gated on `isErodible` | no | yes |

- The **legacy** `WaveActorRuntime` emitted `tileEntered` events. `WaveEventApplier`'s
  fall-through (`wave-event-applier.ts:48-49`) routed those to `applyWaveWaterHit`,
  whose depth gate erodes holes.
- `WaveFieldRuntime` **never emits `tileEntered`**. Its only erosion feed is
  `resolveTerrain` (`wave-field-runtime.ts:130-143`) → `computeErosionHits`, gated by:

  ```ts
  isErodible: (col, row) => this.grid.getElevation(col, row) > 0 && !this.grid.isCastle(col, row)
  ```

  Holes have **negative** elevation, so they are filtered out before any hit is computed.

In the new runtime holes only ever receive *absorption* (`applyTerrainFeedback` →
`puddleDepth`), never *erosion* (`depth`). `applyWaveWaterHit` is now dead code reached
only from tests.

## Fix direction (agreed)

Add a dedicated **resting-depth charge** hole-erosion step inside
`WaveFieldRuntime.resolveTerrain`, mirroring the existing wall flux-erosion accumulator
(`erosionAcc`), and route emitted hits through the existing `applyErosionHits`
(type-dispatched, so `Hole.applyHits` and the elevation-0 → `FlatGround` swap already work).

Design notes:

- **Do not** reuse `computeErosionHits` / `isErodible` for holes. That models flux hitting
  an upright wall *face* (frontal/shear); a hole presents no face — water flows *into* it.
  Wrong semantics.
- A hole accrues charge each frame proportional to the water depth resting in it (legacy
  intent: any water-filled hole erodes), emitting a discrete hit at a tuned threshold.
- **Cadence is the key risk.** Legacy applied ~1 hit per *segment event*; `resolveTerrain`
  runs every *frame*. A raw "+1 per wet hole per frame" would erode holes far faster than
  before. Use a tuned per-frame charge accumulator + threshold, not a raw counter.

## Suggested test (TDD)

Reproduce first: a hole with water resting in it across enough wave frames should lose a
depth step (and eventually become `FlatGround`). Confirm it fails on `main`, then fix.
