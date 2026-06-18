---
id: TASK-009
title: HP durability via HealthComponent (Phase 1 refactor)
status: Done
assignee: []
created_date: '2026-06-18 11:33'
updated_date: '2026-06-18 11:45'
labels:
  - refactor
dependencies: []
references:
  - src/model/terrain/wall.ts
  - src/model/terrain/tower.ts
  - src/model/grid-model.ts
  - src/config.ts
documentation:
  - docs/plans/2026-06-18-health-component-and-healthbar.md
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In-place refactor introducing an Excalibur HealthComponent as the single source of truth for structure durability. Wall and Tower migrate onto it. Fixes the unintended tower behavior: towers should act like walls (fixed height + HP, destroyed when HP hits 0) rather than gradually shrinking in height. Holes keep their existing depth/hitCount erosion and get no HealthComponent. Phase 2 (HealthBarSystem damage-bar UI) is explicitly OUT of scope and tracked separately. Design reference: docs/plans/2026-06-18-health-component-and-healthbar.md (Phase 1 section). Verification: node --run static-check.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
- [ ] #2 node --run static-check passes
- [ ] #3 Every leaf subtask ends independently green and is committed atomically
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 HealthComponent (Excalibur Component) is the single source of truth for Wall and Tower durability: current (mutable), max (readonly), fraction getter; no standalone Wall.hp / Tower.towerHeight / Tower.hitCount state fields remain (Wall.hp is a delegating getter)
- [ ] #2 Towers have fixed height (TOWER_HEIGHT) while alive and are destroyed only when HP reaches 0 (no gradual height shrink); TOWER_HP=150 preserves total hits-to-destroy; TOWER_HITS_PER_EROSION removed
- [ ] #3 Tower HP persists across Classic levels (resetHits is a no-op for towers, matching walls)
- [ ] #4 Holes retain existing depth/hitCount erosion with no behavior change and no HealthComponent
- [ ] #5 Dead code removed: GridModel.incrementHitCount gone; getHitCount and resetHitCounts operate on Hole only
- [ ] #6 Phase 2 (HealthBarSystem / healthbar UI) is NOT included in this task
- [ ] #7 docs/gameplay.md and AGENTS.md (gameplay overview, core-files list, debug serialization) reflect the new tower HP behavior
- [ ] #8 node --run static-check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Execution order: 009.01 (HealthComponent + low-risk Wall migration) then 009.02 (tower behavior fix + grid cleanup + docs). 009.02 depends on 009.01 because Tower reuses the HealthComponent landed in 009.01.

Slice rationale: Wall migration is behavior-preserving (hp becomes a delegating getter), so it lands the component in real production use with all existing wall tests green. Tower is the riskier slice (a real behavior change removing height-stepping) and is isolated so its rewritten tests and docs land atomically alongside the code.

009.01 - Introduce HealthComponent; migrate Wall (TDD):
- New src/model/terrain/health-component.ts: Excalibur Component { current (mutable), max (readonly), get fraction() = clamp(current/max,0,1) }. Co-located unit test health-component.test.ts (fraction at full/half/zero, clamping, max readonly).
- Wall: constructor addComponent(new HealthComponent(WALL_LEVEL_HP[level-1], WALL_LEVEL_HP[level-1])); get hp() delegates to component.current; applyHits decrements component.current and sets level=0 returning {newElevation:0} at <=0; serialize/describe read component.current. Public API unchanged so existing wall.test.ts stays green.
- AGENTS.md: add health-component.ts to the model-layer core-files list.

009.02 - Tower HP behavior fix + grid hitCount cleanup + docs (TDD):
- config.ts: add TOWER_HP=150; remove TOWER_HITS_PER_EROSION.
- Tower: store fixedHeight=min(height,MAX_ELEVATION); addComponent(new HealthComponent(TOWER_HP,TOWER_HP)); get elevation() = current>0 ? fixedHeight : 0; applyHits decrements component, returns {newElevation:0} only at <=0; remove towerHeight & hitCount fields and the stepping loop; resetHits no-op; serialize {type:'tower',height,hp}; describe shows Height + HP.
- grid-model.ts: getHitCount/resetHitCounts become Hole-only; remove dead incrementHitCount.
- Tests: rewrite tower.test.ts for HP-based destruction (drop height-stepping/hitCount/resetHits-clears-count cases; add HP destruction at TOWER_HP, fixed-height-while-alive, serialize-includes-hp); adjust grid-model browser tests touching tower hitCount.
- Docs (same change): docs/gameplay.md tower mechanic; AGENTS.md gameplay-overview line (Towers erode after 10 hits...) and debug-serialization section (tower now serializes hp).

Key files: src/model/terrain/health-component.ts (new), src/model/terrain/wall.ts, src/model/terrain/tower.ts, src/config.ts, src/model/grid-model.ts, src/model/terrain/wall.test.ts, src/model/terrain/tower.test.ts, src/model/grid-model.browser.test.ts, src/model/grid-model-erosion.browser.test.ts, AGENTS.md, docs/gameplay.md.

Risks: (1) knip flagging temporarily-unused exports - avoid by landing each constant/component with its consumer in the same subtask; (2) tower serialize shape change breaks its serialize test - rewritten in the same subtask; (3) erosion-flash now fires for towers only on destruction (matches walls) - confirmed acceptable in design.

Branch: feat/healthcomponent-refactor. Verification each leaf: node --run static-check green before the next subtask starts.
<!-- SECTION:PLAN:END -->
