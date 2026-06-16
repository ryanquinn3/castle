---
id: TASK-001.01
title: CellInfo data model and describe() on every terrain
status: To Do
assignee: []
created_date: '2026-06-16 17:54'
labels: []
dependencies: []
parent_task_id: TASK-1
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add `CellInfo`/`CellStat` types and an abstract `describe()` method to `Terrain`, implement it in all four terrain types (`FlatGround`, `Hole`, `Wall`, `Tower`), add a `fmtNum` utility to `utils.ts`, and write unit tests for each implementation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `CellInfo` and `CellStat` interfaces are exported from `terrain.ts`,All four terrain types implement `describe()` returning correct title and stats,Unit tests for all four terrain `describe()` implementations pass,`node --run static-check` passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 node --run static-check passes
<!-- DOD:END -->
