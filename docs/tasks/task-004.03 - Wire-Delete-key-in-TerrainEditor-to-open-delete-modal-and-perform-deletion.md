---
id: TASK-004.03
title: Wire Delete key in TerrainEditor to open delete modal and perform deletion
status: Done
assignee:
  - '@claude'
created_date: '2026-06-17 09:58'
updated_date: '2026-06-17 10:15'
labels:
  - feature
dependencies:
  - TASK-004.02
parent_task_id: TASK-4
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Handle Delete/Backspace in TerrainEditor.handleKey. Guard: only fire when selected cell is Wall, Hole, or Tower. Lock editor, open DeleteConfirmation, await result, unlock editor. On confirm: replace cell with FlatGround via grid.setCell, no sand refund. On cancel: no-op. Expose onDeleteDialogOpenChange callback for sessions to hook countdown pause.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Delete/Backspace on Wall, Hole, or Tower opens the delete confirmation modal
- [x] #2 Delete/Backspace on FlatGround is a no-op
- [x] #3 Confirmed deletion replaces the cell with FlatGround
- [x] #4 No sand is added to inventory on deletion
- [x] #5 Cancelled deletion leaves terrain unchanged
- [x] #6 onDeleteDialogOpenChange callback fires with true on open and false on close
- [x] #7 Unit tests cover all guard and flow paths
- [x] #8 Atomic git commit for this subtask
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added Delete/Backspace handling in TerrainEditor. Added clearCell() to GridModel. Added deleteConfirmation and onDeleteDialogOpenChange to TerrainEditorOptions. Delete/Backspace on Wall/Hole/Tower locks editor, opens DeleteConfirmation modal, awaits result, unlocks, and calls clearCell on confirm (no sand refund). FlatGround and castle cells are no-ops. Wired DeleteConfirmation through PlanningPhase constructor; sessions (LevelSession, TideSession) now own a DeleteConfirmation instance. Added 9 unit tests covering all guard and flow paths. node --run static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->
