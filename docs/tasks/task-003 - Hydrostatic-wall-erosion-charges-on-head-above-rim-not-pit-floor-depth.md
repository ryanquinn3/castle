---
id: TASK-003
title: 'Hydrostatic wall erosion charges on head above rim, not pit-floor depth'
status: To Do
assignee: []
created_date: '2026-06-16 21:26'
updated_date: '2026-06-16 21:26'
labels:
  - gameplay
  - wave
dependencies: []
references:
  - src/wave/wave-erosion.ts
  - src/wave/wave-field-runtime.ts
  - src/wave/wave-dynamic-system.ts
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hydrostatic wall/tower erosion currently charges proportional to a wet cell's full water-column depth measured from its own floor (wave-erosion.ts:67). A trench dug directly in front of a wall holds a tall standing water column, so it accumulates hydrostatic charge every sim frame and shreds the wall even though the wall is successfully containing the water below its crest. A defensive trench should not destroy the wall it protects. Fix: charge hydrostatic erosion on head above the beach-plane rim (max(0, surface - groundLevel)), the same 'seepable' quantity already used by seepDepth/isFieldSettled. Water contained within a hole (surface below rim) does zero hydrostatic damage; flat-ground blocked water is unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hydrostatic erosion charge is proportional to head above the beach-plane rim (max(0, groundAt+depth-groundLevelAt)), not raw cell depth
- [ ] #2 A wet cell inside a hole whose water surface is below the rim, adjacent to a wall, produces zero hydrostatic erosion hits
- [ ] #3 A wet cell on flat ground (groundAt == groundLevelAt) produces the same hydrostatic charge as before the change
- [ ] #4 A wet cell whose surface stacks above the rim produces hydrostatic charge proportional to the head above the rim
- [ ] #5 Frontal and shear erosion behavior is unchanged
- [ ] #6 docs/gameplay.md and the wave-erosion entry in AGENTS.md describe head-above-rim hydrostatic erosion
- [ ] #7 node --run static-check passes
- [ ] #8 Change is committed atomically on a feat/ branch
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Approach: TDD. Single atomic commit on branch feat/hydrostatic-rim-head.

1. Branch: create/switch to feat/hydrostatic-rim-head.

2. wave-erosion.ts (ErosionInput + computeErosionHits):
   - Add two optional fields to ErosionInput: groundAt(col,row)=>number and groundLevelAt(col,row)=>number. Both default to ()=>0 so existing callers and the pure-unit tests that pass hydrostaticCoeff:0 are unaffected (head reduces to depth when both are 0).
   - Replace the hydrostatic term: instead of hydrostaticCoeff * max(0, cell.depth), compute surface = groundAt(cell.col,cell.row) + cell.depth; head = max(0, surface - groundLevelAt(cell.col,cell.row)); hydrostatic = hydrostaticCoeff * head.
   - Update the function header doc comment to describe head-above-rim semantics and reference the seepable concept in wave-dynamic-system.ts.

3. wave-field-runtime.ts:
   - Extract the inline groundAt closure (currently in playWave dynamic-system opts, lines ~94-100) into a private method groundAt(col,row) used by BOTH the dynamic-system config and resolveTerrain.
   - Add private groundLevelAt(col,row) => this.terrainSlope * row (mirrors the dynamic system's groundLevelAt opt).
   - Pass groundAt and groundLevelAt into the computeErosionHits call in resolveTerrain.

4. Tests (wave-erosion.test.ts), written first / alongside:
   - New: hole cell with surface below rim adjacent to wall -> zero hits (groundAt returns a deep floor, head<0). Regression for the trench case.
   - New: flat ground (groundAt==groundLevelAt) -> hydrostatic charge equals current behavior (head==depth).
   - New: surface stacks above rim -> charge proportional to head above rim.
   - Confirm existing frontal/shear/carry-over tests still pass unchanged.
   - Check wave-field-runtime-erosion.browser.test.ts still passes; extend if it covers the trench interaction.

5. Docs:
   - docs/gameplay.md: note that a trench in front of a wall absorbs water and only erodes the wall once water overtops the rim.
   - AGENTS.md: update the wave-erosion.ts bullet to say hydrostatic charge is head-above-rim.

6. Verify: node --run static-check. Commit atomically.

Decision: datum is the beach-plane rim (groundLevelAt), not the wall crest. Rim preserves normal flat-ground blocked-water erosion while neutralizing the deep-trench exploit; crest datum would zero out the term even for tall walls holding a full reservoir on flat ground.
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
