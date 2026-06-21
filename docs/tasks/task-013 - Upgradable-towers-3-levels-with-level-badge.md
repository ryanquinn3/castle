---
id: TASK-013
title: Upgradable towers (3 levels) with level badge
status: Done
assignee: []
created_date: '2026-06-19 12:02'
updated_date: '2026-06-19 13:18'
labels:
  - gameplay
dependencies: []
references:
  - src/model/terrain/tower.ts
  - src/config.ts
  - src/action-type.ts
  - src/view/terrain-editor.ts
  - src/model/grid-model.ts
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make towers upgradable L1->L2->L3 via the Upgrade action, mirroring the wall upgrade model. Each level raises blocking height and max HP: L1 15/150, L2 17/200, L3 20/250. Upgrade costs 15 (L1->L2) then 20 (L2->L3); build cost stays 15. Upgrade creates a fresh tower at the new level's full HP and is available on full-HP or damaged L1/L2 towers; L3 is terminal. Upgraded towers (L2/L3) render a small text level-number badge in the tile's bottom-right corner following the HealthBar child-actor pattern; L1 shows no badge. No new sprites. HP and height persist across Classic levels exactly as today.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Towers upgrade L1->L2->L3 via the Upgrade action at costs 15 then 20; L3 offers no Upgrade
- [ ] #2 Per-level height/HP applied (L1 15/150, L2 17/200, L3 20/250); height drives wave blocking and elevation returns the per-level height while HP > 0
- [ ] #3 Upgrade yields a fresh tower at the new level's full HP and is offered on full or damaged L1/L2 towers; Repair cost equals the current tier cost
- [ ] #4 L2 and L3 towers display a level-number badge in the tile bottom-right; L1 displays none
- [ ] #5 Tower.serialize() includes level; docs/gameplay.md and AGENTS.md updated to match
- [ ] #6 node --run static-check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Technical overview: Towers become level-based actors mirroring the existing Wall(level) model so the change rides established patterns (per-level arrays in config, level-validating placement in GridModel, an Upgrade branch in the editor, and a HealthBar-style child actor for the visual). Each level raises blocking height and max HP; the level is fixed per Tower instance because Upgrade swaps in a fresh actor via setCell, exactly as walls do. No new sprites - upgraded towers are distinguished by a small text badge.

Files touched: src/config.ts (level arrays + MAX_TOWER_LEVEL, badge display constants), src/model/terrain/tower.ts (level-based ctor, per-level height/HP, repairCost, serialize+describe, onInitialize badge), src/model/grid-model.ts (placeTower level param + validation), src/action-type.ts (applicableActions + actionCost for towers), src/view/terrain-editor.ts (Upgrade branch dispatch tower vs wall), new src/view/tower-level-badge.ts, plus docs/gameplay.md and AGENTS.md.

Testing strategy: unit tests for pure model/config/resolver logic (tower.test.ts, action-type.test.ts, terrain-editor.test.ts) per the unit-vs-browser rule; GridModel needs a Scene so placeTower validation is covered in grid-model.browser.test.ts; the badge renders so it gets a browser test on the shared excalibur fixture. Constants are used only as inputs - no test asserts a bare config-constant equality (testing.md tuning-knob rule). Each task ends green and runs node --run static-check.

Execution order:
1. TASK-013.01 - level-based Tower model + config arrays + placeTower(level) + mechanical TOWER_COST->TOWER_LEVEL_COST[0] reference updates + constants/serialization docs. No player-facing change yet; leaves repo green.
2. TASK-013.02 - wire the Upgrade action (action-type applicableActions/actionCost + editor dispatch) + gameplay action-matrix/upgrade/mermaid docs + AGENTS note. Depends on 013.01.
3. TASK-013.03 - tower-level-badge child actor + Tower.onInitialize hook + browser test + gameplay badge note. Depends on 013.01; independent of 013.02 (can run in parallel after 013.01).

Branch: feat/upgradable-towers. Every leaf task ends in an atomic commit and an independently green state.
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
