---
id: TASK-008
title: Render world at TILE_SIZE=32 to de-grain terrain
status: To Do
assignee: []
created_date: '2026-06-17 21:08'
updated_date: '2026-06-18 11:32'
labels:
  - rendering
dependencies: []
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-006's fixed-resolution FitScreen layout (256x304 logical, pixelArt nearest-neighbor), hi-res terrain art (castle 320px, wall swatches 512px, tower 80px) is crushed into 16px tiles and blown back up, looking grainy. Double the world render tile size to 32px (logical stage 512x608) so procedural draws get 4x pixels and hi-res sprites retain 2x detail. The blocker is that TILE_SIZE is not a single source of truth: the Tiled tilemap render and SandLayer use a native 16px asset resolution that must be scaled by TILE_SIZE/16, and several absolute pixel constants (overlay fonts, planning-line, wave-front noise) must scale too.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TILE_SIZE=32 with the Tiled base tilemap and moist-sand overlay rendering aligned to the 32px grid (no half-size/offset tilemap)
- [ ] #2 Procedural walls/holes and hi-res sprites render visibly sharper; overlay/HUD text and wave-front feel keep their relative proportions
- [ ] #3 node --run static-check passes; the game runs and is verified by eye at the new resolution
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Root cause: TILE_SIZE conflates two distinct sizes. NATIVE asset/Tiled resolution is 16px (spritesheet.png, beach_tileset.png are authored at 16px); world render size is what we want at 32px. SandLayer already takes a tileScale param and does all math in native-16px space then scales the overlay actor, but both sessions pass tileScale=1 and set tm.scale=vec(1,1), so bumping TILE_SIZE alone leaves the tilemap rendering at native 16px in a 32px world (half-size, misaligned).

Execution order:
- 008.01 (core): config introduces NATIVE_TILE_SIZE=16 and TILEMAP_SCALE=TILE_SIZE/NATIVE_TILE_SIZE, sets TILE_SIZE=32. Both sessions set tm.scale=vec(TILEMAP_SCALE,...) and pass TILEMAP_SCALE to SandLayer. Fix ui-stage.test.ts default-width case to derive from STAGE_WIDTH. Browser test asserts each tilemap layer scale equals TILEMAP_SCALE. After this commit the game renders correctly aligned at 2x; this is the atomic 'make 32 work' slice.
- 008.02 (proportions): scale the absolute pixel constants that do not derive from TILE_SIZE so the doubled stage keeps its look/feel: screen-overlays.ts fonts, planning-phase.ts line height/label offset/font, config WAVE_FRONT_NOISE_AMPLITUDE, water-field-coverage.ts FOAM_PIXELS. Cosmetic, manual visual verification (no brittle font-size assertions per docs/testing.md).

Key files: src/config.ts, src/level-session.ts, src/tide-session.ts, src/view/sand-layer.ts (consumer, no change needed), src/view/ui-stage.test.ts, src/view/screen-overlays.ts, src/view/planning-phase.ts, src/wave/water-field-coverage.ts.
Branch: feat/tile-size-32. SandLayer internal TILED_TILE_SIZE=16 stays (it IS the native asset size). Tiled .tmx and spritesheet stay 16px native; we scale the render, not the source. Accepted tradeoff: base sand tilemap is genuine 16px pixel-art so it upscales 2x (slightly chunkier) - flat texture, acceptable.

008.02 depends on 008.01.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Levers evaluated (Excalibur docs + context7):
- Camera.zoom: REJECTED. It magnifies the world->screen transform, adds no sprite sampling fidelity (grainier under pixelArt nearest-neighbor), and would crop the fit-to-stage board.
- pixelRatio:2/3: viable per Excalibur's pixel-art guide for <500x500 stages (ours is 256x304); reaches the same backing resolution as TILE_SIZE=32 with one engine.ts line and no plumbing. EVALUATED but NOT chosen.
- Decision: proceed with TILE_SIZE=32 (logical-resolution bump) per plan, for genuine logical detail in procedural wall/hole canvases beyond what pixelRatio's backing-only scale provides. pixelRatio remains an easy future complement if needed.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
