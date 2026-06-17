---
id: TASK-004.02
title: Add delete-modal bridge class to mount/unmount ConfirmDeleteModal
status: Done
assignee:
  - '@claude'
created_date: '2026-06-17 09:58'
updated_date: '2026-06-17 10:08'
labels:
  - feature
dependencies:
  - TASK-004.01
parent_task_id: TASK-4
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Thin Excalibur-to-React bridge (like GameplayControls) that mounts ConfirmDeleteModal into #game-ui, manages open state, and exposes open/close/onConfirm/onCancel callbacks to the terrain editor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 DeleteConfirmation class mounts React root into #game-ui container on open and unmounts on close or deactivate
- [x] #2 Exposes open(terrainLabel) that renders the modal and returns a Promise<boolean> (true=confirmed, false=cancelled)
- [x] #3 Atomic git commit for this subtask
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created src/view/delete-confirmation.ts - a React bridge class matching the GameplayControls pattern. DeleteConfirmation.open(terrainLabel) mounts ConfirmDeleteModal into #game-ui, wires onConfirm/onCancel to resolve the promise, and unmounts on close. deactivate() forcibly unmounts if needed. Updated knip.config.ts to ignore both delete-confirmation.ts and ConfirmDeleteModal.tsx until TASK-004.03 imports the bridge. node --run static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->
