---
id: TASK-001.04
title: 'Docs: document cell info panel'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-16 18:08'
updated_date: '2026-06-16 18:49'
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
- [x] #1 AGENTS.md UI layer section mentions CellInfoPanel.tsx and the right-panel selected-cell stats
- [x] #2 docs/gameplay.md planning-phase description mentions the cell info panel
- [x] #3 node --run static-check passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated AGENTS.md UI layer section to list CellInfoPanel.tsx, HudComponent.tsx, and TideHudComponent.tsx with descriptions of their right-panel selected-cell stats behavior. Updated docs/gameplay.md planning-phase section to describe the cell info panel showing terrain type, elevation, HP, etc. in the top-right corner. node --run static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
