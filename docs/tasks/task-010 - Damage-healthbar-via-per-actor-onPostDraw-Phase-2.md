---
id: TASK-010
title: Damage healthbar via per-actor onPostDraw (Phase 2)
status: Done
assignee: []
created_date: '2026-06-18 14:02'
updated_date: '2026-06-18 14:39'
labels:
  - feature
dependencies:
  - TASK-009
references:
  - src/model/terrain/terrain.ts
  - src/model/terrain/health-component.ts
  - src/view/health-bar.ts
  - src/config.ts
documentation:
  - docs/plans/2026-06-18-health-component-and-healthbar.md
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Show a small damage healthbar above walls/towers whose HP is below a threshold, visible in both planning and wave phases. Builds on the Phase 1 HealthComponent (TASK-009). Approach A (decided): render via the terrain actor's graphics.onPostDraw, NOT a standalone Draw system. Excalibur's GraphicsSystem invokes onPostDraw after applying camera + actor transform (draw in tile-local coords, origin = tile center), and frame compositing is z-batched so layering is set by ctx.z (water overlay is z:7, so the bar uses ctx.z=8). onPostDraw persists across syncGraphic graphics.use() swaps. Bar: ~2px tall, ~2px inset, fill width = (TILE_SIZE - 2*inset)*fraction, 1px dark border, discrete color zones green>0.75 / amber 0.5-0.75 / red<=0.5. Threshold 0.5 (only red is visible in-game until raised; zone fn implemented in full as a tuning knob). Flat/hole/castle have no HealthComponent so never draw a bar; destroyed tiles are removed from the scene synchronously so no bar lingers. Design reference: docs/plans/2026-06-18-health-component-and-healthbar.md (Phase 2 section). Verification: node --run static-check.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
- [ ] #2 node --run static-check passes
- [ ] #3 Every leaf subtask ends independently green and is committed atomically
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Walls and towers below HEALTH_BAR_THRESHOLD show a small inset healthbar above the tile in both planning and wave phases; at/above threshold show none
- [ ] #2 Bar is rendered via the terrain actor's graphics.onPostDraw (no standalone Draw system); set once when the actor has a HealthComponent and self-gating (absent component / current<=0 / fraction>=threshold => no draw)
- [ ] #3 Bar composites above water and sand via ctx.z=8 (water overlay is z:7); fill width = (TILE_SIZE-2*inset)*fraction; discrete color zones green>0.75, amber 0.5-0.75, red<=0.5
- [ ] #4 Flat ground, holes, and castle never render a bar; a destroyed wall/tower (removed and swapped to FlatGround) leaves no lingering bar
- [ ] #5 HealthComponent.isDamaged getter added (fraction < HEALTH_BAR_THRESHOLD)
- [ ] #6 docs/gameplay.md documents the damage healthbar
- [ ] #7 node --run static-check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Depends on TASK-009 (HealthComponent on Wall and Tower). Approach A: per-actor graphics.onPostDraw + a pure draw helper; no Draw system, no session/world registration.

Execution order: 010.01 (pure helper + config + isDamaged, unit-tested) then 010.02 (wire onPostDraw in Terrain base + browser tests + docs). 010.02 depends on 010.01.

010.01 - drawHealthBar helper + config + isDamaged (TDD):
- New src/view/health-bar.ts exporting drawHealthBar(ctx, fraction, tileSize): draws relative to tile center (origin) - border + bg + fill rect, top edge y=-tileSize/2+HEALTH_BAR_INSET, x from -(tileSize/2)+inset, height HEALTH_BAR_HEIGHT, fill width=(tileSize-2*inset)*clamp(fraction,0,1); sets ctx.z=HEALTH_BAR_Z; fill color by discrete zone (green>0.75, amber>0.5, red otherwise).
- config.ts: HEALTH_BAR_THRESHOLD=0.5, HEALTH_BAR_Z=8, HEALTH_BAR_HEIGHT(~2), HEALTH_BAR_INSET(~2), and the three zone colors.
- health-component.ts: add get isDamaged() => fraction < HEALTH_BAR_THRESHOLD.
- Unit tests: color zone selection across all three zones, width = fraction (0/0.5/1), clamping; isDamaged threshold math.

010.02 - Wire onPostDraw in Terrain + browser tests + docs:
- Terrain base (src/model/terrain/terrain.ts): set this.graphics.onPostDraw once (e.g. in onInitialize or attach) to a closure that reads this.get(HealthComponent); early-return if absent, current<=0, or fraction>=HEALTH_BAR_THRESHOLD; else drawHealthBar(ctx, fraction, TILE_SIZE). Verify it is set after graphics are available and survives syncGraphic graphics.use() swaps (onPostDraw is a GraphicsComponent property, independent of current graphic).
- docs/gameplay.md: document the damage healthbar (when it appears, thresholds, colors).
- Browser tests (per docs/testing.md): damaged wall/tower below threshold renders a bar; undamaged renders none; a destroyed (now flat) tile renders none.

Key files: src/view/health-bar.ts (new), src/config.ts, src/model/terrain/health-component.ts, src/model/terrain/terrain.ts, docs/gameplay.md, plus co-located test files.

Risks: (1) onPostDraw timing - must be set once graphics exist and persist across graphics.use(); confirm via a browser test rather than assuming. (2) ctx.z respected inside onPostDraw for z-batched compositing - verify the bar lands above the z:7 water overlay in a browser test. (3) drawing primitive API - confirm ExcaliburGraphicsContext drawRectangle signature (pos/width/height/color/stroke) against installed types before relying on it.

Branch: feat/healthcomponent-refactor (continues from Phase 1) or a fresh feat/healthbar branch if Phase 1 is already merged. Verification each leaf: node --run static-check green.
<!-- SECTION:PLAN:END -->
