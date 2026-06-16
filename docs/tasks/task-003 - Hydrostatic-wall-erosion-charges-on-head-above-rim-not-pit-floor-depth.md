---
id: TASK-003
title: 'Hydrostatic wall erosion charges on head above rim, not pit-floor depth'
status: To Do
assignee: []
created_date: '2026-06-16 21:26'
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

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
