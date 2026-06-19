---
id: TASK-011.04
title: Text pill buttons replacing icon toolbar
status: Done
assignee:
  - '@claude'
created_date: '2026-06-19 10:44'
updated_date: '2026-06-19 10:49'
labels:
  - ui
dependencies: []
parent_task_id: TASK-11
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace icon-based 48x48 sprite buttons in the contextual action bar with compact text pill buttons. Each pill shows [hotkey] Label and inline sand cost (colored green for earn, red for spend). Remove spriteUrl from ActionMeta and ActionView. Delete ToolCostBadge component. Update toolbar.css from square slots to horizontal pills.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Buttons render as text pills: [S] Dig +1, [W] Wall -5, etc.
- [x] #2 Sand cost is inline colored text (green=earn, red=spend), not a separate badge
- [x] #3 spriteUrl removed from ActionMeta in action-type.ts and ActionView in toolbar.ts
- [x] #4 ToolCostBadge.tsx and tool-cost-badge.css deleted
- [x] #5 Hotkeys, disabled states, and action resolution unchanged
- [x] #6 node --run static-check passes
- [x] #7 AGENTS.md updated if toolbar description changed
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced 48x48 icon-based action buttons with compact text pill buttons. Removed spriteUrl from ActionMeta (action-type.ts) and ActionView (toolbar.ts). Deleted ToolCostBadge.tsx and tool-cost-badge.css. Rewrote ToolbarComponent.tsx to render pills with [hotkey] Label and inline colored cost (green earn, red spend). Updated toolbar.css from square slot styles to horizontal pill styles. Removed spriteUrl construction from terrain-editor.ts buildActionViews. Updated sprite URL test in action-type.test.ts to test labels instead. Removed spriteUrl from toolbar.test.ts fixtures. Updated AGENTS.md toolbar descriptions. node --run static-check passes (tsc, lint, unit_test, knip, browser_test all ok).
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
