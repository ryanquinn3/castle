---
id: TASK-013.03
title: Tower level badge subactor
status: Done
assignee:
  - '@claude'
created_date: '2026-06-19 12:03'
updated_date: '2026-06-19 13:18'
labels: []
dependencies:
  - TASK-013.01
references:
  - src/view/health-bar.ts
  - src/model/terrain/tower.ts
  - src/view/tower-level-badge.ts
parent_task_id: TASK-013
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Render the level number on upgraded towers. Depends on 013.01 (Tower has a level).

New file src/view/tower-level-badge.ts: a child Actor following the HealthBar pattern (src/view/health-bar.ts). It takes the tower level and renders an Excalibur Text graphic of the number. Use ex.Text with ex.Font (small px size that fits within a 16px TILE_SIZE, e.g. ~7px, family monospace/sans-serif, white color, a black shadow offset (1,1) for contrast so it reads over the tower sprite). Anchor the graphic to the tile bottom-right: graphics.anchor = vec(1,1) and position the actor at the parent tile's bottom-right inset corner (pos = vec(width/2 - inset, height/2 - inset)). z above terrain (reuse/define a small badge z constant near HEALTH_BAR_Z). Level is fixed per Tower instance, so set the text once in onInitialize - no per-frame update needed.

tower.ts: override onInitialize to call super.onInitialize() (preserves the HealthBar child added by Terrain) and addChild(new TowerLevelBadge(this.level)) only when this.level >= 2.

config.ts: add the badge font size / inset / z constants used above (keep them grouped with the health-bar display constants).

Tests: a browser test (src/view/tower-level-badge.browser.test.ts or alongside terrain-render.browser.test.ts) using the shared excalibur-browser-test fixture: a placed L2/L3 tower has a TowerLevelBadge child whose text is the level string; an L1 tower has none. Optionally capture a screenshot via page.screenshot() for visual confirmation.

Docs: docs/gameplay.md tower section - note that L2/L3 towers show a small level-number badge in the bottom-right corner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/view/tower-level-badge.ts renders the level number as bottom-right text following the HealthBar child-actor pattern
- [x] #2 Tower.onInitialize adds the badge only for level >= 2 and still adds the HealthBar via super.onInitialize()
- [x] #3 Browser test verifies L2/L3 towers carry a badge child with the correct level text and L1 does not
- [x] #4 docs/gameplay.md tower section mentions the level badge
- [x] #5 Atomic git commit for this task's scoped change
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created src/view/tower-level-badge.ts (child Actor pattern matching HealthBar). Added badge constants to config.ts (TOWER_BADGE_FONT_SIZE=7, TOWER_BADGE_INSET=1, TOWER_BADGE_Z=9). Updated Tower.onInitialize to call super and add TowerLevelBadge child for level >= 2. Added browser tests verifying L2/L3 towers carry a badge with correct text and L1 has none. Updated docs/gameplay.md tower section. node --run static-check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
