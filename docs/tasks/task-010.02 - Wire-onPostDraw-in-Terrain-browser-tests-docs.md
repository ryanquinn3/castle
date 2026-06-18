---
id: TASK-010.02
title: Wire onPostDraw in Terrain + browser tests + docs
status: Done
assignee:
  - '@claude'
created_date: '2026-06-18 14:14'
updated_date: '2026-06-18 14:39'
labels: []
dependencies:
  - TASK-010.01
references:
  - src/model/terrain/terrain.ts
  - docs/gameplay.md
parent_task_id: TASK-010
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wire the healthbar onto terrain actors and verify rendering in the browser. In Terrain base, set this.graphics.onPostDraw once (once graphics are available, e.g. onInitialize) to a closure that reads this.get(HealthComponent) and early-returns when the component is absent, current<=0, or fraction>=HEALTH_BAR_THRESHOLD; otherwise calls drawHealthBar(ctx, fraction, TILE_SIZE). onPostDraw is a GraphicsComponent property independent of the current graphic, so it must survive Terrain.syncGraphic() graphics.use() swaps - confirm via a browser test. Update docs/gameplay.md to document the healthbar (appearance threshold, colors). Add browser tests (per docs/testing.md): damaged wall/tower below threshold renders a bar; undamaged renders none; a destroyed (now flat) tile renders none. Depends on 010.01.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Terrain base sets graphics.onPostDraw once after graphics are available; the closure reads HealthComponent and early-returns when absent, current<=0, or fraction>=HEALTH_BAR_THRESHOLD, else calls drawHealthBar(ctx, fraction, TILE_SIZE)
- [x] #2 A browser test confirms the bar still renders after a syncGraphic() graphics.use() swap (onPostDraw persists)
- [x] #3 Browser tests confirm an undamaged wall/tower renders no bar and a destroyed (now FlatGround) tile renders no bar
- [x] #4 docs/gameplay.md documents the damage healthbar (threshold, colors, both phases)
- [x] #5 node --run static-check passes
- [x] #6 Change committed atomically
- [x] #7 A *.browser.test.ts drives HealthComponent.current directly (no wave sim) to set the fraction and calls page.screenshot() with NO path argument so PNGs land in the default test-results/screenshots/ dir, for inspectable cases: full HP (no bar), damaged below threshold (red bar), and destroyed->FlatGround (no bar)
- [x] #8 A browser test confirms a damaged wall and a damaged tower (each below threshold) render a bar; above-water layering is guaranteed structurally by HEALTH_BAR_Z=8 > the z:7 water overlay (set in the drawHealthBar helper, covered by 010.01) - a wave-integrated pixel check is optional, not required
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Verified browser-test recipe (do not re-investigate; grounded in src/test/excalibur-browser-shared-test.ts, src/test/excalibur-browser-test-utils.ts, terrain-render.browser.test.ts, excalibur 0.32 types, and docs/testing.md):

Fixture / engine instance:
- import { expect, test } from '../../test/excalibur-browser-shared-test.ts' (path relative to src/model/terrain/). The shared 'test' fixture already constructs a real Excalibur Engine + Scene + deterministic test clock; destructure the fixtures you need: ({ scene, clock }) (game is also available). Importing this fixture IS 'create an engine instance' - do not roll your own. For custom EngineOptions use createSharedEngine({...}) from excalibur-browser-test-utils.ts.

Add and render terrain:
- Stub NeighborGrid: const STUB_GRID = { neighborsOf: () => ({ north: null, south: null, east: null, west: null }) }.
- const wall = new Wall(4); wall.attach(STUB_GRID, 5, 5); scene.add(wall); wall.syncGraphic();
- Assets are NOT required: with Resources unloaded, Wall.syncGraphic falls back to a solid color via getWallSwatch(); the onPostDraw bar still draws. (terrain-render.browser.test.ts adds a Wall with no loader.)

Drive component status:
- wall.get(HealthComponent).current = 30  // 30/150 = 0.2 fraction -> below 0.5 -> red bar. Set = max for the full-HP (no-bar) case.

Render one frame, then screenshot:
- import { page } from 'vitest/browser'.
- clock.step(16)  // TestClock.step(overrideUpdateMs?) advances exactly one deterministic frame so onPostDraw runs.
- await page.screenshot()  // NO path arg -> default test-results/screenshots/, filename derived from test name.
- Inspectability: scene.camera.zoom = 10; scene.camera.pos = wall.pos  // magnify the 16px tile; camera zoom is applied by GraphicsSystem before onPostDraw so the bar scales too.

Cases to cover (each its own test + screenshot):
1. Damaged below threshold: current=30 -> assert wall.get(HealthComponent).isDamaged === true; screenshot shows red bar.
2. Full HP: current=max -> assert isDamaged === false; screenshot shows no bar.
3. Destroyed -> FlatGround leaves no bar: build via GridModel (new GridModel({width,height,castleCol,castleRow,castleWidth,castleHeight}, scene)) then grid.placeWall(c,r,1) and grid.applyErosionHits(c,r, WALL_LEVEL_HP[0]) to destroy; assert grid.getCell(c,r) instanceof FlatGround; screenshot shows no bar. (GridModel takes the scene and adds/removes actors itself - see grid-model.browser.test.ts.)

Persistence-across-swap case (separate from screenshots):
- After driving HP and clock.step, call wall.syncGraphic() again (forces graphics.use() swap) and clock.step(16); the bar must still render because onPostDraw is a GraphicsComponent property independent of the current graphic. Assert behaviorally (e.g. graphics.onPostDraw still set / bar pixel present) rather than only by screenshot.

Layering note: water overlay renders at z:7 (wave-overlay.ts), terrain at z:0; drawHealthBar must set ctx.z=HEALTH_BAR_Z(8). A wave-integrated z-layering check is optional and heavier; the unit/visual coverage above is the priority.

Terrain wiring (the change under test):
- In Terrain base (src/model/terrain/terrain.ts), set this.graphics.onPostDraw once after graphics exist (e.g. in onInitialize). Closure: const h = this.get(HealthComponent); if (!h || h.current <= 0 || h.fraction >= HEALTH_BAR_THRESHOLD) return; drawHealthBar(ctx, h.fraction, TILE_SIZE). Only Wall/Tower carry HealthComponent, so flat/hole/castle never draw.

Docs: update docs/gameplay.md (healthbar appearance threshold, colors, both phases). docs/testing.md already documents the no-path screenshot rule.

Verification: node --run test:unit (fast) then node --run static-check; inspect the written PNGs in test-results/screenshots/ by eye. Commit atomically.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wired health bar onto Terrain actors via graphics.onPostDraw set in onInitialize. The closure reads HealthComponent and calls drawHealthBar when fraction < HEALTH_BAR_THRESHOLD. Fixed Tower to register its HealthComponent via addComponent (it was missing this, unlike Wall). Updated drawHealthBar and HealthBarCtx to use excalibur Vector/Color types to match ExcaliburGraphicsContext.drawRectangle API. Updated health-bar unit tests to use Color.toHex() comparisons and Vector mocks. Added browser tests covering: damaged wall/tower below threshold, full HP wall/tower, bar persistence after syncGraphic swap, destroyed wall->FlatGround (no bar). Updated docs/gameplay.md with health bar threshold, colors, and z-order. All static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
