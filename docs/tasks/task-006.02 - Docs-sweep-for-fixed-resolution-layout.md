---
id: TASK-006.02
title: Docs sweep for fixed-resolution layout
status: Done
assignee:
  - '@claude'
created_date: '2026-06-17 17:15'
updated_date: '2026-06-17 17:31'
labels:
  - docs
  - layout
dependencies:
  - TASK-006.01
parent_task_id: TASK-006
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Align documentation with the new fixed-resolution FitScreen layout after TASK-006.01 lands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AGENTS.md core-files notes for engine.ts and config.ts describe FitScreen + fixed logical resolution instead of FillScreen + computeLayout, and reference src/view/ui-stage.ts
- [x] #2 The stale 'requires browser window because computeLayout(window)' comment in terrain.ts is corrected (it now imports plain constants)
- [x] #3 Change is committed atomically on a feat/ branch
<!-- AC:END -->



## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated AGENTS.md: engine.ts note now says FitScreen + fixed logical resolution, config.ts note lists the fixed layout constants, ui-stage.ts added as a new core file, and the replay-tool retirement note drops the stale computeLayout(window) phrasing. node --run static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
