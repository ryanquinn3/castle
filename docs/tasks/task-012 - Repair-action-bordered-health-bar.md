---
id: TASK-012
title: Repair action + bordered health bar
status: Done
assignee: []
created_date: '2026-06-19 11:08'
updated_date: '2026-06-19 11:29'
labels:
  - feature
  - gameplay
dependencies: []
references:
  - src/action-type.ts
  - src/view/terrain-editor.ts
  - src/view/health-bar.ts
  - src/model/terrain/wall.ts
  - src/model/terrain/tower.ts
  - src/config.ts
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a Repair action usable on damaged walls/towers that fully restores HP for a flat sand cost equal to what was last paid for the structure's current tier (WALL_LEVEL_COST[level-1] for walls, TOWER_COST for towers). Repair appears in the contextual action bar only when the structure is damaged (HealthComponent.current < max). Separately, give the per-tile health bar a 1px solid-black border/frame that also reads as a track behind the missing-HP portion. Design approved via brainstorming; cost lookup is structured behind a Repairable interface so upcoming tower upgrades only need to change Tower.repairCost.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Repair fully restores a damaged wall/tower to max HP for a flat cost = its current-tier build/upgrade cost
- [ ] #2 Repair only appears in the action bar when the structure is damaged (current < max), ordered Upgrade -> Repair -> Destroy
- [ ] #3 Health bar renders a 1px solid-black border/frame; missing-HP portion reads as a black track
- [ ] #4 docs/gameplay.md and AGENTS.md reflect the new Repair action and bordered health bar
- [ ] #5 node --run static-check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Execution order: Subtask 1 (repair action, model + action-type + editor) and Subtask 2 (bordered health bar) are independent and can land in either order; Subtask 3 (docs) depends on both.

WORK SLICES
1. Repair action end-to-end (src/action-type.ts, src/model/terrain/{wall,tower}.ts, src/view/terrain-editor.ts):
   - Add ActionType.Repair + ACTION_META entry (hotkey 'R', label 'Repair').
   - Define a small Repairable interface { get repairCost(): number } in action-type.ts; implement on Wall (WALL_LEVEL_COST[level-1]) and Tower (TOWER_COST). This is the tower-upgrade seam: when tower tiers land, only Tower.repairCost changes.
   - applicableActions: when a cell has a HealthComponent with current < max, insert Repair before Destroy. Wall(dmg, <max lvl) -> [Upgrade, Repair, Destroy]; Wall(dmg, max) -> [Repair, Destroy]; Tower(dmg) -> [Repair, Destroy]. Full-HP structures are unchanged (no Repair).
   - actionCost: Repair case returns (cell as Repairable).repairCost.
   - TerrainEditor.applyAction: add Repair branch — guard applicable+affordable, removeSand(cost), set HealthComponent.current = max, playSound(WallToolSound), afterEdit({action: Repair, cell, delta: cost}). No grid actor swap (HP-only), so existing afterEdit -> updateToolbar/onStateChanged refreshes the bar + cell info. buildActionViews already renders Repair as a 'spend' effect and disables it when sand < cost via the generic path.

2. Bordered health bar (src/config.ts, src/view/health-bar.ts):
   - Add HEALTH_BAR_BORDER_WIDTH=1 and HEALTH_BAR_BORDER_COLOR='#000000'.
   - In HealthBar.onInitialize build a static frame Rectangle (innerWidth+2*border by HEALTH_BAR_HEIGHT+2*border, solid black) and the existing fill, composed via a GraphicsGroup so the fill Rectangle ref stays mutable; frame offset (-border,-border), fill at (0,0). Frame spans full inner width so missing HP shows as a black track. Toggle group visibility with the existing current>0 && fraction<HEALTH_BAR_THRESHOLD rule.

3. Docs (docs/gameplay.md, AGENTS.md): document Repair action, hotkey, cost, availability, and the bordered health bar; correct the 'only way to restore durability is to upgrade' line.

TESTS
- src/action-type.test.ts (unit): Repair meta; applicableActions ordering for damaged vs full-HP walls/towers; actionCost Repair = current-tier cost (drive with applyHits, assert outcome, do not mirror config constants).
- src/view/terrain-editor.test.ts (unit): Repair on a damaged wall/tower spends cost, restores HP to max, refunds nothing on success; disabled/no-op when sand < cost.
- src/view/health-bar.browser.test.ts (browser, new): damaged actor shows the frame; page.screenshot() for visual check.

VERIFICATION: node --run static-check (unit + browser + lint + typecheck + knip).
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
