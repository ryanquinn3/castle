---
id: TASK-001.02
title: Shared CellInfoPanel React component
status: To Do
assignee: []
created_date: '2026-06-16 17:54'
labels: []
dependencies: []
parent_task_id: TASK-1
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create `src/ui/CellInfoPanel.tsx` and add supporting CSS to `src/ui/hud.css`. The component renders a title and stat rows, or a dim 'Select a cell' placeholder when `info` is null.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `CellInfoPanel.tsx` renders title and stats when given a non-null `CellInfo`,Renders a dim placeholder when `info` is null,Styles added to `hud.css` for `.cell-info`, `.cell-info__title`, `.cell-info__stat`, `.cell-info__stat-label`, `.cell-info__stat-value`,`node --run static-check` passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 node --run static-check passes
<!-- DOD:END -->
