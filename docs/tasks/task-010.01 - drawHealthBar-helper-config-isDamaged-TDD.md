---
id: TASK-010.01
title: drawHealthBar helper + config + isDamaged (TDD)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-18 14:03'
updated_date: '2026-06-18 14:31'
labels: []
dependencies: []
references:
  - src/view/health-bar.ts
  - src/config.ts
  - src/model/terrain/health-component.ts
parent_task_id: TASK-010
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the pure bar-drawing helper and supporting config/component API, fully unit-tested, with no wiring yet. New src/view/health-bar.ts exports drawHealthBar(ctx, fraction, tileSize) drawing relative to tile center: 1px dark border + background + fill rect, top edge at y=-tileSize/2+inset, x from -(tileSize/2)+inset, height HEALTH_BAR_HEIGHT, fill width = (tileSize-2*inset)*clamp(fraction,0,1), and sets ctx.z=HEALTH_BAR_Z; fill color chosen by discrete zone (green>0.75, amber>0.5, red otherwise). config.ts gains HEALTH_BAR_THRESHOLD=0.5, HEALTH_BAR_Z=8, HEALTH_BAR_HEIGHT, HEALTH_BAR_INSET, and the three zone colors. HealthComponent gains isDamaged getter. TDD: write the helper/component unit tests first.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 config.ts defines HEALTH_BAR_THRESHOLD=0.5, HEALTH_BAR_Z=8, HEALTH_BAR_HEIGHT, HEALTH_BAR_INSET, and three zone colors (green/amber/red)
- [x] #2 src/view/health-bar.ts exports drawHealthBar(ctx, fraction, tileSize) drawing border+bg+fill relative to tile center, fill width = (tileSize-2*inset)*clamp(fraction,0,1), and sets ctx.z=HEALTH_BAR_Z
- [x] #3 drawHealthBar picks fill color by discrete zone: fraction>0.75 green, >0.5 amber, else red
- [x] #4 HealthComponent gains get isDamaged() returning fraction < HEALTH_BAR_THRESHOLD
- [x] #5 Unit tests cover all three color zones, fill width at fraction 0/0.5/1 with clamping, and isDamaged threshold math
- [x] #6 node --run static-check passes
- [x] #7 Change committed atomically
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added HEALTH_BAR_* constants to config.ts (threshold=0.5, z=8, height=2, inset=2, three zone colors). Created src/view/health-bar.ts exporting drawHealthBar(ctx, fraction, tileSize) with border+bg+fill rects, discrete color zones, and clamped fill width. Added isDamaged getter to HealthComponent. Tests written first: 15 tests in health-bar.test.ts and 5 isDamaged tests in health-component.test.ts. All 236 unit tests pass; static-check (tsc, lint, unit, knip, browser) passes.
<!-- SECTION:FINAL_SUMMARY:END -->
