---
id: TASK-001.03
title: 'Wire selection info through editor, HUD interface, and both modes'
status: To Do
assignee: []
created_date: '2026-06-16 18:08'
labels:
  - feature
dependencies:
  - TASK-001.02
modified_files:
  - src/view/terrain-editor.ts
  - src/view/terrain-editor.test.ts
  - src/view/planning-phase.ts
  - src/view/hud.ts
  - src/ui/HudComponent.tsx
  - src/view/tide-hud.ts
  - src/ui/TideHudComponent.tsx
parent_task_id: TASK-1
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace getStateText/updateState with getSelectedInfo/updateSelection across TerrainEditor, PlanningPhase (PlanningHud interface), classic Hud + HudComponent, and TideHud + TideHudComponent. All files must change together to compile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TerrainEditor.getStateText removed; getSelectedInfo(): CellInfo | null added
- [ ] #2 PlanningHud interface uses updateSelection(info) instead of updateState(text)
- [ ] #3 Classic Hud and HudComponent render CellInfoPanel in the right panel during planning
- [ ] #4 TideHud and TideHudComponent render CellInfoPanel beneath the countdown
- [ ] #5 terrain-editor.test.ts updated: getStateText tests replaced with getSelectedInfo tests
- [ ] #6 node --run static-check passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
