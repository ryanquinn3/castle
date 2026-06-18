---
id: TASK-009.02
title: Tower HP behavior fix + grid hitCount cleanup + docs (TDD)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-18 11:33'
updated_date: '2026-06-18 11:45'
labels: []
dependencies:
  - TASK-009.01
references:
  - src/model/terrain/tower.ts
  - src/config.ts
  - src/model/grid-model.ts
  - docs/gameplay.md
parent_task_id: TASK-009
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate Tower onto HealthComponent and fix the unintended gradual height-shrink so towers behave like walls: fixed height while alive, destroyed only when HP reaches 0. Add TOWER_HP=150 (preserves today's total hits-to-destroy = 15x10) and remove the now-unused TOWER_HITS_PER_EROSION. Tower stores fixedHeight=min(height,MAX_ELEVATION); elevation getter returns fixedHeight while current>0 else 0; applyHits decrements the component and returns destruction only at <=0; towerHeight and hitCount fields and the stepping loop are removed; resetHits becomes a no-op (HP persists across levels like walls); serialize becomes {type:'tower',height,hp}; describe shows Height and HP. GridModel cleanup: getHitCount and resetHitCounts operate on Hole only; remove dead incrementHitCount. Rewrite tower.test.ts for HP-based destruction and adjust any grid-model browser tests touching tower hitCount. Update docs in the same change. Depends on 009.01 (HealthComponent).
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 config.ts defines TOWER_HP=150 and TOWER_HITS_PER_EROSION is removed with no remaining references in src/
- [x] #2 Tower holds durability in a HealthComponent (max=TOWER_HP); towerHeight and hitCount fields and the height-stepping loop are removed
- [x] #3 Tower.elevation equals fixedHeight=min(height,MAX_ELEVATION) while HP>0 and becomes 0 only when HP reaches 0 (no gradual shrink); applyHits returns {newElevation:0} only on destruction, else null
- [x] #4 Tower.resetHits is a no-op so tower HP persists across Classic levels; Tower.serialize returns {type:'tower',height,hp} and describe shows Height and HP
- [x] #5 GridModel.incrementHitCount is removed; getHitCount and resetHitCounts operate on Hole only; holes are unchanged
- [x] #6 tower.test.ts is rewritten to assert HP-based destruction at TOWER_HP, fixed height while alive, no height-stepping, and serialize includes hp; all terrain and grid-model tests pass
- [x] #7 docs/gameplay.md tower mechanic, AGENTS.md gameplay-overview line, and AGENTS.md debug-serialization section reflect tower fixed-height HP behavior
- [x] #8 node --run static-check passes
- [x] #9 Change committed atomically on feat/healthcomponent-refactor
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Migrated Tower onto HealthComponent with TOWER_HP=150; removed gradual height-step erosion in favor of all-or-nothing destruction (elevation holds until HP=0, then drops to 0); removed TOWER_HITS_PER_EROSION from config; removed GridModel.incrementHitCount and restricted getHitCount/resetHitCounts to Hole only; rewrote tower.test.ts for HP-based behavior; updated wave-event-applier.test.ts to remove incrementHitCount call; updated docs/gameplay.md and AGENTS.md to reflect tower fixed-height HP model and new serialize format. node --run static-check passes (tsc, lint, unit, knip, browser).
<!-- SECTION:FINAL_SUMMARY:END -->
