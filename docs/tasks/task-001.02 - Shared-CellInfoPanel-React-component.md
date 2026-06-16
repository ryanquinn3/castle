---
id: TASK-001.02
title: Shared CellInfoPanel React component
status: Done
assignee:
  - '@claude'
created_date: '2026-06-16 18:08'
updated_date: '2026-06-16 18:37'
labels:
  - feature
dependencies:
  - TASK-001.01
modified_files:
  - src/ui/CellInfoPanel.tsx
  - src/ui/hud.css
parent_task_id: TASK-1
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the standalone CellInfoPanel.tsx component and add its styles to hud.css. Not wired to any HUD yet — that is Task 3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CellInfoPanel.tsx renders null state (Select a cell) when info is null
- [x] #2 CellInfoPanel.tsx renders title and stat rows when info is provided
- [x] #3 CSS classes added to hud.css for cell-info, cell-info__title, cell-info__stat, cell-info__stat-label, cell-info__stat-value
- [x] #4 node --run static-check passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created src/ui/CellInfoPanel.tsx with null state (Select a cell) and info rendering (title + stat rows). Added CSS classes cell-info, cell-info__title, cell-info__stat, cell-info__stat-label, cell-info__stat-value to hud.css. Added CellInfoPanel.tsx to knip ignore list since it is intentionally unwired until TASK-001.03. node --run static-check passes (tsc, lint, unit_test, knip, browser_test all ok).
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
