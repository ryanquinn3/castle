# Wall Levels Redesign

**Date:** 2026-06-08
**Status:** Design (approved, pre-implementation)

## Summary

Replace the continuous height-delta wall model with **four discrete, stacked wall
levels**, each a dedicated tool. Walls gain a durability (HP) pool instead of the
gradual per-3-hit elevation erosion. When a wall's HP reaches zero the entire wall
vanishes to flat ground with no sand refund. HP is permanent: it never auto-heals
between waves or levels.

This affects the planning UX (toolbar grows to six tools), the terrain model
(`Wall`), the grid placement API, the wave erosion path, the gameplay doc, and the
replay/debug tooling.

## Design decisions

These were settled during brainstorming and are fixed inputs to implementation:

| Decision | Choice |
| --- | --- |
| Level → elevation | L1=5, L2=10, L3=15, L4=20 (matches today's 4 texture tiers) |
| Level → sand cost | L1=1, L2=5, L3=10, L4=20 |
| Stacking rule | Level N placeable only on a wall at exactly level N-1 (L1 on flat) |
| Damage model | All-or-nothing: full elevation held until HP=0, then entire wall → flat |
| HP per level (increment) | 3 × that level's elevation → 15 / 30 / 45 / 60 |
| HP per level (cumulative, the wall's max) | L1=15, L2=45, L3=90, L4=150 |
| Sand refund on destruction | None — investment is forfeited |
| HP persistence | Permanent; never resets between waves or levels |
| Shovel on a wall | Not allowed — shovel is ground/holes only |
| Wall removal by player | Only via upgrade (replaces with fresh higher-level wall); no teardown |
| Toolbar | Four explicit wall buttons: `[Shovel][W1][W2][W3][W4][Tower]` |

### Rationale notes

- **Tuning vs. today.** The current wall takes ~3 hits per elevation to grind down
  (elev 5 ≈ 15 hits ... elev 20 ≈ 60 hits), and a hit only lands when overtopped by
  ≥2. The per-level HP increment (3 × elevation) preserves that "feel" per tier. The
  **cumulative** total (L4 = 150) is a deliberate choice to make fully-invested walls
  meaningfully tankier than today's elev-20 wall (60 hits).
- **Tall-wall near-invulnerability is preserved.** The damage gate stays
  `depth - elevation >= 2`, so an L4 wall (elev 20) is effectively never damaged
  unless a wave exceeds height 22 — the same property the current elev-20 wall has.

## Model layer (`src/model/terrain/wall.ts`)

`Wall` stops being height-delta-driven and becomes level + HP driven.

```
class Wall {
  level: 1 | 2 | 3 | 4      // replaces free-form height
  hp: number                // current durability, starts at this level's max
  get elevation() { return WALL_LEVEL_ELEVATION[level - 1] }   // 5/10/15/20
}
```

Behavior:

- **`applyHits(n)`** — `hp -= n`. If `hp <= 0`, set the internal level to 0 (so
  `elevation` reads 0) and return `{ newElevation: 0 }`; `GridModel`'s existing
  `elevation === 0 → FlatGround` path then removes it in one shot. If still alive,
  return `null` (no elevation change, nothing to re-render). No gradual step-down.
- **`applyDelta(amount)`** — no-op returning `this` (matches `Tower`). Walls no longer
  shrink from sand-redistribution and are no longer created via
  `FlatGround.applyDelta(+1)`.
- **`resetHits()`** — no-op. HP must persist across waves and levels.
- **`serialize()`** — `{ type: 'wall', height: elevation, level, hp }`. `height` is
  retained for wave-sim/replay compatibility; `level`/`hp` are added.

New constants (`src/config.ts`):

```
WALL_LEVEL_ELEVATION = [5, 10, 15, 20]   // index = level - 1
WALL_LEVEL_COST      = [1, 5, 10, 20]
WALL_LEVEL_HP        = [15, 45, 90, 150]  // cumulative max HP per level
```

Rendering: the existing `WallSwatch1–4` textures map directly to the four levels via
the level index (today's `tierIndex` is derived from height bands; it becomes
`level - 1`).

## Placement & upgrade (`src/model/grid-model.ts`)

Replace delta-based wall creation with an explicit method:

```
placeWall(col, row, level): boolean
```

Validity (returns `false` otherwise):

- in bounds and not a castle cell
- `level === 1` → cell must be `FlatGround`
- `level >= 2` → cell must be a `Wall` at exactly `level - 1`

On success it constructs a fresh `Wall(level)` at full HP and routes through `setCell`
(preserving neighbor attachment and `detectPools`). A level-2 placement replaces the
level-1 wall object with a new level-2 wall — the tile's identity is its current
level, so there is no separate "upgrade" object, and upgrading naturally restores HP
to the new level's full max.

## Tool layer

**`src/tool-type.ts`** — replace the single `Wall` with four levels:

```
enum ToolType { Shovel, Wall1, Wall2, Wall3, Wall4, Tower }
```

**`validActionsFor({ cell, sand })`** (`src/view/terrain-editor.ts`) rewrites to:

- `Tower` cell → no actions
- `FlatGround` / `Hole` → `Shovel`; plus `Wall1` if `sand >= 1`; plus `Tower` if
  `FlatGround` and `sand >= TOWER_COST`
- `Wall` at level L (1–3) → only `Wall{L+1}`, and only if `sand >= WALL_LEVEL_COST[L]`
- `Wall` at level 4 → no actions (maxed)
- Shovel is never offered on a wall

Because this returns at most one wall level per cell, the toolbar lights up exactly
the next valid wall button and greys the rest.

**`applyAction(tool)`** (`src/view/terrain-editor.ts`) collapses to:

- `Shovel` → existing dig path (`setElevation(-1)`, `+1` sand); ground/holes only
- any `Wall{N}` → `removeSand(WALL_LEVEL_COST[N])`, then `grid.placeWall(col,row,N)`;
  refund the sand if placement fails; play `WallToolSound`
- `Tower` → unchanged

## Toolbar UI

- **`src/ui/ToolbarComponent.tsx`** — bump `TOTAL_SLOTS` from 5 to 6.
- **`src/view/toolbar.ts`** `TOOL_DEFS` becomes six entries with per-level cost badges:

  | Tool | Hotkey | Sprite | Sand effect |
  | --- | --- | --- | --- |
  | Shovel | 1 | shovel-sprite | earn 1 |
  | Wall1 | 2 | wall-tool-sprite | spend 1 |
  | Wall2 | 3 | wall-tool-sprite | spend 5 |
  | Wall3 | 4 | wall-tool-sprite | spend 10 |
  | Wall4 | 5 | wall-tool-sprite | spend 20 |
  | Tower | 6 | tower-sprite | spend TOWER_COST (15) |

- Affordability/validity reuse the existing machinery: `getDisabledTools()` already
  disables a `spend` tool when its `amount > sandCount`, and `setEnabledTools()`
  filters by `validActionsFor`.
- All four wall buttons share `wall-tool-sprite.png` initially; the cost badge
  distinguishes them. Distinct per-level button art is a deliberate follow-up (YAGNI).
- Tower's hotkey shifts 3 → 6. Accepted.
- Verify `toolbar.css` accommodates six slots against the grid width; allow
  shrink/wrap rather than relying on a fixed count.

## Wave runtime & erosion integration

The all-or-nothing rule lives entirely in `Wall.applyHits`, so the runtime needs
minimal change:

- **`GridModel.applyWaveWaterHit(col,row,depth)`** — unchanged logic. The
  `depth - elevation < 2` gate stays; on a qualifying hit it calls `cell.applyHits(1)`.
  A wall returns `{newElevation:0}` only on the fatal hit, and the existing
  `elevation === 0 → FlatGround` line removes it. No refund logic on this path.
- **`GridModel.applyErosion(advanceMap, recedeMap)`** — unchanged. It already calls
  `applyHits(hits)` and replaces at `elevation === 0`; a wall simply doesn't appear in
  results until it pops.
- **Sand redistribution** (`blocked`/`overtopped` → `applySandRedistributionAt` →
  `setElevation(-1)`): because `Wall.applyDelta` is now a no-op, walls no longer lose
  elevation here, and the hole-fill-above side effect stops firing for walls. Only
  walls/towers ever trigger these events and both now ignore the delta, so wall
  sand-redistribution effectively disappears with no behavior regression. The generic
  `setElevation` method is left intact (it remains meaningful for holes).
- **`resetHitCounts()` cadence** (`src/level-session.ts:advanceLevel`): unchanged call
  site, but `Wall.resetHits()` is now a no-op, so wall HP persists across the level
  boundary. Towers and holes keep their existing partial-progress reset.

## Docs, tests, tooling

- **`docs/gameplay.md`** — rewrite the Wall tool line, the erosion section, and the
  block/overtop table to describe four stacked levels (costs 1/5/10/20, cumulative HP
  15/45/90/150), all-or-nothing destruction with no refund, no auto-heal, and
  shovel-is-ground-only. Update toolbar/hotkey references.
- **`tools/replay-wave.ts` + debug serialization** (documented in `AGENTS.md`) —
  `deserializeTerrain` for `wall` reads `level`/`hp`, falling back to deriving level
  from `height` for older captures. Update the documented JSON example to show
  `{ "type": "wall", "level": 2, "hp": 45 }`.
- **Tests** (co-located Vitest):
  - `wall.test.ts` — elevation per level; `applyHits` HP decrement; destruction at
    HP≤0 returns `{newElevation:0}`; `applyDelta`/`resetHits` no-ops; serialize
    round-trip.
  - `grid-model.test.ts` — `placeWall` validity matrix (flat→L1, L1→L2, reject L2 on
    flat, reject on castle, level-4 maxed); HP persists across `resetHitCounts`.
  - `terrain-editor.test.ts` — `validActionsFor` returns the single correct next wall
    level by cell state and sand; shovel absent on walls.
  - Each implementation task ends by running `node --run static-check` (lint +
    typecheck + unit) and confirming it passes before the task is marked complete.

## Out of scope (YAGNI)

- Distinct per-level wall button art (cost badge suffices initially).
- Per-hit visual damage states (cracks). Walls render full until they pop.
- Wall repair as a distinct action (upgrading already restores HP).
