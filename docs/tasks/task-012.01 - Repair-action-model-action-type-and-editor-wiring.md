---
id: TASK-012.01
title: 'Repair action: model, action-type, and editor wiring'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-19 11:09'
updated_date: '2026-06-19 11:23'
labels: []
dependencies: []
references:
  - src/action-type.ts
  - src/action-type.test.ts
  - src/model/terrain/wall.ts
  - src/model/terrain/tower.ts
  - src/view/terrain-editor.ts
  - src/view/terrain-editor.test.ts
parent_task_id: TASK-012
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the Repair action end-to-end: Repairable cost seam on Wall/Tower, ActionType.Repair + meta, damaged-only availability and Upgrade->Repair->Destroy ordering in applicableActions, actionCost, and the TerrainEditor dispatch branch that heals to max HP. Use TDD: extend src/action-type.test.ts and src/view/terrain-editor.test.ts first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ActionType.Repair exists with ACTION_META hotkey 'R' and label 'Repair'
- [x] #2 Repairable interface defined; Wall.repairCost = WALL_LEVEL_COST[level-1], Tower.repairCost = TOWER_COST
- [x] #3 applicableActions inserts Repair before Destroy only when the cell's HealthComponent.current < max; full-HP walls/towers are unchanged
- [x] #4 actionCost returns the cell's repairCost for Repair
- [x] #5 TerrainEditor.applyAction Repair branch spends the cost, sets HealthComponent.current = max, plays WallToolSound, and is a no-op when sand < cost
- [x] #6 Unit tests cover Repair meta, damaged-vs-full applicableActions ordering, actionCost, and editor heal/affordability behavior (no config-constant mirroring)
- [x] #7 node --run static-check passes and the change is committed atomically
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DECISION: repairCost lives on a plain Repairable interface implemented by Wall/Tower, NOT on HealthComponent and NOT as an ECS component. Rationale: repair cost is invariant to current HP (tied to tier/rebuild value), so it's a structure property, not a health-state property. Availability still keys off HealthComponent (current < max). Open door: if we later want fully data-driven Repair (zero instanceof in action-type.ts), inject repairCost into HealthComponent at construction (new HealthComponent(maxHp, repairCost)); migration is a single-getter move. User is open to that argument but chose the interface for now.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added ActionType.Repair with hotkey R and label Repair. Defined Repairable interface in action-type.ts; Wall.repairCost = WALL_LEVEL_COST[level-1], Tower.repairCost = TOWER_COST. applicableActions now inserts Repair before Destroy for damaged Wall/Tower (current < max via HealthComponent ECS get). actionCost handles Repair via unknown-cast to Repairable. TerrainEditor.applyAction Repair branch spends cost, sets health.current = health.max, plays WallToolSound. Tests: 10 new unit tests covering meta, repairCost, damaged vs full-HP applicableActions, actionCost, editor heal, and affordability. node --run static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->
