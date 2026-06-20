# Hole near top of grid never silts to flat ground

## Problem

A hole placed near the top of the grid took many waves but never silted back to
flat ground. Debug JSON shows the cell frozen at:

```json
{ "type": "hole", "height": -19, "puddleDepth": 18.504848035365026 }
```

So `depth = 19`, `puddleDepth = 18.5`, `effectiveDepth = depth - puddle = 0.5`.
The hole is essentially full of pooled water yet stays a 19-deep pit forever.

## Reproduction

1. Dig a deep hole one or two rows from the top of the grid.
2. Run several waves over it.
3. The hole accumulates a large `puddleDepth` after the first wave or two, then
   stops changing: `depth` stays high, `puddleDepth` stays just below it, and it
   never converts to `FlatGround`.

## Root cause

Silting is gated on **transient resting water**, not on the hole's **persisted
pooled water**, and the two interact to deadlock.

Data flow at wave end (`src/wave/wave-field-runtime.ts:111`): `onComplete` is
handed `restingCells` (the cells that still hold a live water actor on the frame
the wave terminates). For each of those it emits a `holeCommit`, which routes to
`GridModel.commitHoleWave` → `Hole.commitWave(pooled)`:

```ts
// src/model/terrain/hole.ts:69
commitWave(pooledWater: number): ErosionResult | null {
  this.puddleDepth = Math.min(this.depth, this.puddleDepth + pooledWater);
  if (this.puddleDepth < 1) return null;
  this.depth -= 1;
  this.puddleDepth -= 1;
  return { newElevation: this.elevation };
}
```

`puddleDepth` is written **only** here. The mid-wave absorb path
(`'absorbed'` → `applyPuddleDelta` → `addPuddle`) exists in `WaveEventApplier`
but nothing in `WaveFieldRuntime` emits `'absorbed'`, so it is dead in the live
runtime. (`resolveTerrain` emits only `eroded`; `onComplete` emits only
`holeCommit`.)

The deadlock:

1. An empty deep hole reads as a deep pit, so the pressure field routes water
   into it. It fills, and the first `commitWave` runs with large `pooled`, taking
   `depth 20 → 19` and `puddleDepth → 18.5`. Now `effectiveDepth ≈ 0.5`.
2. `WaveFieldRuntime.groundAt` (line 94-99) reports a hole's ground using
   `-effectiveHoleDepth`, with the explicit rule "a full hole reads as flat
   ground." With `effectiveDepth ≈ 0.5`, the cell now reads as essentially flat.
3. Flat-reading cells no longer attract or retain pooled water, so the hole holds
   **no live resting water** at wave end and is absent from `restingCells`.
4. `commitHoleWave` is therefore never called again. `puddleDepth = 18.5` is
   stranded, `depth` is frozen at 19, and the hole never silts to flat.

This contradicts the documented design (`docs/gameplay.md:164`): "each hole that
holds pooled water silts one step (depth -1, puddle -1) ... Deep holes are strong
channels but always decay, never a permanent perfect drain." The hole *holds*
18.5 units of pooled water but never silts, and is in fact a permanent perfect
drain. Proximity to the top (ocean sink) aggravates it: any water that does enter
recedes straight back to the ocean, so the cell ends each wave dry even before it
reads as full.

## Solution

Drive silting off the hole's persisted `puddleDepth`, not off whether it has a
live water actor at the wave-end frame. Split `commitWave` into two concerns and
run them for every hole at wave end:

- **Absorb** (`restingCells` only): `puddleDepth = min(depth, puddleDepth + pooled)`.
- **Silt one step** (every hole): if `puddleDepth >= 1`, `depth -= 1`,
  `puddleDepth -= 1`; convert to `FlatGround` at `elevation === 0`.

This matches the design's "each hole that holds pooled water silts one step" and
lets a stranded-but-full hole decay one step per wave from its stored puddle
until it runs out (`puddleDepth < 1`).

## Files to change

- `src/model/terrain/hole.ts` - split `commitWave` into `absorbPool(pooled)` and
  `siltStep()`.
- `src/model/grid-model.ts` - replace/augment `commitHoleWave` with an absorb
  call for resting cells plus a `siltAllHoles()` decay pass that converts holes
  reaching elevation 0 to `FlatGround`.
- `src/wave/wave-field-runtime.ts` - in `onComplete`, absorb `restingCells` then
  run the all-holes silt pass (instead of only committing resting cells).

## Verification

- Unit test (browser Vitest project, since terrain imports Excalibur): a hole
  with high `puddleDepth` and no resting water silts one step per wave end and
  eventually converts to `FlatGround`.
- `node --run static-check` (lint + typecheck + tests).
- Manual: reproduce per above; confirm the top hole now decays to flat.

## Residual / note

`commitWave`'s documented step decrements `depth` and `puddleDepth` together, so a
hole only silts as much total water as it ever pooled. A hole that fills once
(reading flat thereafter) silts down by roughly its stored puddle and may leave a
shallow `depth ≈ 1`, `puddle < 1` remnant rather than perfectly flat. That is
consistent with the documented conservation model; fully closing the remnant
would require changing the silting model itself, which is a design decision worth
raising separately.
