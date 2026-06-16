---
id: TASK-002.01
title: Hydrostatic term in computeErosionHits
status: To Do
assignee: []
created_date: '2026-06-16 19:03'
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
- [ ] #1 ErosionInput in src/wave/wave-erosion.ts gains a hydrostaticCoeff: number field
- [ ] #2 Per face charge inside computeErosionHits adds hydrostaticCoeff * max(0, cell.depth) alongside the existing frontal and shear terms
- [ ] #3 Existing wave-erosion unit tests still pass when hydrostaticCoeff is 0 (no behavior change for the zero-coeff case)
- [ ] #4 A new unit test in src/wave/wave-erosion.test.ts verifies that a wet cell with velX=0, velY=0, and depth>0 adjacent to a wall produces accumulated charge equal to hydrostaticCoeff * depth per frame and emits integer hits across frames
- [ ] #5 node --run static-check passes
- [ ] #6 Change is committed as a single atomic git commit
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
