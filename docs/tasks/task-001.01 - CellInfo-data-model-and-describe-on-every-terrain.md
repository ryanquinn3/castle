---
id: TASK-001.01
title: CellInfo data model and describe() on every terrain
status: To Do
assignee: []
created_date: '2026-06-16 18:08'
labels:
  - feature
dependencies: []
modified_files:
  - src/model/terrain/terrain.ts
  - src/model/terrain/utils.ts
  - src/model/terrain/flat-ground.ts
  - src/model/terrain/hole.ts
  - src/model/terrain/wall.ts
  - src/model/terrain/tower.ts
parent_task_id: TASK-1
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add CellInfo/CellStat types and abstract describe() to the Terrain base class, implement describe() on all four terrain types (FlatGround, Hole, Wall, Tower), and add the fmtNum helper to utils.ts. All four implementations must land together or typecheck breaks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CellInfo and CellStat types exported from terrain.ts
- [ ] #2 describe() abstract method on Terrain base class
- [ ] #3 fmtNum helper added to utils.ts
- [ ] #4 FlatGround, Hole, Wall, Tower each implement describe() with correct title and stats
- [ ] #5 Unit tests pass for all four describe() implementations
- [ ] #6 node --run static-check passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
