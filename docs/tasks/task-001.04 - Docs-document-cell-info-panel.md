---
id: TASK-001.04
title: 'Docs: document cell info panel'
status: To Do
assignee: []
created_date: '2026-06-16 18:08'
labels:
  - docs
dependencies:
  - TASK-001.03
modified_files:
  - AGENTS.md
  - docs/gameplay.md
parent_task_id: TASK-1
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update AGENTS.md (add CellInfoPanel.tsx to View layer core-files list; update HudComponent/TideHudComponent descriptions) and docs/gameplay.md (add sentence about selected-cell stats in the top-right panel).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md UI layer section mentions CellInfoPanel.tsx and the right-panel selected-cell stats
- [ ] #2 docs/gameplay.md planning-phase description mentions the cell info panel
- [ ] #3 node --run static-check passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
