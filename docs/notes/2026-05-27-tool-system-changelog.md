# Tool System Implementation -- 2026-05-27

## What changed

Replaced the two-step scoop/dump mechanic with a tool selection system. The player now selects a tool from a toolbar and clicks tiles for single-click actions.

### New files
- `src/model/inventory-model.ts` -- tracks sand as a persistent resource (survives across waves and levels, resets on game over)
- `src/view/toolbar.ts` -- toolbar UI at bottom-center with `ToolType` enum (`Shovel`, `Wall`), hotkeys (1, 2), sand count display, disabled state

### Rewritten files
- `src/view/single-cell-digging.ts` -- was a two-step flow (click to scoop, click another tile to dump). Now single-click: shovel digs and adds sand to inventory, wall places sand from inventory. No more "held tile" state. Cursor changes per tool. Hover tint: white for shovel, green for wall (only when has sand).
- `src/view/digging-strategy.ts` -- `ScoopResult` changed from `{ dugCells, dumpCell, totalDelta }` to `{ tool, cell, delta }`. `DiggingStrategyOptions` now includes `inventory` and `toolbar`. Added optional `updateCursor()` to the interface.

### Modified files
- `src/view/planning-phase.ts` -- removed send wave button entirely. Constructor now takes `inventory` and `toolbar` instead of `hasEnhancedShovel`. Always passes `delta: 1`. Enables/disables toolbar on activate/deactivate. Wires `toolbar.onToolSelected` to update cursor and state text.
- `src/view/hud.ts` -- removed `updateScoops()` and scoop display row. `showPlanning()` now takes `(scene, waveText)` instead of `(scene, scoopText, waveText)`. Three rows: level, state text, wave info.
- `src/game-session.ts` -- owns `InventoryModel` and `Toolbar` as class fields. Toolbar activated in `onInitialize()`. Removed `checkCleanWave()` and all enhanced shovel logic. `resetGame()` recreates both inventory and toolbar.
- `src/tide-session.ts` -- same cleanup as game-session
- `src/view/tide-hud.ts` -- updated to match new `PlanningHud` interface
- `src/view/drag-digging.ts` -- updated `ScoopResult` construction to new shape

### Removed
- Enhanced shovel mechanic (`ENHANCED_SHOVEL_DELTA`, `ENHANCED_SHOVEL_WAVES_REQUIRED` from config)
- `hasEnhancedShovel` and `consecutiveCleanWaves` from `GameState`
- `checkCleanWaveReward` from `GameMode` interface, `LevelMode`, and `TideMode`
- Send wave button (planning ends only via budget depletion or timer)

## Known risk areas

These are spots where bugs are most likely to surface:

1. **Toolbar z-ordering** -- toolbar actors use z=20-24. If other UI elements (banners, overlays, game-over screen) don't render above the toolbar, they may be hidden behind it. The toolbar is always present, even during wave phase (just dimmed).

2. **Sand count display sync** -- sand count is updated in two places: `SingleCellDigging.handleClick()` calls `toolbar.updateSandCount()` after each dig/place. If any code path modifies inventory without updating toolbar, the display will drift. Currently only `SingleCellDigging` touches inventory during gameplay.

3. **Budget counting** -- each tool action (dig or place) costs 1 from the budget. Previously only the completed scoop/dump pair cost 1. This means the effective budget is the same number of actions, but now they can be split between digging and placing independently. A player with 5 actions could dig 3 times and place 2 walls, or dig 5 times and place 0. This is intentional but changes the feel.

4. **Drag digging** -- `src/view/drag-digging.ts` was updated to match the new `ScoopResult` shape, but it still constructs results with the old flow logic (it does its own scoop/dump pairs). It may need a deeper rewrite to work with the tool system if it's ever activated as a strategy. Currently `SingleCellDigging` is the only strategy used.

5. **Toolbar keyboard conflicts** -- hotkeys 1 and 2 are registered on `scene.engine.input.keyboard`. The D key (debug serialize) and L key (elevation labels) are also registered there. No conflicts currently, but future hotkeys need to avoid 1/2 during planning.

6. **Toolbar sprite sizing** -- sprites are scaled to fit a 40px box (`SLOT_SIZE - 8`). The shovel sprite is 7KB and wall-tool sprite is 10KB. If these have unusual aspect ratios or transparency padding, they may appear off-center or too small in the slot.

7. **Game over reset** -- `resetGame()` deactivates and recreates the toolbar. This means keyboard listeners are re-registered. If `resetGame()` is called while a planning phase is still active (shouldn't happen, but edge case), the old toolbar's keyboard listener might not get cleaned up.
