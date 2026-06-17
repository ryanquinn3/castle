---
id: TASK-006
title: Simplify layout to fixed-resolution FitScreen
status: Done
assignee: []
created_date: '2026-06-17 17:14'
updated_date: '2026-06-17 17:31'
labels:
  - refactor
  - layout
dependencies: []
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The layout system hand-rolls responsive fitting in config.ts computeLayout(): it picks a variable tileSize (clamped 16-36), runs a two-pass tall/short fit check, and manually centers the board in raw window pixels. Eight modules call computeLayout(window) at module load and position every actor, the Tiled map (runtime-scaled by tileSize/16), wave spawns, and the React DOM HUD/toolbar off those screen-pixel constants. There is no resize handling. This duplicates what Excalibur's Screen already does. Replace it with a fixed logical resolution sized to the board in native 16px tile units plus DisplayMode.FitScreen (letterbox), so Excalibur owns scaling/centering/resize. tileSize becomes a constant 16, the Tiled map renders 1:1, and the DOM HUD/toolbar anchor to the scaled canvas via a single resize-driven scale factor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Engine runs in DisplayMode.FitScreen with a fixed logical resolution; the board scales to fit the window preserving aspect ratio with letterbox bars, and resizing the window keeps the board centered and correctly scaled
- [ ] #2 computeLayout() and the Viewport interface are removed from config.ts; no module computes layout from window dimensions at module load
- [ ] #3 Terrain selection by pointer click still maps to the correct grid cell at any window size
- [ ] #4 React HUD and toolbar stay aligned to the board (top corners / below the board) at any window size and on resize
- [ ] #5 node --run static-check passes (lint, typecheck, knip, unit + browser tests)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Execution order: TASK-006.01 (functional flip) then TASK-006.02 (docs). The flip is one atomic refactor because the Excalibur world coordinates and the DOM-overlay anchoring both depend on the FitScreen canvas existing; splitting them would leave an intermediate where the HUD/toolbar are mispositioned.

Fixed logical stage (native 16px tiles):
- TILE_SIZE=16, GRID_LEFT=0, MAP_TOP=0, GRID_TOP=TILEMAP_OCEAN_ROWS*16=16
- GRID_PIXEL_WIDTH=GRID_WIDTH*16=256, GRID_PIXEL_HEIGHT=GRID_HEIGHT*16=288
- STAGE_WIDTH=GRID_WIDTH*16=256, STAGE_HEIGHT=TILEMAP_ROWS*16 + TOOLBAR_BAND
- TOOLBAR_BAND reserves room below the 304px tilemap for the DOM toolbar (~72px logical; tuned by running, toolbar slots are 48px+padding)

Engine: pass width=STAGE_WIDTH, height=STAGE_HEIGHT, displayMode=FitScreen (drop FillScreen and the computeLayout call). Default camera already puts world (0,0) at top-left, so actors keep using world coords with no camera changes.

World consumers (mechanical swap from computeLayout destructuring to imported constants): terrain.ts, castle-actor.ts, terrain-editor.ts, planning-phase.ts, level-session.ts, tide-session.ts. In both sessions set tileScale=1, mapX=GRID_LEFT, mapY=MAP_TOP so the Tiled map and SandLayer render 1:1. wave-overlay.ts, wave-spawner.ts, sand-layer.ts are already param-driven and just receive the fixed values.

DOM anchor (new src/view/ui-stage.ts): #game-ui already overlays the canvas rect exactly (#root sizes to the canvas, #game-ui is 100%/100%). A ResizeObserver on the canvas computes scale s = canvasCssWidth / STAGE_WIDTH and publishes it; HUD/toolbar position children at logicalCoord * s (natural UI size preserved, positions tracked). hud.ts/HudComponent.tsx take a scale prop; toolbar.ts sets its CSS vars in scaled px using logical constants + STAGE_HEIGHT instead of window.innerHeight. A pure stageScale() helper is unit-tested (TDD).

Cleanup: remove computeLayout, Viewport, HUD_TOP, PADDING, TOOLBAR_RESERVED_HEIGHT from config.ts; confirm knip is clean.

Key files: src/config.ts, src/engine.ts, src/view/ui-stage.ts (new), src/model/terrain/terrain.ts, src/view/castle-actor.ts, src/view/terrain-editor.ts, src/view/planning-phase.ts, src/level-session.ts, src/tide-session.ts, src/view/toolbar.ts, src/view/hud.ts, src/ui/HudComponent.tsx.
Risks: TOOLBAR_BAND/visual tuning; verify pointer worldPos still maps under FitScreen (Excalibur's evt.worldPos already accounts for scale); confirm #game-ui overlay alignment with letterbox bars.
Verification: node --run static-check, plus manually run the dev server and resize the window.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced computeLayout() with fixed 256×376 logical stage under DisplayMode.FitScreen. Removed Viewport/computeLayout from config.ts; added TILE_SIZE, GRID_LEFT, MAP_TOP, GRID_TOP, STAGE_WIDTH, STAGE_HEIGHT, TOOLBAR_BAND. New ui-stage.ts provides stageScale() helper (6 unit tests) and ResizeObserver for DOM overlay alignment. All world consumers use fixed constants. AGENTS.md updated. static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
