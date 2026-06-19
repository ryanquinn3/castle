---
id: TASK-011
title: Context-aware action bar replacing fixed tool palette
status: Done
assignee: []
created_date: '2026-06-19 10:20'
updated_date: '2026-06-19 10:36'
labels:
  - ui
  - gameplay
dependencies: []
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the fixed 6-slot tool palette (mostly disabled at any moment) with a contextual action bar that shows only the semantic verbs valid for the selected cell. Verbs: Dig, Build Wall, Build Tower, Upgrade, Destroy. Build Wall always builds L1 (flat only); Upgrade steps L->L+1 and is hidden at L4. Letter hotkeys S/W/T/U/X (global debug D untouched). Destroy is a visible button that keeps the existing confirmation dialog and the Delete/Backspace accelerator. No selection shows a 'Select a cell' prompt under an 'Actions' label. Affordability greys Build Wall/Build Tower/Upgrade when sand is short; Dig and Destroy are always available. Also fixes a latent dead action: holes currently offer a wall action that placeWall rejects. Change is centralized in the shared Toolbar/PlanningPhase/TerrainEditor, so it applies to both Classic and Tide automatically.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Selecting each cell type shows only the correct verbs: flat ground = Dig/Build Wall/Build Tower; hole = Dig; wall L1-L3 = Upgrade/Destroy; wall L4 = Destroy; tower = Destroy
- [ ] #2 Holes no longer offer any wall/build-wall action
- [ ] #3 Affordability greys Build Wall/Build Tower/Upgrade when sand is short; Dig and Destroy are never sand-gated
- [ ] #4 Letter hotkeys S/W/T/U/X trigger the currently shown actions; the global debug D key is unchanged; Destroy still works via Delete/Backspace and opens the confirmation dialog
- [ ] #5 With no cell selected the bar shows a 'Select a cell' prompt and is labelled 'Actions'
- [ ] #6 Both Classic and Tide modes use the new action bar with no per-mode code changes
- [ ] #7 node --run static-check passes (lint, typecheck, unit tests)
- [ ] #8 docs/gameplay.md and AGENTS.md updated to describe the contextual action bar and hotkeys
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Execution order (each leaf ends green: scoped tests + lint + typecheck clean):

1. TASK-011.01 - Additive ActionType model. New src/action-type.ts: ActionType enum (Dig/BuildWall/BuildTower/Upgrade/Destroy), ACTION_META (hotkey letter S/W/T/U/X, label, spriteUrl), and pure resolvers applicableActions(cell) -> ordered ActionType[] (context only, ignores sand) and actionCost({action, cell}) -> number (0 for Dig/Destroy). Unit-test the matrix + costs in src/action-type.test.ts. Old tool-type.ts and all current behavior stay intact, so the repo stays green.

2. TASK-011.02 - Integrated rewire (atomic). Point TerrainEditor, Toolbar, ToolbarComponent, and PlanningPhase at ActionType; delete tool-type.ts. TerrainEditor.applyAction switches on the verb (Dig/BuildWall->L1/BuildTower/Upgrade->level+1/Destroy->shared confirm path) and pushes ordered ActionView[] (with per-action disabled = unaffordable) to the toolbar, or null when nothing is selected. Toolbar gains setActions()/onActionTriggered; ToolbarComponent renders a dynamic 1..N button list, the 'Actions' label, the 'Select a cell' prompt, and case-insensitive letter hotkeys. TerrainEdit.tool becomes .action; PlanningPhase scoop budget checks ActionType.Dig. Retarget terrain-editor.test.ts and add a small toolbar.test.ts for empty-state/label/disabled rendering.

3. TASK-011.03 - Docs sweep. Update docs/gameplay.md (planning actions + hotkeys) and AGENTS.md (toolbar/terrain-editor/tool-type descriptions).

Key file areas: src/action-type.ts (new, replaces src/tool-type.ts), src/view/terrain-editor.ts, src/view/toolbar.ts, src/ui/ToolbarComponent.tsx, src/view/planning-phase.ts, tests co-located. Blast radius confirmed: sessions only construct Toolbar/PlanningPhase and need no changes. Destroy reuses the existing DeleteConfirmation flow; sword.png is the Destroy icon (no new art). Dependencies: .02 depends on .01; .03 depends on .02.
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
