---
id: TASK-008.01
title: Separate native asset resolution from world tile size; render at TILE_SIZE=32
status: To Do
assignee: []
created_date: '2026-06-17 21:08'
labels:
  - rendering
dependencies: []
references:
  - src/config.ts
  - src/level-session.ts
  - src/tide-session.ts
  - src/view/ui-stage.test.ts
parent_task_id: TASK-008
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make TILE_SIZE the single source of truth for world render size and propagate the native(16)->world(32) scale to the Tiled tilemap and SandLayer. This is the atomic core that makes 32 actually work and align.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/config.ts adds NATIVE_TILE_SIZE=16 and TILEMAP_SCALE=TILE_SIZE/NATIVE_TILE_SIZE, sets TILE_SIZE=32; the 'native 1:1 tiles / 256x304' comment is updated to reflect 32px logical tiles over 16px native assets
- [ ] #2 src/level-session.ts and src/tide-session.ts set tm.scale=vec(TILEMAP_SCALE,TILEMAP_SCALE) for each Tiled tile layer and pass TILEMAP_SCALE (not 1) as the SandLayer tileScale
- [ ] #3 A browser test boots a game scene and asserts each Tiled tile layer's tilemap.scale.x equals TILEMAP_SCALE (guards the regression where the tilemap did not scale)
- [ ] #4 src/view/ui-stage.test.ts default-STAGE_WIDTH case imports STAGE_WIDTH and computes expectations relative to it instead of hardcoding 256, so it passes at the new resolution
- [ ] #5 node --run static-check passes and the change is committed atomically on feat/tile-size-32
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
