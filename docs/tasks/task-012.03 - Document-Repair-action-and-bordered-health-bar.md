---
id: TASK-012.03
title: Document Repair action and bordered health bar
status: Done
assignee:
  - '@claude'
created_date: '2026-06-19 11:09'
updated_date: '2026-06-19 11:29'
labels: []
dependencies:
  - TASK-012.01
  - TASK-012.02
references:
  - docs/gameplay.md
  - AGENTS.md
parent_task_id: TASK-012
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update docs/gameplay.md and AGENTS.md to describe the Repair action (hotkey R, flat cost = current-tier cost, damaged-only availability, Upgrade->Repair->Destroy ordering, full HP restore) and the bordered health bar. Correct the existing gameplay.md line stating upgrading is the only way to restore durability.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/gameplay.md documents Repair (action list, hotkey table, action description, and the wall durability section no longer says upgrade is the only restore path)
- [x] #2 docs/gameplay.md describes the bordered health bar appearance
- [x] #3 AGENTS.md action-type.ts summary and gameplay overview mention Repair
- [x] #4 Change is committed atomically
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated docs/gameplay.md and AGENTS.md to document the Repair action (hotkey R, tier-cost, damaged-only, Upgrade->Repair->Destroy ordering) and the bordered health bar (1px black border/frame acting as a track). Corrected the wall durability section that incorrectly stated upgrade was the only restore path. static-check passed (tsc, lint, unit tests, knip, browser tests).
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
