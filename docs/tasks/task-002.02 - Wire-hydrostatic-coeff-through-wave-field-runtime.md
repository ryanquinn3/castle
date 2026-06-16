---
id: TASK-002.02
title: Wire hydrostatic coeff through wave-field-runtime
status: To Do
assignee: []
created_date: '2026-06-16 19:04'
labels: []
dependencies:
  - TASK-002.01
parent_task_id: TASK-002
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose the new coefficient as a tunable constant and pass it from the wave-field-runtime call site into computeErosionHits so the term is active in real waves.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/config.ts defines PRESSURE_EROSION_HYDROSTATIC_COEFF with starting value 0.15 and a short docblock describing the depth-driven blocked-water erosion term
- [ ] #2 src/wave/wave-field-runtime.ts imports PRESSURE_EROSION_HYDROSTATIC_COEFF and passes it as hydrostaticCoeff in the computeErosionHits call inside resolveTerrain
- [ ] #3 node --run static-check passes
- [ ] #4 Change is committed as a single atomic git commit
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
