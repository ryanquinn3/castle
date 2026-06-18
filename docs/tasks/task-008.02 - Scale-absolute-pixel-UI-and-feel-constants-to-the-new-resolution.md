---
id: TASK-008.02
title: Scale absolute pixel UI and feel constants to the new resolution
status: To Do
assignee: []
created_date: '2026-06-17 21:08'
updated_date: '2026-06-17 21:09'
labels:
  - rendering
dependencies:
  - TASK-008.01
references:
  - src/view/screen-overlays.ts
  - src/view/planning-phase.ts
  - src/config.ts
  - src/wave/water-field-coverage.ts
parent_task_id: TASK-008
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With the logical stage doubled to 512x608, constants expressed in absolute pixels (rather than derived from TILE_SIZE) now read at half their intended relative size. Scale them so the look and feel match the prior resolution.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/view/screen-overlays.ts banner/level-complete/game-over/score/restart font sizes scale by TILEMAP_SCALE (or are expressed relative to TILE_SIZE); elevation-label fonts already derive from TILE_SIZE and are left unchanged
- [ ] #2 src/view/planning-phase.ts wave-reach line height, label y-offset, and label font scale with TILEMAP_SCALE so the reach indicator looks the same relative size
- [ ] #3 src/config.ts WAVE_FRONT_NOISE_AMPLITUDE and src/wave/water-field-coverage.ts FOAM_PIXELS scale so wave-front jitter and foam keep their relative thickness at 32px tiles
- [ ] #4 No brittle font-size/pixel assertions added (per docs/testing.md); verified by eye in the running game
- [ ] #5 node --run static-check passes and the change is committed atomically on feat/tile-size-32
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
