---
id: TASK-001.04
title: 'Docs: update AGENTS.md and gameplay.md for cell info panel'
status: To Do
assignee: []
created_date: '2026-06-16 17:55'
labels: []
dependencies: []
parent_task_id: TASK-1
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update `AGENTS.md` and `docs/gameplay.md` to reflect the new cell info panel. Mention `CellInfoPanel.tsx` in the core files list and add a sentence in the gameplay doc about planning-phase cell selection showing stats.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `AGENTS.md` mentions `CellInfoPanel.tsx` in the UI layer and notes the right HUD panel shows selected-cell stats,`docs/gameplay.md` mentions that selecting a cell shows its stats in the top-right panel,`node --run static-check` passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 node --run static-check passes
<!-- DOD:END -->
