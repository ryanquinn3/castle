---
id: TASK-014.01
title: Fix hole silting to run off persisted puddle across all holes
status: Done
assignee:
  - '@claude'
created_date: '2026-06-20 16:29'
updated_date: '2026-06-20 18:31'
labels:
  - bug
dependencies: []
references:
  - src/model/terrain/hole.ts
  - src/model/grid-model.ts
  - src/wave/wave-segment-types.ts
  - src/wave/wave-event-applier.ts
  - src/wave/wave-field-runtime.ts
parent_task_id: TASK-014
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Vertical-slice fix (TDD). Stop gating silting on transient resting water; drive it off each hole's persisted puddleDepth and run a silt pass over all holes at wave end, with a top-off rule so an effectively-full hole finishes to flat. Lands as one atomic commit because removing silting from the per-resting-cell commit while leaving the runtime unchanged would break the runtime browser test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hole.commitWave is replaced by Hole.siltStep(): silts depth-1/puddle-1 when puddleDepth >= 1; tops off (depth-1, puddle clamped to new depth) when puddleDepth > 0 and effectiveDepth < 1; returns null otherwise
- [x] #2 GridModel.commitHoleWave is replaced by GridModel.siltAllHoles(): ErosionResult[] that silts every Hole via siltStep, converts holes reaching elevation 0 to FlatGround, and re-detects pools once
- [x] #3 WaveEventApplier handles holeCommit as absorb-only (routes pooled water to puddle via applyPuddleDelta, no erosion result) and adds a siltHoles event that returns the silted/eroded tiles
- [x] #4 WaveFieldRuntime.onComplete absorbs every resting cell into its hole, then triggers the all-holes silt pass, collecting eroded tiles for the flash
- [x] #5 New regression test: a hole with stored puddle and no fresh resting water silts each wave end and an effectively-full hole reaches FlatGround
- [x] #6 node --run static-check passes
- [x] #7 Changes committed atomically in a single git commit scoped to this subtask
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced Hole.commitWave with absorbPool()+siltStep(); replaced GridModel.commitHoleWave with absorbHolePool()+siltAllHoles(); added siltHoles event to WaveSegmentEvent; updated WaveEventApplier to absorb-only on holeCommit and silt all holes on siltHoles; updated WaveFieldRuntime.onComplete to absorb resting cells then trigger siltHoles pass. Added regression test confirming a fully-puddled hole with no resting water decays to FlatGround across repeated wave ends. node --run static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
