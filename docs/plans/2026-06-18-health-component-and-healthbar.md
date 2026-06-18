# HealthComponent refactor + damage healthbar

Status: design approved (brainstorming). Next: `/writing-plans`.

## Summary

Two-phase change:

1. **Phase 1 (refactor, no UI):** Introduce an Excalibur `HealthComponent` as the single
   source of truth for structure durability. Migrate `Wall` and `Tower` onto it in place.
   Fix the unintended tower behavior: towers should act like walls (fixed height + HP,
   destroyed when HP hits 0) rather than gradually shrinking in height.
2. **Phase 2 (UI):** Add a `HealthBarSystem` (`SystemType.Draw`) that draws a thin,
   color-graded damage bar above any entity whose `HealthComponent` is below a threshold.

Phase 1 must be sound and fully green on its own before Phase 2 begins.

## Goals

- One reusable durability contract (`HealthComponent`) so "anything with HP" is handled
  uniformly, not per terrain type.
- Towers behave like walls (no height degradation).
- At-a-glance visual signal when a wall/tower is close to destruction.

## Non-goals

- No repair/heal mechanic. The bar is read-only feedback.
- Holes keep their existing depth/`hitCount` erosion mechanic; they are not "HP" structures
  and do not get a `HealthComponent`.
- No per-mass bar aggregation: bars are per-tile (each `Wall`/`Tower` tile has independent HP).

## Current model (audited)

| Terrain | State | `applyHits(n)` | Persistence |
|---|---|---|---|
| Wall | `hp`, max `WALL_LEVEL_HP[level-1]` | `hp -= n`; at ≤0 `level=0` → destroyed; returns null until death | HP persists (`resetHits` no-op) |
| Tower | `towerHeight` + `hitCount` | accumulate `hitCount`; every `TOWER_HITS_PER_EROSION`(10) drop height by 1 (gradual shrink — unintended) | `hitCount` reset on level advance |
| Hole | `depth` + `hitCount` | every 3 hits drop `depth` by 1 | `hitCount` reset on level advance |

`applyHits` is called generically from `GridModel.applyErosionHits` (grid-model.ts:301) and
`GridModel.applyErosion` (grid-model.ts:385). `resetHitCounts` (grid-model.ts:282) is called
on level advance (level-session.ts:378). `incrementHitCount` is dead (no callers).
`getHitCount` has only test callers.

## Phase 1 — HealthComponent refactor

### HealthComponent (`src/model/terrain/health-component.ts`)
- Excalibur `Component`.
- `current: number` (mutable), `max: number` (readonly, set at construction).
- `get fraction()` → `clamp(current / max, 0, 1)`.
- `get isDamaged()` → `fraction < HEALTH_BAR_THRESHOLD` (Phase 2 reads this; constant lives in config).

### Wall (`src/model/terrain/wall.ts`)
- Constructor `addComponent(new HealthComponent(WALL_LEVEL_HP[level-1], WALL_LEVEL_HP[level-1]))`.
- `get hp()` delegates to `component.current` (preserves public read API).
- `applyHits(n)`: `component.current -= n`; if `≤ 0` set `level = 0`, return `{ newElevation: 0 }`; else null.
- `serialize`/`describe` read `component.current`.
- Public API and existing `wall.test.ts` assertions remain valid.

### Tower (`src/model/terrain/tower.ts`) — behavior fix
- Fixed height: store `fixedHeight = min(height, MAX_ELEVATION)`.
- `addComponent(new HealthComponent(TOWER_HP, TOWER_HP))` where `TOWER_HP = 150`
  (= old 15 × 10, preserving total hits-to-destroy).
- `get elevation()` → `component.current > 0 ? fixedHeight : 0`.
- `applyHits(n)`: `component.current -= n`; return `{ newElevation: 0 }` only when `≤ 0`, else null.
- Remove `towerHeight` and `hitCount` fields; `resetHits` becomes a no-op (HP persists like walls).
- `serialize`: `{ type: 'tower', height: elevation, hp: component.current }` (adds hp for debug parity with walls).
- `describe`: show Height and HP.
- Rewrite `tower.test.ts` around HP-based destruction (drop all height-stepping / `hitCount` assertions).

### config.ts
- Add `TOWER_HP = 150`.
- Add `HEALTH_BAR_THRESHOLD` (default `0.5`) and bar layout/color constants (Phase 2 consumes them).
- Remove `TOWER_HITS_PER_EROSION` (no remaining users after the tower rewrite).

### grid-model.ts
- `getHitCount` / `resetHitCounts` become Hole-only (Tower no longer has `hitCount`).
- Remove dead `incrementHitCount`.
- `applyErosionHits` / `applyErosion` unchanged (generic `applyHits`).

### Docs
- `AGENTS.md`: gameplay overview line "Towers erode after 10 hits instead of 3" → towers have
  fixed height and `TOWER_HP` durability, destroyed when depleted. Update core-files list.
- `docs/gameplay.md`: update tower mechanic description.
- Debug serialization section: tower now includes `hp`.

### Tests (Phase 1)
- New unit: `HealthComponent.fraction` / `isDamaged` math.
- `tower.test.ts`: HP-based destruction; fixed elevation while alive; elevation→0 at HP 0; serialize includes hp.
- `wall.test.ts`: confirm `hp` getter still satisfies existing assertions.
- `grid-model-erosion.browser.test.ts`, `grid-model.browser.test.ts`: adjust any tower/hitCount expectations.
- `node --run static-check` green.

## Phase 2 — HealthBarSystem (UI)

### HealthBarSystem (`src/view/health-bar-system.ts`)
- `extends System`, `systemType = SystemType.Draw`.
- `query = world.query([HealthComponent, TransformComponent])`.
- `update()`: get the engine graphics context; for each entity with `fraction < HEALTH_BAR_THRESHOLD`
  (and `> 0`), draw at the tile's world position: 1px dark border + fill of width `fraction × barWidth`,
  fill color lerped green→amber→red by `fraction`, pinned to the tile top edge, high `ctx.z`.
- Registered in each session's `onInitialize` after `GridModel` creation:
  `this.world.add(new HealthBarSystem(this.world))` in `level-session.ts` and `tide-session.ts`.
- Flat/hole/castle have no `HealthComponent` → no bar, automatically.

### Tests (Phase 2)
- Browser: damaged wall/tower below threshold renders a bar; undamaged renders none
  (graphics/screenshot assertion per `docs/testing.md`).
- `node --run static-check` green.

## Files affected

- New: `src/model/terrain/health-component.ts`, `src/view/health-bar-system.ts`
- Edit: `wall.ts`, `tower.ts`, `config.ts`, `grid-model.ts`, `level-session.ts`, `tide-session.ts`,
  `AGENTS.md`, `docs/gameplay.md`, plus the test files listed above.
