# Wave Lockout + Deferred Dig Commit

## Problem

In tide mode, `simulateWave()` snapshots terrain at wave start then pre-computes the full result. If the player scoops/piles mid-wave, the wave ignores the change. This looks like a bug: the terrain visually changed but the water doesn't react.

## Solution

Two changes:

### 1. Defer terrain modification in DragDigging

Currently `DragDigging` calls `setElevation(-delta)` on each cell during the drag (onPointerDown/onPointerMove) and reverts on cancel. Instead:

- During drag: only track selected cells and apply visual tint. No elevation changes.
- On dump click: batch all `setElevation(-delta)` calls for source cells, then `setElevation(+totalDelta)` for the dump target.
- On cancel: just clear selection and tints. No revert needed.

This simplifies the cancel/deactivate paths and makes lockout trivial.

### 2. Lock digging during waves

Add `lock()`/`unlock()` to `DiggingStrategy` interface (optional methods). When locked:

- Discard any in-progress selection (clear tints)
- Ignore all pointer events
- Revert cursor to default

`TideSession.runWave()` calls `lock()` before simulation, `unlock()` after wave cleanup completes.

## Files to change

- `src/view/digging-strategy.ts`: Add optional `lock()`/`unlock()` to interface
- `src/view/drag-digging.ts`: Defer `setElevation` to dump click, add `lock()`/`unlock()`, simplify cancel/deactivate
- `src/tide-session.ts`: Call `lock()`/`unlock()` around wave execution
- `src/view/drag-digging.test.ts`: Update tests for deferred commit behavior, add lock/unlock tests

## Tasks

- [ ] Add `lock()`/`unlock()` to `DiggingStrategy` interface
- [ ] Refactor `DragDigging` to defer elevation changes to dump click
- [ ] Add `lock()`/`unlock()` to `DragDigging`
- [ ] Wire lockout into `TideSession.runWave()`
- [ ] Update/add unit tests
- [ ] Run typecheck, lint, unit tests
