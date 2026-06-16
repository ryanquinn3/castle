# Hole basin pooling & siltation — design

**Status:** Design agreed, not yet implemented.
**Supersedes the fix direction in:** `docs/bugs/2026-06-15-water-filled-holes-stopped-eroding.md`.

## Why

Two problems, one root cause:

1. **Holes stopped eroding** (the filed bug). `WaveFieldRuntime` never feeds erosion hits
   to holes, so a water-filled hole's depth never changes.
2. **Water does not channel toward deep holes.** Given holes stacked N→S with depths
   (−1, −5, −10), water that brushes the −1 hole fills it but never travels on to the
   −10 hole. Players cannot dig deep holes to divert water away from vulnerable cells.

Both come from the same place: `applyTerrainFeedback` **siphons water out of the live
field the instant it rests on a hole** (`wave-terrain-feedback.ts:44-55`). The water is
committed to `puddleDepth` and dropped from the cell set that same frame, so it never
pools, never overflows a rim, and never flows to the deeper hole. The comment at
`wave-terrain-feedback.ts:30` admits this is a wave-*termination* hack ("that water leaves
the live field ... lets the wave terminate").

The flux kernel itself is fine: `head = groundAt + depth` (`wave-dynamic-system.ts:93`)
with a hole's floor read at its true available depth (`-effectiveHoleDepth`,
`wave-field-runtime.ts:98`) already does connected-vessel physics. If water were allowed
to *stay*, it would pool and channel on its own.

## The unified model

Holes become **static basins** with a lifecycle. One model produces both channeling and
erosion; "erosion" is reframed as **siltation** (the basin filling in).

```
SURGE    source open (row-0 pinned), water floods in
  v      (source closes after surgeWindowMs)
RECEDE   above-ground water drains north to the ocean sink AND seeps off;
  v      sub-ground water pools live in basins and channels to the deepest hole
SETTLE   source closed AND no seepable water remains AND net flux < epsilon
  v      (for a few consecutive steps; maxSteps guard force-settles)
COMMIT   fold each hole's pooled water into puddleDepth + silt one step; end wave
```

### 1. Water pools live (channeling)

Remove the absorption-and-remove logic from `applyTerrainFeedback`; it keeps **only**
castle-flood detection. Water then pools as ordinary live `depth` in holes. During a wave
`puddleDepth` is frozen, so a basin floor (`effectiveHoleDepth`) is stable and live water
stacks on top — the kernel equalizes surfaces across connected holes and the (−1, −5, −10)
stack drains into the −10 hole.

No change to the flux kernel, `groundAt`, or `effectiveHoleDepth`. `puddleDepth` reverts to
meaning *persistent standing water from prior waves*, written only at commit.

### 2. Rim-aware seep (termination of receding water)

Seep is the existing per-frame recede drain (`wave-dynamic-system.ts:287`). Make it
rim-aware so it drains water off flat ground but leaves trapped basin water alone.

- `WaterComponent` gains a `floor` field, set to `groundAt(col,row)` at spawn/reconcile.
- "Ground level" is the beach plane with no hole carved out: `terrainSlope * row` (this is
  `groundAt` minus the hole offset; for flat ground it already equals `floor`). No new
  concept, no neighbor lookups.

```
groundLevel = terrainSlope * row
seepable    = max(0, floor + depth - groundLevel)   // water standing above the beach plane
depth      -= min(seep, seepable)
```

- Flat ground: `floor === groundLevel` → `seepable === depth` → seeps fully (today's
  behavior; the wave recedes and terminates as before).
- Hole: `floor < groundLevel` → only the column above the beach plane seeps; the sub-ground
  pool is retained for commit.

Known edge case accepted: a hole walled in on all sides could physically hold water above
the beach plane, but that band will seep off here. The flux kernel won't push water through
walls anyway, and it is a rare board — not worth neighbor-min rim derivation.

### 3. Termination + commit

Trapped (sub-ground) water no longer seeps, so the old `!sourceOpen && cells.length === 0`
condition never fires when a basin holds water. New termination:

> source closed **and** no seepable water remains anywhere **and** net flux has settled
> (`sum(|delta|) < epsilon` for a few consecutive steps), with a `maxSteps` guard that
> force-settles a pathological board.

On termination, run the **commit** pass once. Per hole holding pooled water `W`:

```
puddle = min(depth, puddle + W)     // fold pooled water into standing water
if puddle >= 1:                     // any standing water -> silt one step
    depth  -= 1
    puddle -= 1                     // partial restore: both drop by 1
if depth == 0: become FlatGround    // Hole.applyHits already performs this swap
```

Residual wall-trapped flat-ground water (no hole beneath it) is discarded ("drains off").

Worked examples:

| Hole (depth, puddle) | Pooled `W` | After commit |
|----------------------|-----------|--------------|
| −5, dry              | 1         | −4, dry |
| −10, dry             | 4         | −9, holding 3 standing |
| −5, dry              | 0         | −5, dry (no water, no silt) |
| −5, holding 3 (carried), no inflow | 0 | −4, holding 2 |

Behavior: a hole that takes on any water silts ~1 step per wave until flat — strong but
always-decaying, never a permanent perfect drain. A single soaking commits a hole to
silting away over ~`depth` waves even if later waves miss it (intended). This is the tuning
answer to "a deep empty hole is too strong."

### Unchanged

- **Wall/tower erosion** — the flux-projection `computeErosionHits` path stays exactly as
  is (`wave-field-runtime.ts:130`). Holes were never meant to go through it (wrong
  semantics: a hole presents no face).
- **Castle flood** — stays a per-frame check (must fire the instant water reaches the
  castle, not at settle).

## Implementation touchpoints

- `src/wave/wave-terrain-feedback.ts` — drop absorption; keep castle-flood detection only.
- `src/wave/water-component.ts` — add `floor`.
- `src/wave/wave-dynamic-system.ts` — set `floor` in reconcile/spawn; rim-aware seep in
  `postupdate`; new settle/termination condition; invoke commit on termination.
- `src/wave/wave-field-runtime.ts` — wire the commit pass through `WaveEventApplier`
  (reuse the `absorbed` event for puddle fold; add/extend an event for the silt step, or
  route the silt through `applyErosionHits` which already does the depth-0→FlatGround swap).
- `src/model/terrain/hole.ts` — `applyHits`/`applyDelta` already clamp puddle to depth and
  swap to `FlatGround` at 0; reuse rather than add new mutation paths.
- Dead code: `GridModel.applyWaveWaterHit` (`grid-model.ts:282`) is now reachable only from
  tests; remove with its tests once commit replaces it.

## Testing (reproduce-first, pure-helper-first)

- **Channeling (headline bug)** — `computeFluxStep` (pure): seed water into the shallow end
  of a (−1, −5, −10) vertical stack, run to rest, assert water collects in the −10 cell and
  the −1 cell ends dry. Fails on `main`, passes after.
- **Rim-aware seep** — extract a pure `applySeep({cells, groundLevelAt, seep})` from the
  inline `postupdate` mutation; test: flat ground seeps to zero; a hole retains its
  sub-ground column; an overfilled hole seeps only the above-ground band.
- **Commit silting** — pure `commitHoleSilt({depth, puddle, pooled})`; assert the table
  above incl. depth-0 → FlatGround.
- **Termination** — runtime/browser test: a board with a trapped pool settles and ends
  (no hang), `maxSteps` guard covered.
- **Regression** — a flat-only board still recedes and terminates unchanged; castle flood
  still fires mid-wave.

Each implementation task runs `node --run static-check` (lint + typecheck + unit + browser)
and must pass before the task is considered done.

## Open tuning knobs (defaults, adjust in playtest)

- `epsilon` and consecutive-stable-step count for the settle detector.
- `maxSteps` safety cap.
- Silt is fixed at 1 step/wave with partial restore (depth −1, puddle −1); revisit if deep
  holes feel too durable or too fragile in play.

## Gameplay doc

`docs/gameplay.md` describes hole erosion as "1 elevation step every 3 water hits." That
mechanic is replaced by this siltation model and must be rewritten in the same change.
