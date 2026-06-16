---
id: TASK-002.01
title: Hydrostatic term in computeErosionHits
status: Done
assignee:
  - '@claude'
created_date: '2026-06-16 19:03'
updated_date: '2026-06-16 19:16'
labels: []
dependencies: []
parent_task_id: TASK-002
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the pure erosion function to include a depth-driven charge contribution so wet cells exert pressure on adjacent erodible faces regardless of velocity. WetCell already carries depth; the kernel just needs to use it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ErosionInput in src/wave/wave-erosion.ts gains a hydrostaticCoeff: number field
- [x] #2 Per face charge inside computeErosionHits adds hydrostaticCoeff * max(0, cell.depth) alongside the existing frontal and shear terms
- [x] #3 Existing wave-erosion unit tests still pass when hydrostaticCoeff is 0 (no behavior change for the zero-coeff case)
- [x] #4 A new unit test in src/wave/wave-erosion.test.ts verifies that a wet cell with velX=0, velY=0, and depth>0 adjacent to a wall produces accumulated charge equal to hydrostaticCoeff * depth per frame and emits integer hits across frames
- [x] #5 node --run static-check passes
- [x] #6 Change is committed as a single atomic git commit
<!-- AC:END -->



## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added hydrostaticCoeff: number to ErosionInput. computeErosionHits now adds hydrostaticCoeff * max(0, cell.depth) per adjacent erodible face per frame alongside frontal/shear terms. All existing tests updated to pass hydrostaticCoeff: 0, preserving existing behavior. New test verifies still water (velX=0, velY=0, depth>0) accumulates and emits hits correctly across frames. wave-field-runtime.ts updated with hydrostaticCoeff: 0 placeholder to keep the codebase compiling; proper wiring is TASK-002.02. node --run static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
