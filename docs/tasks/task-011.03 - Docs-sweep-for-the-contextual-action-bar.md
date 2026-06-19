---
id: TASK-011.03
title: Docs sweep for the contextual action bar
status: Done
assignee:
  - '@claude'
created_date: '2026-06-19 10:21'
updated_date: '2026-06-19 10:36'
labels:
  - docs
dependencies:
  - TASK-011.02
parent_task_id: TASK-11
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update documentation to reflect the contextual action bar replacing the fixed tool palette. docs/gameplay.md: describe the planning-phase action bar, the per-cell verb matrix (flat=Dig/Build Wall/Build Tower; hole=Dig; wall L1-L3=Upgrade/Destroy; wall L4 & tower=Destroy), letter hotkeys S/W/T/U/X, that Build Wall builds L1 and Upgrade steps to the next level, and that Destroy keeps the confirmation dialog and Delete/Backspace. AGENTS.md: update the toolbar.ts, terrain-editor.ts, and ToolbarComponent.tsx descriptions in the View/UI sections and replace the tool-type.ts reference with action-type.ts (ActionType + applicableActions/actionCost). Verify no other docs reference the old Wall1-4/Tower tool palette.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/gameplay.md describes the contextual action bar, the per-cell verb matrix, the S/W/T/U/X hotkeys, and Destroy's confirmation/Delete behavior
- [x] #2 AGENTS.md view/UI descriptions reflect action-type.ts and the new toolbar/editor/component behavior; the old fixed-palette/tool-type wording is removed
- [x] #3 No remaining doc references describe the old always-on Wall1-4/Tower/Shovel slot palette
- [x] #4 Committed atomically as a single scoped commit
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated docs/gameplay.md and AGENTS.md to reflect the contextual action bar. gameplay.md: replaced the fixed 6-slot tool palette description with the per-cell verb matrix (flat=Dig/Build Wall/Build Tower; hole=Dig; wall L1-L3=Upgrade/Destroy; wall L4=Destroy; tower=Destroy), S/W/T/U/X hotkey table, updated action bar and Destroy/delete sections. AGENTS.md: updated planning-phase description, added action-type.ts to core files, rewrote toolbar.ts/terrain-editor.ts/ToolbarComponent.tsx descriptions to reflect ActionView, setActions, applyAction, applicableActions, and requestDestroy. static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->
