---
id: TASK-007
title: 'Tide mode: delay first countdown until first terrain edit'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-17 20:29'
updated_date: '2026-06-17 20:48'
labels:
  - feature
dependencies: []
priority: medium
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In tide mode, no wave countdown should start until the player makes their first terrain edit (dig/wall/tower). Before the first edit, the HUD countdown area is empty -- no timer is shown. Once the player edits, scheduleNextWave() fires and the timed cycle begins normally. On game reset, the behavior resets so the first wave is again deferred until an edit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Subsequent wave countdowns start immediately (no pause)
- [x] #2 Game reset restores first-wave-paused behavior
- [x] #3 node --run static-check passes
- [x] #4 Atomic git commit for this change
- [x] #5 No countdown starts on session init -- HUD countdown area is empty until first edit
- [x] #6 First terrain edit (any tool) triggers scheduleNextWave() and starts the timed cycle
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

Two files changed: src/view/planning-phase.ts (add optional onEdit callback) and src/tide-session.ts (defer first countdown).

### Steps

1. **planning-phase.ts** -- Add an optional onEdit callback to PlanningPhase constructor (after onDeleteDialogOpenChange, default no-op). Call it from handleEdit() after the existing logic. This lets sessions observe edits without exposing the internal TerrainEditor.

2. **tide-session.ts** -- Add a private firstActionTaken = false field.

3. **tide-session.ts: onInitialize()** -- Remove the scheduleNextWave() call. The first wave countdown is not created until the player acts.

4. **tide-session.ts: onActivate()** -- In the re-activation path, only call scheduleNextWave() if firstActionTaken is true (the player already started playing before deactivation).

5. **tide-session.ts: startPlanning()** -- Pass an onEdit callback to PlanningPhase: on the first call, set firstActionTaken = true and call scheduleNextWave(). Subsequent calls are no-ops since firstActionTaken is already true.

6. **tide-session.ts: resetRunState()** -- Reset firstActionTaken = false.

7. Run node --run static-check and confirm clean.

8. Commit.

### Key details

- PlanningPhase constructor has two call sites: level-session.ts:220 and tide-session.ts:253. The new param is optional with a default, so level-session.ts needs no change.
- No countdown exists until the first edit, so there is no frozen timer on screen. The HUD countdown area is simply empty until the player acts.
- The W key (triggerWaveNow) calls runWave() directly, bypassing the countdown. If pressed before any edit, the wave fires and firstActionTaken stays false, so still no countdown is scheduled after wave 1. The player must edit to start the timed cycle.
- The onActivate() re-entry path (line 157-159) currently calls scheduleNextWave() when returning from title screen mid-session. It should only do so if the player has already taken an action, otherwise the session should remain in the pre-action waiting state.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added optional onEdit callback to PlanningPhase constructor (no-op default, called on every handleEdit). Added firstActionTaken field to TideSession. Removed scheduleNextWave() from onInitialize and resetGame; it now fires only when firstActionTaken is set for the first time via the onEdit callback. onActivate re-entry also gates scheduleNextWave on firstActionTaken. resetRunState clears firstActionTaken and calls hud.updateCountdown(null) to hide the timer. TideHud countdown changed to number|null with null hiding the display element. static-check passed (tsc, lint, unit_test, knip, browser_test).
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
