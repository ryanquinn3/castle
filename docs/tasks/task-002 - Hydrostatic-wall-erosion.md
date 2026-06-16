---
id: TASK-002
title: Hydrostatic wall erosion
status: To Do
assignee: []
created_date: '2026-06-16 19:03'
updated_date: '2026-06-16 19:03'
labels: []
dependencies: []
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Walls that fully block water currently take no HP damage because the pressure-water kernel produces near-zero inflow velocity against a blocking face, so frontalCoeff*frontal collapses to 0 and only the tiny shearCoeff term contributes. Add a depth-driven hydrostatic term to the erosion charge so blocked water still chips wall HP, with the rate scaling by water depth at the adjacent wet cell.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 computeErosionHits accepts a hydrostaticCoeff and adds hydrostaticCoeff*depth to per-face charge for each wet cell adjacent to an erodible face
- [ ] #2 A new PRESSURE_EROSION_HYDROSTATIC_COEFF constant is defined in src/config.ts and threaded through wave-field-runtime to computeErosionHits
- [ ] #3 A wet cell with zero velocity but nonzero depth adjacent to a wall produces erosion hits proportional to depth (covered by a unit test)
- [ ] #4 docs/gameplay.md describes that blocked water erodes walls over time with rate scaling by depth
- [ ] #5 node --run static-check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Order:
1. TASK-002.01 — extend computeErosionHits in src/wave/wave-erosion.ts with a hydrostatic depth term plus its unit tests. Independent and verifiable in isolation.
2. TASK-002.02 — add PRESSURE_EROSION_HYDROSTATIC_COEFF to src/config.ts and pass it through src/wave/wave-field-runtime.ts. Depends on TASK-002.01.
3. TASK-002.03 — update docs/gameplay.md to document the new blocked-water erosion behavior. Depends on TASK-002.02.

Key files: src/wave/wave-erosion.ts, src/wave/wave-erosion.test.ts, src/wave/wave-field-runtime.ts, src/config.ts, docs/gameplay.md.

Risks: tuning the coefficient — pick 0.15 as a starting value; revisit during playtest. Don't gate on overtop state; hydrostatic pressure applies regardless. Frontal/shear coeffs unchanged.
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
