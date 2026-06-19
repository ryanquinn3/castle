---
id: TASK-011.02
title: 'Rewire editor, toolbar, component, and planning to the action bar'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-19 10:21'
updated_date: '2026-06-19 10:32'
labels:
  - ui
  - gameplay
dependencies:
  - TASK-011.01
parent_task_id: TASK-11
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Atomic rewire of the planning UI from the fixed ToolType palette to the contextual ActionType bar, then delete src/tool-type.ts. This is one commit because the editor<->toolbar<->component<->planning contract changes together.

TerrainEditor (src/view/terrain-editor.ts): replace validActionsFor with use of applicableActions/actionCost from src/action-type.ts. applyAction(action: ActionType) switches on the verb: Dig -> setElevation(-delta)+addSand(delta)+DigSound; BuildWall -> removeSand(WALL_LEVEL_COST[0]) + placeWall(col,row,1) with refund on failure + WallToolSound; BuildTower -> removeSand(TOWER_COST) + placeTower with refund; Upgrade -> level=cell.level+1, removeSand(WALL_LEVEL_COST[level-1]) + placeWall(col,row,level) with refund; Destroy -> shared confirmation path. Refactor the current handleDeleteKey into a single requestDestroy() used by BOTH the Delete/Backspace key and applyAction(Destroy). Guard applyAction by: applicableActions(cell).includes(action) AND sand>=actionCost. updateToolbar computes an ordered ActionView[] for the selected cell (each: type, hotkey, label, spriteUrl, optional sandEffect, disabled=cost>0&&sand<cost; Dig sandEffect={amount:1,variant:earn}; build/upgrade sandEffect={amount:cost,variant:spend}; Destroy no sandEffect) and calls toolbar.setActions(views), or setActions(null) when nothing is selected. Rename TerrainEdit.tool -> TerrainEdit.action.

Toolbar (src/view/toolbar.ts): drop the static TOOL_DEFS + setEnabledTools/getDisabledTools model. Add setActions(actions: ActionView[]|null) and rename onToolTriggered -> onActionTriggered. Keep setDisabled and setSandCount. Define and export the ActionView interface here.

ToolbarComponent (src/ui/ToolbarComponent.tsx): render a dynamic 1..N button list from props.actions (remove TOTAL_SLOTS=6). When actions===null render a 'Select a cell' prompt. Floating label becomes 'Actions'. Per-button: show hotkey letter, sprite, and ToolCostBadge when sandEffect present; greyed when action.disabled. Keydown handler matches e.key case-insensitively against each action.hotkey and triggers only enabled actions; do nothing while phase-disabled. The global debug D key remains handled elsewhere and is untouched.

PlanningPhase (src/view/planning-phase.ts): handleEdit checks edit.action === ActionType.Dig for the scoop budget decrement.

Delete src/tool-type.ts and its WALL_TOOL_* maps once no longer referenced (Upgrade derives the level directly from cell.level).

Tests: retarget src/view/terrain-editor.test.ts to ActionType and applicableActions (selection enablement, apply for each verb incl. Upgrade replacing the wall2/3/4 cases, refund-on-failure, Destroy via key and via action share one path, no-selection). Add src/view/toolbar.test.ts (unit, jsdom) mirroring the gameplay-controls.test.ts react-dom mock pattern: assert setActions pushes correct button props, null shows the prompt, disabled flag renders, and onActionTriggered fires from a click/hotkey.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 TerrainEditor uses applicableActions/actionCost; applyAction handles Dig/BuildWall/BuildTower/Upgrade/Destroy with sand spend+refund-on-failure matching prior behavior
- [x] #2 A single requestDestroy() path is shared by the Delete/Backspace key and the Destroy action, and both open the existing DeleteConfirmation dialog
- [x] #3 Toolbar exposes setActions(views|null) and onActionTriggered; setDisabled/setSandCount retained; static TOOL_DEFS and setEnabledTools removed
- [x] #4 ToolbarComponent renders a dynamic button list (no fixed 6 slots), an 'Actions' label, a 'Select a cell' prompt when actions is null, greyed unaffordable buttons, and case-insensitive letter hotkeys that fire only enabled actions
- [x] #5 TerrainEdit.action replaces .tool and PlanningPhase decrements the scoop budget on ActionType.Dig
- [x] #6 src/tool-type.ts is deleted and no source imports it
- [x] #7 Holes show only Dig (no wall action); tower and L4 wall show only Destroy; wall L1-L3 show Upgrade+Destroy
- [x] #8 terrain-editor.test.ts retargeted to ActionType and a new toolbar.test.ts covers empty-state/label/disabled/trigger; node --run static-check passes
- [x] #9 Committed atomically as a single scoped commit
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Atomically rewired the planning UI from fixed ToolType palette to contextual ActionType bar. Key changes: TerrainEditor.applyAction(ActionType) replaces the ToolType-based version; a single requestDestroy() is shared by Delete/Backspace key and the Destroy action; Toolbar drops TOOL_DEFS/setEnabledTools/getDisabledTools and gains setActions(ActionView[]|null)+onActionTriggered; ToolbarComponent renders a dynamic N-button list with an 'Actions' label and 'Select a cell' null state; PlanningPhase checks ActionType.Dig for scoop budget; src/tool-type.ts deleted. Tests retargeted to ActionType (terrain-editor.test.ts) and new toolbar.test.ts added. node --run static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->
