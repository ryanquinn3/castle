---
id: TASK-013.01
title: Level-based Tower model + config + grid placement
status: Done
assignee:
  - '@claude'
created_date: '2026-06-19 12:02'
updated_date: '2026-06-19 13:10'
labels: []
dependencies: []
references:
  - src/config.ts
  - src/model/terrain/tower.ts
  - src/model/grid-model.ts
parent_task_id: TASK-013
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Convert Tower from a fixed-stat actor to a level-based one (1-3), mirroring Wall(level). Pure model + config + placement; no new player-facing Upgrade yet (action bar still shows Destroy-only for towers).

config.ts: add TOWER_LEVEL_HEIGHT=[15,17,20], TOWER_LEVEL_HP=[150,200,250], TOWER_LEVEL_COST=[15,15,20], MAX_TOWER_LEVEL=3. Remove the scalars TOWER_HEIGHT, TOWER_HP, TOWER_COST.

tower.ts: constructor takes level (clamped 1..MAX_TOWER_LEVEL, like Wall). Store level. fixedHeight = TOWER_LEVEL_HEIGHT[level-1]; HealthComponent(TOWER_LEVEL_HP[level-1]). repairCost = TOWER_LEVEL_COST[level-1]. serialize adds level: { type:'tower', height, level, hp }. describe adds a Level stat row. elevation getter unchanged (per-level fixedHeight while hp>0).

grid-model.ts: placeTower(col,row,level=1) gains the level param with wall-style validation: level 1 requires FlatGround; level>1 requires existing Tower at level-1. Replace new Tower(TOWER_HEIGHT) with new Tower(level). Drop the TOWER_HEIGHT import.

Mechanical reference updates so the repo compiles green (no behavior change): action-type.ts and terrain-editor.ts BuildTower paths use TOWER_LEVEL_COST[0] instead of TOWER_COST.

Tests: rewrite tower.test.ts to construct via new Tower(level) and assert per-level height/HP/cost/serialize(level)/describe; update action-type.test.ts and terrain-editor.test.ts references from TOWER_COST to TOWER_LEVEL_COST[0]; add placeTower level-validation cases to src/model/grid-model.browser.test.ts (L1 only on flat, L2 only on existing L1, etc). Drive behavior with the constants as inputs - do not assert a value merely equals a config constant.

Docs: update the Configurable Constants table in docs/gameplay.md (replace TOWER_HEIGHT/TOWER_COST rows with the new arrays + MAX_TOWER_LEVEL); update the AGENTS.md Debug Serialization tower example to include level.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 config.ts exports TOWER_LEVEL_HEIGHT/HP/COST and MAX_TOWER_LEVEL; scalar TOWER_HEIGHT/HP/COST removed
- [x] #2 new Tower(level) yields per-level height and full HP per the arrays; serialize() includes level and describe() shows a Level stat
- [x] #3 GridModel.placeTower validates level (L1 on flat only, L>1 only on a tower at level-1) and returns false otherwise
- [x] #4 tower.test.ts, action-type.test.ts, terrain-editor.test.ts, and grid-model.browser.test.ts updated and green; no test asserts a bare config-constant equality
- [x] #5 docs/gameplay.md constants table and AGENTS.md serialization example updated
- [x] #6 Atomic git commit for this task's scoped change on a feat/ branch
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Converted Tower from fixed-stat to 3-level model. config.ts: added TOWER_LEVEL_HEIGHT=[15,17,20], TOWER_LEVEL_HP=[150,200,250], TOWER_LEVEL_COST=[15,15,20], MAX_TOWER_LEVEL=3; removed scalar TOWER_HEIGHT/HP/COST. tower.ts: constructor takes level 1-3, per-level fixedHeight/HP/repairCost, serialize includes level, describe shows Level stat. grid-model.ts: placeTower(col,row,level=1) with wall-style level validation. action-type.ts and terrain-editor.ts: BuildTower uses TOWER_LEVEL_COST[0]. All tests rewritten/updated; node --run static-check passes. Docs updated in gameplay.md and AGENTS.md.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
