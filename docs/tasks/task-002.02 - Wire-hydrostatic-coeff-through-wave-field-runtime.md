---
id: TASK-002.02
title: Wire hydrostatic coeff through wave-field-runtime
status: Done
assignee:
  - '@claude'
created_date: '2026-06-16 19:04'
updated_date: '2026-06-16 19:20'
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
- [x] #1 src/config.ts defines PRESSURE_EROSION_HYDROSTATIC_COEFF with starting value 0.15 and a short docblock describing the depth-driven blocked-water erosion term
- [x] #2 src/wave/wave-field-runtime.ts imports PRESSURE_EROSION_HYDROSTATIC_COEFF and passes it as hydrostaticCoeff in the computeErosionHits call inside resolveTerrain
- [x] #3 node --run static-check passes
- [x] #4 Change is committed as a single atomic git commit
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added PRESSURE_EROSION_HYDROSTATIC_COEFF = 0.15 to src/config.ts with a docblock describing the depth-driven blocked-water erosion term. Updated src/wave/wave-field-runtime.ts to import the constant and pass it as hydrostaticCoeff in the computeErosionHits call inside resolveTerrain, replacing the hardcoded 0. static-check (tsc, lint, unit_test, knip, browser_test) passes. Committed atomically.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
