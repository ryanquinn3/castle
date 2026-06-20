---
id: TASK-014.02
title: Document persisted-puddle hole silting and top-off in gameplay.md
status: Done
assignee:
  - '@claude'
created_date: '2026-06-20 16:29'
updated_date: '2026-06-20 18:32'
labels:
  - bug
dependencies:
  - TASK-014.01
references:
  - docs/gameplay.md
parent_task_id: TASK-014
ordinal: 45000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/gameplay.md Holes erosion section states silting is driven by persisted pooled water (puddleDepth) at wave end, not by transient resting water, and applies to every hole holding pooled water
- [x] #2 docs/gameplay.md documents the top-off behavior: an effectively-full hole keeps silting until it reaches flat ground
- [x] #3 No stale wording remains implying only resting/absorbing holes silt
- [x] #4 Changes committed atomically in a single git commit scoped to this subtask
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated docs/gameplay.md Holes section: silting now described as driven by persisted puddleDepth at wave end (not transient resting water), applying to every hole holding pooled water; documents top-off behavior where an effectively-full hole keeps silting each wave until it reaches flat ground.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
