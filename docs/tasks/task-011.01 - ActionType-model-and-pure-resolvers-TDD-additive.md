---
id: TASK-011.01
title: 'ActionType model and pure resolvers (TDD, additive)'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-19 10:20'
updated_date: '2026-06-19 10:24'
labels:
  - ui
  - gameplay
dependencies: []
parent_task_id: TASK-11
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a new src/action-type.ts module defining the semantic action vocabulary and pure context/cost resolvers, with unit tests. Purely additive: src/tool-type.ts and all existing wiring remain untouched this task, so the repo stays green. ActionType enum: Dig, BuildWall, BuildTower, Upgrade, Destroy. ACTION_META: Record<ActionType,{hotkey,label,spriteUrl}> with hotkeys Dig=S, BuildWall=W, BuildTower=T, Upgrade=U, Destroy=X; sprites shovel-sprite.png (Dig), wall-tool-sprite.png (BuildWall, Upgrade), tower-sprite.png (BuildTower), sword.png (Destroy). applicableActions(cell: Terrain): ActionType[] returns ordered, context-only verbs (ignores sand): FlatGround=[Dig,BuildWall,BuildTower]; Hole=[Dig]; Wall with level<MAX_WALL_LEVEL=[Upgrade,Destroy]; Wall at MAX_WALL_LEVEL=[Destroy]; Tower=[Destroy]. actionCost({action,cell}): number returns Dig=0, Destroy=0, BuildWall=WALL_LEVEL_COST[0], BuildTower=TOWER_COST, Upgrade=WALL_LEVEL_COST[cell.level] (cost of the next level). Co-locate tests in src/action-type.test.ts (unit project; pure logic). Use terrain types as inputs and assert observable outputs, not config constants directly (per docs/testing.md: drive with constants as inputs, assert behavior).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/action-type.ts exports ActionType enum, ACTION_META, applicableActions(cell), and actionCost({action,cell})
- [x] #2 applicableActions returns the correct ordered verbs per cell type (flat/hole/wall<max/wall=max/tower) and is independent of sand
- [x] #3 actionCost returns 0 for Dig and Destroy, WALL_LEVEL_COST[0] for BuildWall, TOWER_COST for BuildTower, and the next-level cost for Upgrade
- [x] #4 src/action-type.test.ts covers the full applicableActions matrix and actionCost cases and passes under node --run test:unit
- [x] #5 node --run static-check passes; src/tool-type.ts and existing behavior are unchanged by this task
- [x] #6 Committed atomically as a single scoped commit
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added src/action-type.ts with ActionType enum (Dig, BuildWall, BuildTower, Upgrade, Destroy), ACTION_META record with hotkeys/labels/spriteUrls, applicableActions(cell) returning context-valid actions per terrain type, and actionCost({action,cell}) returning sand costs. Added src/action-type.test.ts covering the full applicableActions matrix for all terrain types and all actionCost cases. Purely additive: src/tool-type.ts and all existing files unchanged. node --run static-check passes (tsc, lint, unit_test, knip, browser_test all green).
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
