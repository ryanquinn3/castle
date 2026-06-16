---
id: TASK-001
title: Cell info panel
status: Done
assignee: []
created_date: '2026-06-16 18:07'
updated_date: '2026-06-16 18:52'
labels:
  - feature
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Show information about the selected cell (type, height, wall HP, hole water, tower wear) in the top-right HUD panel during planning, in both Classic and Tide modes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Selecting a cell during planning shows its info in the top-right panel in both Classic and Tide modes
- [ ] #2 Each terrain type owns its own describe() output; the view assumes no fixed field set
- [ ] #3 The old action-verb hint and transient status strings are removed
- [ ] #4 node --run static-check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Architecture: Each terrain gains a describe(): CellInfo method returning { title, stats[] }. TerrainEditor.getSelectedInfo() returns the selected cell's CellInfo (or null). The shared PlanningHud interface carries it via updateSelection(); both Hud/TideHud render it through a shared CellInfoPanel.tsx.

Execution order (each task becomes a subtask):
1. CellInfo data model + describe() on every terrain (model layer; must be done first — typecheck requires all four implementations together)
2. Shared CellInfoPanel React component (standalone component + CSS; no wiring yet)
3. Wire selection info through TerrainEditor, PlanningPhase, Hud, TideHud, and both React components (cascade; all files change together to compile)
4. Docs (AGENTS.md + docs/gameplay.md)

Key files:
- src/model/terrain/terrain.ts, flat-ground.ts, hole.ts, wall.ts, tower.ts, utils.ts
- src/ui/CellInfoPanel.tsx, hud.css
- src/view/terrain-editor.ts, planning-phase.ts
- src/view/hud.ts, src/ui/HudComponent.tsx
- src/view/tide-hud.ts, src/ui/TideHudComponent.tsx
- AGENTS.md, docs/gameplay.md

Verification: node --run static-check must pass after each subtask.
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
