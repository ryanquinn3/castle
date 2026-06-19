---
id: TASK-012.02
title: Bordered health bar with track
status: Done
assignee:
  - '@claude'
created_date: '2026-06-19 11:09'
updated_date: '2026-06-19 11:27'
labels: []
dependencies: []
references:
  - src/config.ts
  - src/view/health-bar.ts
parent_task_id: TASK-012
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Give the per-tile health bar a 1px solid-black border/frame that also serves as a track behind the missing-HP portion. Add config consts and compose frame+fill via a GraphicsGroup in HealthBar so the fill Rectangle stays mutable. Add a browser test with a screenshot for visual verification.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 HEALTH_BAR_BORDER_WIDTH (1) and HEALTH_BAR_BORDER_COLOR ('#000000') added to config.ts
- [x] #2 HealthBar renders a static solid-black frame (innerWidth+2*border wide, HEALTH_BAR_HEIGHT+2*border tall) behind the fill via a GraphicsGroup; frame spans full inner width so missing HP reads as a black track
- [x] #3 Frame and fill toggle visibility together using the existing current>0 && fraction<HEALTH_BAR_THRESHOLD rule; full-HP tiles still show nothing
- [x] #4 New src/view/health-bar.browser.test.ts verifies a damaged actor shows the bordered bar and captures page.screenshot()
- [x] #5 node --run static-check passes and the change is committed atomically
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added HEALTH_BAR_BORDER_WIDTH=1 and HEALTH_BAR_BORDER_COLOR='#000000' to config.ts. Refactored HealthBar to compose a GraphicsGroup with a solid-black frame Rectangle (innerWidth+2px wide, HEALTH_BAR_HEIGHT+2px tall) behind the fill Rectangle, so missing HP reads as a black track. Visibility toggling unchanged (current>0 && fraction<HEALTH_BAR_THRESHOLD). Added health-bar.browser.test.ts with three tests (damaged shows bar, full-HP hides bar, threshold hides bar) plus page.screenshot(). node --run static-check passes (tsc, lint, unit, knip, browser).
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->
