---
id: TASK-001
title: Cell info panel
status: To Do
assignee: []
created_date: '2026-06-16 18:07'
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

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
