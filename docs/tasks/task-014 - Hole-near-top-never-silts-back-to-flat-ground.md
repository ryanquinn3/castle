---
id: TASK-014
title: Hole near top never silts back to flat ground
status: Done
assignee: []
created_date: '2026-06-20 14:40'
updated_date: '2026-06-20 18:32'
labels:
  - bug
dependencies: []
references:
  - src/model/terrain/hole.ts
  - src/model/grid-model.ts
  - src/wave/wave-event-applier.ts
  - src/wave/wave-field-runtime.ts
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A hole filled to nearly-full (e.g. depth 19, puddleDepth 18.5) near the top of the grid takes many waves but never silts back to flat. Root cause (see docs/bugs/2026-06-20-hole-never-silts-to-flat.md): silting runs only for cells holding live resting water at wave end (restingCells in WaveFieldRuntime.onComplete), and puddleDepth is written only by the wave-end commit. Once a hole fills enough that effectiveDepth approaches 0, groundAt reports it as flat ground, so the pressure field stops routing/resting water there; with no resting water the hole is never committed again and freezes with a large stranded puddleDepth. Fix: drive silting off the hole's persisted puddleDepth across ALL holes at wave end (not just resting cells), splitting absorb from silt, with a top-off rule so an effectively-full hole finishes silting to flat.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A hole holding stored pooled water (puddleDepth >= 1) silts one step at wave end even when no fresh water rests on it that wave
- [ ] #2 An effectively-full hole (puddleDepth > 0 and effectiveDepth < 1) keeps silting one step per wave until it converts to flat ground
- [ ] #3 A hole that never pooled water (puddleDepth 0) does not silt
- [ ] #4 Existing single-wave behavior is preserved: a hole that pools resting water still absorbs it into puddleDepth and silts one step that same wave
- [ ] #5 docs/gameplay.md hole silting section reflects the persisted-puddle silting and top-off behavior
- [ ] #6 node --run static-check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Technical Overview

### Approach
Silting is currently gated on transient resting water: WaveFieldRuntime.onComplete only emits holeCommit for cells that still hold a live water actor at wave end, and puddleDepth is written only by that commit. Once a hole fills enough that effectiveDepth approaches 0, groundAt reports it as flat ground, so the pressure field stops routing/resting water there. With no resting water the hole is never committed again and freezes with a large stranded puddleDepth.

Fix: separate absorb from silt and drive silting off persisted puddleDepth across ALL holes.
- Absorb (resting cells only): route holeCommit pooled water into puddle via the existing addPuddle/applyPuddleDelta path (no new method needed).
- Silt (every hole, once per wave end): new GridModel.siltAllHoles() calls Hole.siltStep() on each hole. siltStep silts depth-1/puddle-1 while puddleDepth >= 1; once puddleDepth < 1 but the hole is effectively full (effectiveDepth < 1 and puddleDepth > 0) it tops off (depth-1, puddle clamped to new depth) so an effectively-full hole finishes to flat instead of freezing. A hole that never pooled water (puddle 0) is untouched.

Net behavior for a resting hole in a single wave is identical to the old commitWave (absorb then one silt step), so existing tests stay valid; the change ADDS silting for holes with stored puddle that no longer pool fresh water.

Lands as one vertical-slice commit (ST.01): removing silting from the per-resting-cell commit while leaving the runtime unchanged would break wave-field-runtime-terrain.browser.test mid-way. Docs are a separate atomic commit (ST.02, depends on ST.01).

### Files and components touched
- src/model/terrain/hole.ts - replace commitWave with siltStep (keep addPuddle); + hole.test.ts.
- src/model/grid-model.ts - replace commitHoleWave with siltAllHoles(); keep applyPuddleDelta; + grid-model.browser.test.ts.
- src/wave/wave-segment-types.ts - add { type: 'siltHoles' } to WaveSegmentEvent; add optional erodedTiles: Terrain[] to WaveEventApplyResult.
- src/wave/wave-event-applier.ts - holeCommit -> applyPuddleDelta (absorb-only); add siltHoles -> siltAllHoles, populating erodedTiles; + wave-event-applier.test.ts.
- src/wave/wave-field-runtime.ts - onComplete: absorb each resting cell (holeCommit), then one siltHoles event; collect erodedTiles for the flash.
- docs/gameplay.md - hole silting section (ST.02).

### Testing strategy
Per docs/testing.md: model + applier are pure logic -> unit tests (*.test.ts under jsdom): hole.test.ts (siltStep cases incl. top-off and no-op), wave-event-applier.test.ts (holeCommit absorbs, siltHoles silts). GridModel adds/removes actors so its silt-to-FlatGround swap is covered in grid-model.browser.test.ts. The end-to-end resting-pool + silt + drain path is covered by the existing wave-field-runtime-terrain.browser.test (assertions remain valid). New regression: a stranded full hole (high puddle, no fresh water) silts each wave and reaches FlatGround - unit-testable on Hole.siltStep plus GridModel.siltAllHoles. No tuning-knob coupling. Verify with node --run static-check.

## Execution order
1. TASK-014.01 - core vertical-slice fix (TDD), one atomic commit. Start by creating/switching to feat/hole-silting.
2. TASK-014.02 - gameplay.md docs sweep, depends on 014.01, one atomic commit.

## Key risks
- Keep the resting-cell single-wave outcome identical to old commitWave so existing runtime/grid tests stay green (absorb then one silt step).
- siltAllHoles must re-detect pools after converting any hole to FlatGround.
- Top-off rule must NOT over-silt shallow partially-pooled holes: it only fires when effectiveDepth < 1 (water at the brim), so a hole that pooled e.g. 1 unit stops after one step (puddle hits 0).
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->
