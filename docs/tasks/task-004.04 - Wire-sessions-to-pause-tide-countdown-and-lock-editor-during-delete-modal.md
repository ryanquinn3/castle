---
id: TASK-004.04
title: Wire sessions to pause tide countdown and lock editor during delete modal
status: Done
assignee:
  - '@claude'
created_date: '2026-06-17 09:58'
updated_date: '2026-06-17 10:17'
labels:
  - feature
dependencies:
  - TASK-004.03
parent_task_id: TASK-4
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In TideSession: subscribe to TerrainEditor's onDeleteDialogOpenChange to pause/resume countdown and lock/unlock toolbar (same pattern as handleExitDialogOpenChange). In LevelSession: subscribe to lock/unlock planning. Both sessions pass the callback through PlanningPhase to TerrainEditor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tide-mode countdown pauses when delete modal opens and resumes when it closes
- [x] #2 Tide-mode toolbar is disabled while delete modal is open
- [x] #3 Classic-mode editor locks during delete modal
- [x] #4 node --run static-check passes
- [x] #5 docs/gameplay.md updated to document the delete mechanic
- [x] #6 Atomic git commit for this subtask
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added handleDeleteDialogOpenChange to TideSession (pauses countdown, locks editor/toolbar) and LevelSession (locks editor/toolbar). Both pass the callback through PlanningPhase to TerrainEditor via the existing onDeleteDialogOpenChange parameter. Added deleteDialogOpen state to TideSession, resetting it in resetRunState and checking it in triggerWaveNow and post-wave re-enable logic. Updated docs/gameplay.md with a Delete terrain paragraph. node --run static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->
