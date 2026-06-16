---
id: TASK-001
title: Cell info panel
status: To Do
assignee: []
created_date: '2026-06-16 17:54'
labels:
  - feature
dependencies: []
documentation:
  - docs/plans/2026-06-15-cell-info-panel.md
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a selected-cell info panel to the top-right HUD during planning in both Classic and Tide modes. Each terrain gains a `describe(): CellInfo` method; `TerrainEditor.getSelectedInfo()` returns the selected cell's info; a shared `CellInfoPanel.tsx` renders it. This replaces the old action-verb hint and transient status strings.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 node --run static-check passes
<!-- DOD:END -->
