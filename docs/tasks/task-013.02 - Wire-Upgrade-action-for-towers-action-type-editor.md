---
id: TASK-013.02
title: Wire Upgrade action for towers (action-type + editor)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-19 12:03'
updated_date: '2026-06-19 13:15'
labels: []
dependencies:
  - TASK-013.01
references:
  - src/action-type.ts
  - src/view/terrain-editor.ts
parent_task_id: TASK-013
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose the player-facing tower Upgrade, mirroring walls. Depends on 013.01 (level-based Tower + placeTower(level)).

action-type.ts applicableActions(Tower): below MAX_TOWER_LEVEL -> [Upgrade, Destroy] (full HP) or [Upgrade, Repair, Destroy] (damaged); at MAX_TOWER_LEVEL -> [Destroy] (full) or [Repair, Destroy] (damaged). Same structure as the Wall branch (read HealthComponent for damaged).

action-type.ts actionCost(Upgrade): handle Tower in addition to Wall. For a Tower, return TOWER_LEVEL_COST[tower.level] (next level's cost). Wall path unchanged. Update the doc comment.

terrain-editor.ts applyAction Upgrade branch: it currently hard-casts cell to Wall. Branch on terrain type: for a Tower compute nextLevel = tower.level + 1, guard against > MAX_TOWER_LEVEL, removeSand(actionCost), call grid.placeTower(col,row,nextLevel), refund on failure; for a Wall keep the existing placeWall path. Keep playSound + afterEdit identical.

Tests: action-type.test.ts - tower Upgrade applicability for L1/L2 (full + damaged) and L3 terminal; actionCost Upgrade for Tower L1 (15) and L2 (20) driven via the arrays as inputs. terrain-editor.test.ts - upgrading a placed L1 tower spends the cost, swaps to L2 at full HP, emits an Upgrade edit, and is rejected past L3 / when sand is insufficient. Follow existing terrain-editor.test.ts harness patterns.

Docs: docs/gameplay.md - add tower rows to the per-cell action matrix (Tower L1-L2 full: Upgrade, Destroy; damaged: Upgrade, Repair, Destroy; Tower L3 full: Destroy; damaged: Repair, Destroy), extend the Upgrade and tower sections + the mermaid flow to show L1->L2->L3 with heights/HP. AGENTS.md - update the action-type.ts description so Upgrade is noted as applying to towers too.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 applicableActions returns Upgrade for L1/L2 towers (with Repair when damaged) and omits it at L3
- [x] #2 actionCost(Upgrade) returns the next tower level's cost for a Tower and is unchanged for Wall
- [x] #3 terrain-editor Upgrade upgrades a tower one level at full HP, spends the correct sand, refunds on failure, and is capped at L3
- [x] #4 action-type.test.ts and terrain-editor.test.ts cover tower upgrade applicability, cost, and editor flow; behavior asserted, not constant equality
- [x] #5 docs/gameplay.md action matrix/upgrade/tower/mermaid and AGENTS.md action-type note updated
- [x] #6 Atomic git commit for this task's scoped change
<!-- AC:END -->



## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wired tower Upgrade action: applicableActions now returns [Upgrade, Destroy] for L1/L2 towers and [Upgrade, Repair, Destroy] when damaged (L3 terminal shows Destroy/Repair only). actionCost handles Tower Upgrade via TOWER_LEVEL_COST[tower.level]. terrain-editor Upgrade branch branches on Tower vs Wall, calling grid.placeTower(col, row, nextLevel) with sand spend/refund. Updated action-type.test.ts (tower applicability and cost tests) and terrain-editor.test.ts (L1/L2 upgrade flow, L3 cap, insufficient sand, placeTower failure refund). docs/gameplay.md action matrix, Upgrade description, tower section, and mermaid flow updated. AGENTS.md action-type note updated. node --run static-check passes (263 unit tests, lint, typecheck, browser tests).
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
