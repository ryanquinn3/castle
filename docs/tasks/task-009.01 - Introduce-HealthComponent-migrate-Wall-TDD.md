---
id: TASK-009.01
title: Introduce HealthComponent; migrate Wall (TDD)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-18 11:33'
updated_date: '2026-06-18 11:41'
labels: []
dependencies: []
references:
  - src/model/terrain/health-component.ts
  - src/model/terrain/wall.ts
  - src/config.ts
parent_task_id: TASK-009
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the HealthComponent durability primitive and migrate Wall onto it in a behavior-preserving way. HealthComponent is an Excalibur Component with current (mutable), max (readonly), and a fraction getter. Wall stores its HP in the component; Wall.hp becomes a read-only getter delegating to component.current; constructor seeds the component from WALL_LEVEL_HP[level-1]; applyHits decrements the component and sets level=0 (returning {newElevation:0}) when it reaches 0; serialize/describe read from the component. Wall's public surface is unchanged so existing wall.test.ts passes untouched. TDD: write health-component.test.ts first. Phase 2 fields (isDamaged / threshold) are deliberately omitted.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/model/terrain/health-component.ts exports HealthComponent extending Excalibur Component with current (mutable number), max (readonly number), and get fraction() returning current/max clamped to 0..1
- [x] #2 health-component.test.ts asserts fraction at full (1), half (0.5), and zero (0) plus clamping for current>max and current<0
- [x] #3 Wall holds durability in a HealthComponent (added in constructor with max=WALL_LEVEL_HP[level-1]); Wall.hp is a read-only getter delegating to component.current with no separate hp state field
- [x] #4 Wall.applyHits decrements component.current and, at <=0, sets level=0 and returns {newElevation:0}; otherwise returns null
- [x] #5 All existing wall.test.ts assertions pass unchanged (hp init, damage decrement, destruction at 0, serialize includes hp, describe HP stat)
- [x] #6 AGENTS.md model-layer core-files list includes health-component.ts
- [x] #7 node --run static-check passes
- [x] #8 Change committed atomically on feat/healthcomponent-refactor
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created HealthComponent (Excalibur Component, current/max/fraction with 0..1 clamp). Wrote health-component.test.ts first (7 assertions). Migrated Wall to hold a private HealthComponent instance; Wall.hp is now a read-only getter delegating to component.current; applyHits decrements component.current directly. All 213 unit tests pass, static-check clean. Committed atomically on feat/healthcomponent-refactor.
<!-- SECTION:FINAL_SUMMARY:END -->
