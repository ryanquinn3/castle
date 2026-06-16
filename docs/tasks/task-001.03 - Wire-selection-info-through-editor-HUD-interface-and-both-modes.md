---
id: TASK-001.03
title: 'Wire selection info through editor, HUD interface, and both modes'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-16 18:08'
updated_date: '2026-06-16 18:43'
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
- [x] #1 TerrainEditor.getStateText removed; getSelectedInfo(): CellInfo | null added
- [x] #2 PlanningHud interface uses updateSelection(info) instead of updateState(text)
- [x] #3 Classic Hud and HudComponent render CellInfoPanel in the right panel during planning
- [x] #4 TideHud and TideHudComponent render CellInfoPanel beneath the countdown
- [x] #5 terrain-editor.test.ts updated: getStateText tests replaced with getSelectedInfo tests
- [x] #6 node --run static-check passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wired CellInfo through the editor, HUD interface, and both game modes.

Changes:
- TerrainEditor: removed getStateText(), added getSelectedInfo(): CellInfo | null that delegates to cell.describe()
- PlanningHud interface: replaced updateState(text) with updateSelection(info: CellInfo | null)
- Hud (classic): stores CellInfo | null instead of stateText string; passes selectedInfo to HudComponent
- HudComponent: renders CellInfoPanel in the right panel during planning instead of a text div
- TideHud: replaced stateText field and updateState() with selectedInfo field and updateSelection(); passes to TideHudComponent
- TideHudComponent: renders CellInfoPanel beneath the countdown timer
- terrain-editor.test.ts: replaced four getStateText tests with four getSelectedInfo tests asserting CellInfo shape and title

Tests: node --run static-check passes (tsc, lint, unit_test, knip, browser_test all ok)
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
