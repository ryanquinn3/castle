---
id: TASK-006.01
title: Switch to fixed-resolution FitScreen and anchor the DOM UI
status: Done
assignee:
  - '@claude'
created_date: '2026-06-17 17:14'
updated_date: '2026-06-17 17:29'
labels:
  - refactor
  - layout
dependencies: []
parent_task_id: TASK-006
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the bespoke computeLayout() fitting with a fixed logical stage (256 x [304 + toolbar band], native 16px tiles) under DisplayMode.FitScreen, repoint every world-space consumer to fixed layout constants, render the Tiled map and SandLayer at scale 1, and anchor the React HUD/toolbar to the FitScreen canvas via a single resize-driven scale factor. This is one atomic change: the world swap and the DOM anchoring depend on each other for a working screen.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 config.ts exports fixed constants (TILE_SIZE=16, GRID_LEFT=0, MAP_TOP=0, GRID_TOP=16, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT, STAGE_WIDTH, STAGE_HEIGHT, TOOLBAR_BAND); computeLayout(), Viewport, HUD_TOP, PADDING, and TOOLBAR_RESERVED_HEIGHT are removed
- [x] #2 engine.ts constructs the Engine with width=STAGE_WIDTH, height=STAGE_HEIGHT, displayMode=FitScreen and no computeLayout call
- [x] #3 terrain.ts, castle-actor.ts, terrain-editor.ts, planning-phase.ts, and both sessions position actors from the fixed constants; both sessions set tileScale=1 and map origin to (GRID_LEFT, MAP_TOP) so the Tiled map and SandLayer render 1:1
- [x] #4 A new src/view/ui-stage.ts exposes a pure stageScale() helper (unit-tested) and a ResizeObserver-based setup that publishes scale = canvasCssWidth / STAGE_WIDTH; HudComponent and toolbar position children at logicalCoord * scale and stay aligned to the board on load and on window resize
- [x] #5 Board renders centered and scaled with letterbox bars, pointer selection maps to the correct cell, and node --run static-check passes
- [x] #6 Change is committed atomically on a feat/ branch
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced computeLayout() viewport fitting with a fixed 256×376 logical stage (16px native tiles, 72px toolbar band) under DisplayMode.FitScreen. Removed Viewport, Layout interfaces, computeLayout(), HUD_TOP, PADDING, TOOLBAR_RESERVED_HEIGHT from config.ts; added TILE_SIZE, GRID_LEFT, MAP_TOP, GRID_TOP, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT, STAGE_WIDTH, STAGE_HEIGHT, TOOLBAR_BAND. Engine now uses FitScreen with fixed dimensions. All world-space consumers import fixed constants directly. Both sessions set tileScale=1 and map origin to (GRID_LEFT, MAP_TOP). New src/view/ui-stage.ts provides a pure stageScale() helper (6 unit tests) and ResizeObserver-based observeStageScale(); HudComponent, TideHudComponent, and Toolbar multiply logical coords by live scale so overlays stay board-aligned on resize. All tests (unit + browser) pass; node --run static-check green.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->
