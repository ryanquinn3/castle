---
id: TASK-004
title: Delete terrain (wall/hole/tower) with confirmation modal
status: Done
assignee: []
created_date: '2026-06-17 09:57'
updated_date: '2026-06-17 10:18'
labels:
  - feature
dependencies: []
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Press Delete/Backspace on a selected wall, hole, or tower to revert it to flat ground. A confirmation modal appears; Enter confirms, Escape cancels. No sand is refunded. While the modal is open, the editor is locked and the tide-mode countdown is paused.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pressing Delete/Backspace on a selected Wall, Hole, or Tower opens a confirmation modal
- [x] #2 Pressing Delete/Backspace on FlatGround is a no-op
- [x] #3 Enter on the modal replaces the terrain with FlatGround and closes the modal
- [x] #4 Escape on the modal closes it with no terrain change
- [x] #5 No sand is refunded on deletion
- [x] #6 Editor is locked while the delete confirmation modal is open
- [x] #7 Tide-mode countdown pauses while the delete confirmation modal is open and resumes on close
- [x] #8 Unit tests cover delete guard, confirm, cancel, and no-refund behavior
- [x] #9 node --run static-check passes
- [x] #10 docs/gameplay.md updated with delete mechanic
<!-- AC:END -->





















## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Execution Order

TASK-004.01 -> TASK-004.02 -> TASK-004.03 -> TASK-004.04 (strictly sequential)

## Approach

### Task 1: ConfirmDeleteModal React component (src/ui/)
- New ConfirmDeleteModal.tsx: stateless FC, props = { terrainLabel, onConfirm, onCancel }
- Renders same visual structure as exit modal in GameplayControlsComponent (backdrop + centered dialog)
- useEffect registers keydown listener for Enter (confirm) and Escape (cancel)
- New confirm-delete-modal.css reusing .gameplay-controls-modal class names (shared styles)
- Files: src/ui/ConfirmDeleteModal.tsx, src/ui/confirm-delete-modal.css

### Task 2: DeleteConfirmation bridge class (src/view/)
- New delete-confirmation.ts following GameplayControls pattern
- open(terrainLabel) -> mounts React root into #game-ui, returns Promise<boolean>
- Resolves true on confirm, false on cancel; unmounts on either
- deactivate() cleans up if still open
- Files: src/view/delete-confirmation.ts

### Task 3: Wire Delete key in TerrainEditor
- In handleKey: intercept Keys.Delete and Keys.Backspace
- Guard: cell must be Wall, Hole, or Tower (not FlatGround)
- Lock editor, fire onDeleteDialogOpenChange(true)
- Await deleteConfirmation.open(cell type label)
- On confirm: grid.setCell(col, row, new FlatGround()) -- no sand refund
- Fire onDeleteDialogOpenChange(false), unlock editor, refresh toolbar/state
- TerrainEditor gains deleteConfirmation: DeleteConfirmation field, set during activate()
- TerrainEditor gains onDeleteDialogOpenChange callback
- Unit tests: delete guard (flat=no-op, wall/hole/tower=opens), confirm replaces cell, cancel preserves, no sand change
- Files: src/view/terrain-editor.ts, src/view/terrain-editor.test.ts

### Task 4: Wire sessions + docs
- PlanningPhase: accept onDeleteDialogOpenChange callback, pass to editor
- TideSession: subscribe with same pattern as handleExitDialogOpenChange (pause countdown, lock toolbar)
- LevelSession: subscribe to lock/unlock planning
- Update docs/gameplay.md with delete mechanic
- Run node --run static-check
- Files: src/view/planning-phase.ts, src/tide-session.ts, src/level-session.ts, docs/gameplay.md

## Key Decisions
- Promise-based modal (not callback pairs) keeps TerrainEditor flow linear
- No sand refund on delete (design decision)
- Reuse existing modal CSS classes rather than duplicating styles
- DeleteConfirmation is a standalone bridge (not embedded in GameplayControls) to keep concerns separated
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->
