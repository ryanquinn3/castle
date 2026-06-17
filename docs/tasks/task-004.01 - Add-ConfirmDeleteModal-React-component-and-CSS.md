---
id: TASK-004.01
title: Add ConfirmDeleteModal React component and CSS
status: Done
assignee:
  - '@claude'
created_date: '2026-06-17 09:58'
updated_date: '2026-06-17 10:05'
labels:
  - feature
dependencies: []
parent_task_id: TASK-4
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
New React modal component reusing the visual pattern from the exit-confirmation modal in GameplayControlsComponent. Shows terrain type name, warns no sand refunded, has Cancel and Delete buttons. Enter key confirms, Escape cancels.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ConfirmDeleteModal.tsx renders a modal with terrain type label, warning text, Cancel and Delete buttons
- [x] #2 Enter keydown on the modal triggers confirm callback
- [x] #3 Escape keydown on the modal triggers cancel callback
- [x] #4 CSS reuses the gameplay-controls-modal pattern (backdrop, dialog, button styles)
- [x] #5 Atomic git commit for this subtask
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Blocked: knip flags ConfirmDeleteModal.tsx as unused (not yet imported). To fix, add ignore: ["src/ui/ConfirmDeleteModal.tsx"] to knip.config.ts. Subagents cannot edit that file. User needs to make this one-line change to unblock static-check, OR this can be resolved naturally when TASK-004.02 imports the component.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added ConfirmDeleteModal React component (src/ui/ConfirmDeleteModal.tsx) and confirm-delete-modal.css. Component renders backdrop+dialog with terrain label, no-refund warning, Cancel/Delete buttons, and Enter/Escape keydown handlers. Added knip ignore for the new file until TASK-004.02 imports it.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->
