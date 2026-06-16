---
id: TASK-002.03
title: Document blocked-water wall erosion in gameplay.md
status: To Do
assignee: []
created_date: '2026-06-16 19:04'
labels: []
dependencies:
  - TASK-002.02
parent_task_id: TASK-002
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update the gameplay design doc so the new erosion behavior is described alongside the existing wall and erosion text. Players should understand that even a wall tall enough to fully block a wave will be chipped down over time, faster when the dammed-up water is deeper.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/gameplay.md contains a description of blocked-water wall erosion: walls that fully block water still take HP damage proportional to the depth of water pressing against them
- [ ] #2 The doc notes the depth scaling so the design intent is captured (short, shallow puddles barely scratch; deep dammed floods chip quickly)
- [ ] #3 node --run static-check passes
- [ ] #4 Change is committed as a single atomic git commit
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
