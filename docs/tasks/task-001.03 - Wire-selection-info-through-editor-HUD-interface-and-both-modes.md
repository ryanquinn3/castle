---
id: TASK-001.03
title: 'Wire selection info through editor, HUD interface, and both modes'
status: To Do
assignee: []
created_date: '2026-06-16 17:54'
labels: []
dependencies: []
parent_task_id: TASK-1
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace `getStateText()` on `TerrainEditor` with `getSelectedInfo(): CellInfo | null`. Update the `PlanningHud` interface to use `updateSelection(info)` instead of `updateState(text)`. Cascade the change through `PlanningPhase`, `Hud`/`HudComponent`, and `TideHud`/`TideHudComponent` so both modes render `CellInfoPanel` in the right panel.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `TerrainEditor.getSelectedInfo()` returns null when nothing is selected and the terrain's `CellInfo` when a cell is selected,`PlanningHud` interface uses `updateSelection(info: CellInfo | null)` (no `updateState`),Classic mode right panel shows `CellInfoPanel` during planning,Tide mode right panel shows `CellInfoPanel` during planning (alongside the countdown),No remaining `getStateText` or `updateState` references,`node --run static-check` passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 node --run static-check passes
<!-- DOD:END -->
