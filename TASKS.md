# TASKS.md

Task tracking for Castle. Subagents: read this file to find unclaimed tasks, mark a task `[~]` with a note before starting, and mark `[x]` when complete.

## Status Key

- `[ ]` — available to claim
- `[~]` — in progress (note who/when)
- `[x]` — complete
- `[-]` — blocked (see note)

---

## Tasks

### TASK-036 — W-shaped wave front with per-wave peak variation [x] — Replaced parabola with sine W-shape in `generateColumnOffsets`; added `peakPhase` param; wave-animator passes random phase per wave.

**File:** `src/wave.ts`, `src/wave-animator.ts`

Replace the U-shape parabola in `generateColumnOffsets` with a W-shape formula. Update the call site to pass a random phase each wave.

**`src/wave.ts` — `generateColumnOffsets`:**

Add optional third parameter `peakPhase: number = 0`. Replace the existing formula body with:

```typescript
const x = col / (numCols - 1) * 2 + peakPhase;
const raw = uDepth * (1 - Math.abs(Math.sin(Math.PI * x)));
return Math.max(0, Math.min(uDepth, Math.round(raw)));
```

Update the JSDoc to describe the W-shape: two peaks advance first (at ~1/4 and ~3/4 of the grid width), while the center and edges lag behind. `peakPhase` shifts the peaks slightly.

**`src/wave-animator.ts` — `animate` method line 19:**

Change the call from:
```typescript
const offsets = generateColumnOffsets(GRID_WIDTH, WAVE_U_DEPTH);
```
to:
```typescript
const offsets = generateColumnOffsets(GRID_WIDTH, WAVE_U_DEPTH, (Math.random() - 0.5) * 0.4);
```

Run `npm run build` to verify. Mark `[x]` with summary.

---

### TASK-037 — Horizontal water spreading [x] — Added `WAVE_SPREAD_FACTOR = 0.5` to config; inserted horizontal spread pass in `simulateWave` so active columns bleed pressure to adjacent columns at each row step.

**Files:** `src/config.ts`, `src/wave.ts`

**Depends on TASK-036 being complete first** (both touch `wave.ts`).

Water spreads laterally at every row step: active columns bleed pressure to adjacent columns with less water. This makes flanking viable — a wall in front of the castle is not enough if the sides are open.

**`src/config.ts`:** Add after the existing wave constants:

```typescript
/** Fraction of a column's wave height that bleeds into each adjacent column per row step.
 *  0 = fully column-independent; 1 = instant equalisation. */
export const WAVE_SPREAD_FACTOR = 0.5;
```

**`src/wave.ts`:** Add `WAVE_SPREAD_FACTOR` to the config import. Inside `simulateWave`, after the inner `for (let col ...)` loop (tile interaction) but before advancing to the next row, insert a horizontal spread pass:

```typescript
// Horizontal spread: active columns bleed pressure to neighbours.
// Skip columns whose wave front hasn't started yet (columnOffsets guard).
const spread = columnWaveHeights.slice();
for (let col = 0; col < numCols; col++) {
  if (columnOffsets && row < columnOffsets[col]) continue;
  const h = columnWaveHeights[col];
  if (h <= 0) continue;
  for (const n of [col - 1, col + 1]) {
    if (n < 0 || n >= numCols) continue;
    if (columnOffsets && row < columnOffsets[n]) continue;
    if (columnWaveHeights[n] < h) {
      spread[n] = Math.max(spread[n], h * WAVE_SPREAD_FACTOR);
    }
  }
}
for (let col = 0; col < numCols; col++) {
  columnWaveHeights[col] = spread[col];
}
```

Run `npm run build` to verify. Mark `[x]` with summary.

---

### TASK-038 — Mobile viewport: fill screen, prevent pinch-zoom, add portrait warning [x] — Removed dead `display: flex` from `#portrait-warning` rule in `src/style.css`; `display: none` was already the last declaration and JS sets `style.display = 'flex'` inline, so the static flex declaration was unreachable.

**Files:** `src/style.css`, `index.html`, `src/main.ts`

Make the game fill the device screen correctly on mobile browsers with no colored margin, correct scaling, and a usable experience.

**Problem:** On mobile viewports a large colored margin appears around the canvas. Body has default 8px margins; html/body have no explicit dimensions; the canvas is not centered; and pinch-to-zoom can accidentally shift the viewport mid-scoop.

**`index.html`:**

- Add `user-scalable=no, viewport-fit=cover` to the existing `<meta name="viewport">` tag so the final value is:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover" />
  ```

**`src/style.css`:**

- Replace the file contents with styles that:
  - Set `margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%;` on both `html` and `body`
  - Set `background-color: black` on `body` unconditionally so letterbox bars are always black
  - Center the canvas inside body using flexbox (`display: flex; align-items: center; justify-content: center;`)
  - Add a `#portrait-warning` div style: full-screen dark overlay (`position: fixed; inset: 0; background: rgba(0,0,0,0.85); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; text-align: center; z-index: 999`) with `display: none` by default

**`src/main.ts`:**

- Change `displayMode` from `DisplayMode.FitScreenAndFill` to `DisplayMode.FitScreen`. This letterboxes the 800x600 canvas within the device screen, preserving aspect ratio without clipping any content.
- After `game.start(...)`, add a portrait-orientation guard:
  - Inject a `<div id="portrait-warning">Rotate your device to landscape for the best experience</div>` into `document.body`
  - On `window` `resize` and `orientationchange` events, show/hide that div based on `window.innerWidth < window.innerHeight`
  - Fire the check immediately on load

**Acceptance criteria:**

- [ ] On a 390x844 portrait phone (Chrome DevTools mobile emulation), no colored margin is visible around the canvas
- [ ] The canvas is centered with black letterbox bars filling any remaining space
- [ ] Pinch-to-zoom is disabled — the viewport does not scale during gameplay
- [ ] A "Rotate your device" message appears in portrait orientation and disappears in landscape
- [ ] Tapping tiles during the planning phase registers correctly (no new touch code needed — Excalibur's pointer system handles touch)
- [ ] `npm run build` passes clean after changes

---

---

## Completed

### TASK-035 — Bug: Animation loop crashes at level 10+ (waveReach + WAVE_U_DEPTH out-of-bounds) [x]

`src/wave-animator.ts` line 24: changed loop bound from `waveReach + WAVE_U_DEPTH` to `Math.min(waveReach + WAVE_U_DEPTH, GRID_HEIGHT)`, preventing out-of-bounds access on `waveHeightMap` at level 10+ where the unguarded bound exceeded the array's 20-row allocation. `npm run build` passes clean.

### TASK-034 — Wave height visibility [x]

`src/wave-animator.ts`: added `Text` and `Font` to excalibur imports; updated `spawnOverlay` signature to `(col, row, waveHeight)` and replaced hardcoded `Color.fromRGB(30, 100, 200, 0.6)` with computed `r = Math.max(0, 100 - (waveHeight - 1) * 18)`, `g = Math.max(0, 160 - (waveHeight - 1) * 12)`, `Color.fromRGB(r, g, 220, 0.5)`; updated call site in animation loop to pass `result.waveHeightMap[row][col]`; after the animation loop (before post-wave pause), added per-column label loop that finds first flooded row per column and spawns a white `Text` actor at that position (font size 10, z=10) showing the rounded wave height, added to `overlayActors` for automatic cleanup. `npm run build` passes clean.

### TASK-033 — Multiple waves per level [x]

`src/config.ts`: added `WAVES_BASE = 1` and `WAVES_INCREMENT = 1` after the existing wave constants. `src/wave.ts`: added `wavesForLevel(level)` returning `WAVES_BASE + (level - 1) * WAVES_INCREMENT`; imported the two new constants from config. `src/level.ts`: imported `wavesForLevel`; rewrote `runWavePhase` to loop k=1..wavesForLevel(currentLevel), showing a "Wave k of N" banner for 500ms, animating with height `baseHeight + (k-1)`, applying erosion and flash, returning early on castle flood, calling `waveAnimator.cleanup()` between waves with a 600ms pause (omitted after the last wave), then `showLevelComplete` + `advanceLevel`; added private `delay(ms)` and `showWaveBanner(k, total)` helpers; updated `startPlanningPhase` to pass `wavesForLevel(this.currentLevel)` as the fifth argument. `src/planning-phase.ts`: added `numWaves: number` as fifth constructor parameter; updated wave HUD label text to `Wave: N  ×${numWaves}`. `npm run build` passes clean.

### TASK-032 — U-shaped wave front [x]

`src/config.ts`: added `WAVE_U_DEPTH = 4` after the existing wave constants. `src/wave.ts`: added `generateColumnOffsets(numCols, uDepth)` that computes per-column start-row offsets using the parabolic formula `round(uDepth * (1 - ((col - center) / center)^2))` clamped to `[0, uDepth]`; updated `simulateWave` to accept optional `columnOffsets?: number[]` — when provided, any `(row, col)` where `row < columnOffsets[col]` sets `waveHeightMap[row][col] = 0` and skips interaction, holding column wave height at its initial value. `src/wave-animator.ts`: imported `generateColumnOffsets` and `WAVE_U_DEPTH`; in `animate`, generates offsets before calling `simulateWave`, passes `waveReach + WAVE_U_DEPTH` as `maxRows` and `offsets` as `columnOffsets`; animation loop runs to `waveReach + WAVE_U_DEPTH`; `spawnOverlay` only called when `row >= offsets[col] && waveHeightMap[row][col] > 0`. `npm run build` passes clean.

### TASK-031 — UX: No feedback when player clicks the castle tile [x]

`src/planning-phase.ts`: in `handleClick`, added a guard in State A for `button === 'left' && tile.isCastle` that sets `stateText.text` to `"The castle can't be moved!"` and re-applies it via `stateActor.graphics.use`, then schedules `updateStateHUD()` after 1000ms to restore the default label. No scoop is consumed. `npm run build` passes clean.

### TASK-030 — Bug: waveHitCount never reset between levels (phantom erosion) [x]

`src/level.ts`: added `this.grid.resetHitCounts()` in `advanceLevel()` after `this.waveAnimator.cleanup()`, ensuring tile hit counts are zeroed at the start of each new level so erosion timing is deterministic. `npm run build` passes clean.

### TASK-028 — UX: Snapshot test stale after TASK-022 wave reach indicator [x]

`tests/main.spec.ts-snapshots/main-page-looks-correct-1-chromium-darwin.png` regenerated via `npm run test:integration-update`. New baseline captures the amber "Wave limit" line, wave strength HUD, and state label added by TASK-022, TASK-029, and TASK-015. `npm test` exits 0 with no diff failures.

### TASK-029 — UX: Show wave strength in planning phase HUD [x]

`src/planning-phase.ts`: added `waveHeight: number` as fourth constructor parameter (between `waveReach` and `onComplete`); added `waveHudBgActor` and `waveHudActor` private fields; in `activate()`, creates a dark semi-transparent 140x20 background panel at `(80, 57)` (z=10) and an amber `"Wave: N"` Text actor at `(80, 57)` (z=11, font size 14, `Color.fromRGB(255, 200, 80)`); both removed and nulled in `deactivate()`. `src/level.ts`: `startPlanningPhase()` now passes `waveHeightForLevel(this.currentLevel)` as the fourth argument to `new PlanningPhase(...)`. `npm run build` passes clean.

### TASK-026 — Bug: Docs say castle unreachable until level 12, but config says row 13 (reachable level 5) [x]

`docs/gameplay.md` audited against `src/config.ts`. The doc already correctly stated "level 5" and "tile 13" — no stale "level 12" references were found. The constants table matched config exactly (`WAVE_REACH_START = 10`, `WAVE_REACH_INCREMENT = 1`, `CASTLE_ROW = 13`, all other constants verified). No doc changes were required; regression introduced by TASK-021 had already been corrected. `npm run build` passes clean.

### TASK-025 — Bug: Wave reach indicator label positioned off-grid [x]

`src/planning-phase.ts` line 133: changed `reachLabelActor` x from `lineX + (GRID_WIDTH * TILE_SIZE) / 2 - 50` to `lineX`. `lineX` is already the horizontal center of the grid; the extra half-grid-width offset pushed the label to the far right edge. Label now sits centered on the amber wave limit line. `npm run build` passes clean.

### TASK-027 — Bug: Wave overlays remain on screen during game-over overlay [x]

`src/level.ts`: added `this.waveAnimator.cleanup()` as the first line of `showGameOver()` so blue wave overlay actors are removed before the game-over overlay is rendered. `npm run build` passes clean.

### TASK-023 — UX: Erosion flash highlight [x]

`src/grid.ts`: changed `applyErosion` return type from `void` to `Tile[]`; collects tiles into `erodedTiles` when `waveHitCount >= 3` and elevation is non-zero, returns the array. `src/wave-animator.ts`: imported `Tile` from `./tile`; added `async flashErodedTiles(tiles: Tile[]): Promise<void>` that spawns a `Color.fromRGB(255, 140, 0, 0.7)` overlay actor per eroded tile using the same `GRID_LEFT`/`GRID_TOP` formula as `spawnOverlay`, awaits 350ms, then removes all flash actors. `src/level.ts`: updated `runWavePhase` to capture `const erodedTiles = this.grid.applyErosion(...)` and conditionally `await this.waveAnimator.flashErodedTiles(erodedTiles)`. `npm run build` passes clean.

### TASK-022 — UX: Wave reach indicator during planning phase [x]

`src/planning-phase.ts`: added `waveReach: number` as third constructor parameter (between `scoops` and `onComplete`); added `reachLineActor` and `reachLabelActor` private fields; in `activate()`, when `waveReach < GRID_HEIGHT`, creates a 2px-tall amber Rectangle actor spanning the full grid width at `y = GRID_TOP + waveReach * TILE_SIZE` (z=5) and a "Wave limit" Text label actor 8px above it; both actors removed and nulled in `deactivate()`. `src/level.ts`: `startPlanningPhase()` now passes `waveReachForLevel(this.currentLevel)` as the third argument to the `PlanningPhase` constructor (`waveReachForLevel` was already imported). `npm run build` passes clean.

### TASK-020 — Bug: Title scene pointer listener never removed (input leak) [x]

`src/title-scene.ts`: added `private startHandler: (() => void) | null = null` field; removed `'down'` registration from `onInitialize`; added `onActivate(ctx: SceneActivationContext)` that assigns a handler closure and calls `ctx.engine.input.pointers.primary.on('down', this.startHandler)`; added `onDeactivate(ctx: SceneActivationContext)` that calls `.off('down', this.startHandler)` and nulls the field. Listener is now active only while the title scene is displayed. `npm run build` passes clean.

### TASK-024 — UX: Castle tile accumulates waveHitCount on game-over wave [x]

`src/grid.ts`: added `if (tile.isCastle) continue;` guard in `applyErosion` immediately after the null check, so the castle tile is skipped entirely and its `waveHitCount` never accumulates. `npm run build` passes clean.

### TASK-021 — Bug/Docs: Wave reach level math is off by one [x]

`docs/gameplay.md` line 83 corrected from "level 11" to "level 12". The math: `waveReachForLevel(12) = 10 + 11 = 21`; the simulation loop is `row < maxRows`, so maxRows=21 covers rows 0–20, which includes `CASTLE_ROW = 20`. Level 12 is confirmed as the first level where the castle is reachable. Constants (`WAVE_REACH_START = 10`, `CASTLE_ROW = 20`) left as-is — the 11-level grace period is intentionally generous for learning. `npm run build` passes clean.

### TASK-019 — Non-uniform wave + wave reach limit [x]

`src/config.ts`: added `WAVE_HEIGHT_VARIANCE = 1`, `WAVE_REACH_START = 10`, `WAVE_REACH_INCREMENT = 1`, `WAVE_ROW_DELAY_MS = 120`. `src/wave.ts`: replaced `waveHeight: number` param with `columnHeights: number[]` and added `maxRows: number`; initialises `columnWaveHeights` via `columnHeights.slice()` with fallback to zeros; row loop bound changed to `Math.min(numRows, maxRows)`; added `generateColumnHeights(baseHeight, variance, numCols)` and `waveReachForLevel(level)`. `src/wave-animator.ts`: removed `ROW_DELAY_MS`; imports `WAVE_ROW_DELAY_MS`, `WAVE_HEIGHT_VARIANCE`, `GRID_WIDTH` from config and `generateColumnHeights` from wave; `animate` now takes `(waveHeight, waveReach)`, generates column heights, passes them to `simulateWave`, loops rows up to `waveReach`, uses `WAVE_ROW_DELAY_MS`. `src/level.ts`: imports `waveReachForLevel`; `runWavePhase` passes it to `animate`. `npm run build` passes clean.

### TASK-017 — UX: Visual indicator when scoop budget is exhausted [x]

`src/planning-phase.ts`: added `private delay(ms: number): Promise<void>` helper (same one-liner pattern as `WaveAnimator`); made `handleClick` async; in the scoop-zero branch, after setting `completed = true` and `active = false`, updates `hudText.text` to `'Scoops: 0 — sending wave…'` and re-applies via `hudActor.graphics.use(this.hudText)`, then `await this.delay(600)` before calling `this.onComplete()`. `npm run build` passes clean.

### TASK-018 — Persistent terrain + erosion mechanic [x]

`src/tile.ts`: added `waveHitCount: number = 0` public field to `Tile`. `src/grid.ts`: added `resetHitCounts()` (iterates all tiles, zeroes `waveHitCount`) and `applyErosion(waveHeightMap)` (increments hit count for wave-reached tiles; at 3 hits erodes elevation one unit toward 0 via `setElevation` delta, then resets count). `src/level.ts`: `advanceLevel()` no longer removes tiles or reconstructs `TileGrid` — it now only increments level, updates display, cleans up and recreates `WaveAnimator` with the same grid, and starts planning phase; `runWavePhase()` calls `this.grid.applyErosion(result.waveHeightMap)` after wave animation. `resetGame()` unchanged (grid is fully reconstructed on game over). `npm run build` passes clean.

### TASK-016 — UX: Send Wave button hover state [x]

`src/planning-phase.ts`: added `private sendWaveInnerActor: Actor | null = null` field; assigned the inner fill child actor to it when building the button in `activate()`; registered `pointerenter` (brightens fill to `(80, 200, 80)`) and `pointerleave` (restores to `(60, 160, 60)`) on `sendWaveActor`; nulled out `sendWaveInnerActor` in `deactivate()` alongside `sendWaveActor`. `npm run build` passes clean.

### TASK-015 — UX: HUD state label — show current planning state [x]

`src/planning-phase.ts`: added `private stateBgActor: Actor | null`, `private stateActor: Actor | null`, `private stateText: Text | null` fields; in `activate()` created a dark semi-transparent background panel at `(80, 38)` (z=10, 220x22) and a text actor at `(80, 38)` (z=11, font size 12, `Color.fromRGB(180,180,180)`); added `private updateStateHUD()` that sets `stateText.text` to `"Click a tile to scoop"` or `"Click another tile to dump | Right-click to cancel"` based on `heldTile`; called `updateStateHUD()` at end of `activate()` and at end of each state-changing branch in `handleClick` (after scoop, after dump, after cancel); removed `stateBgActor` and `stateActor` in `deactivate()`. `npm run build` passes clean.

### TASK-012 — Fix: Send Wave click also scoops the bottom-center tile [x]

`src/planning-phase.ts`: added `private active = false` field; set `true` at top of `activate()`, `false` at top of `deactivate()`; added `if (!this.active) return;` guard at top of `handleClick`. In the Send Wave button's `pointerdown` handler, set `this.active = false` before calling `this.onComplete()` so that any same-tick global pointer handler firing is a no-op. `npm run build` passes clean.

### TASK-014 — Fix: No guard against `onComplete` firing twice [x]

`src/planning-phase.ts`: added `private completed = false` field; reset to `false` in `activate()`; in the Send Wave `pointerdown` handler, check `if (this.completed) return` and set `this.completed = true` before calling `this.onComplete()`; in `handleClick` at the `scoopsRemaining === 0` branch, wrap `onComplete()` with the same `completed` guard. `npm run build` passes clean.

### TASK-013 — Fix: Iterating live `this.entities` while removing Tile actors [x]

`src/level.ts`: in both `advanceLevel()` and `resetGame()`, replaced the live `for...of this.entities` + `this.remove()` pattern with a snapshot: `const tilesToRemove = this.entities.filter(e => e instanceof Tile) as Tile[]` followed by a separate removal loop. Eliminates the risk of skipping tiles when removal shifts indices in a live array. `npm run build` passes clean.

### TASK-009 — Update Playwright snapshots [x]

`tests/main.spec.ts` updated: removed `#excalibur-play` click (loader is empty so button never appears; game starts directly on title scene), replaced with `waitForSelector('canvas')` + 1500ms wait + `click('canvas')` to advance past title + 1500ms wait before screenshot. New snapshot written to `tests/main.spec.ts-snapshots/main-page-looks-correct-1-chromium-darwin.png`. `npm test` exits 0 with no diff failures.

### TASK-011 — Cursor feedback during planning phase [x]

`src/tile.ts`: exported `elevationToColor`. `src/planning-phase.ts`: added `hoverListenerTiles: Tile[]` field; registered `pointerenter`/`pointerleave` on all non-castle tiles in `activate`; added `onTileEnter` (brightened hover in State A, green tint in State B, skips held tile), `onTileLeave` (restores via `updateVisual`, skips held tile), and `applyHoverTint` (adds 38 to each RGB channel clamped to 255 using `elevationToColor`); `deactivate` calls `tile.off` for both events and clears the array. `npm run build` passes clean.

### TASK-010 — Title screen [x]

`src/title-scene.ts` created with `TitleScene extends Scene`: three centered actors ("Castle" at 64px, subtitle at 16px, "Click to start" at 20px), `pointerdown` listener on `scene.input.pointers.primary` transitions to `'game'` scene with dual 500ms `FadeInOut` (black). `src/main.ts` updated to import `TitleScene`, register scenes as `{ title: TitleScene, game: MyLevel }`, and start on `'title'`. `npm run build` passes clean.

### TASK-008 — Restart mechanic [x]

`src/level.ts`: added "Click anywhere to restart" prompt actor (size 18, `Color.fromRGB(180,180,180)`, `y:60`) as third child of `bgActor` in `showGameOver()`; added `pointerdown` listener on `bgActor` to remove it and call `resetGame()`; added private `resetGame()` that resets `currentLevel` to 1, updates level display, cleans up wave animator, removes all `Tile` entities, reconstructs `TileGrid` and `WaveAnimator`, and calls `startPlanningPhase()`. `npm run build` passes clean.

### TASK-006 — Visual polish pass [x]

`src/tile.ts`: fixed elevation color interpolation (negative elevations now interpolate to deep blue at -10; positive to dark brown at +10; castle changed from slate gray to brick red `(180, 60, 60)`). `src/planning-phase.ts`: added dark semi-transparent `hudBgActor` at z=10 behind HUD text (z=11); Send Wave button rebuilt with outer dark-green border rect and inner bright-green fill child actor. `src/wave-animator.ts`: added clarifying comment on water overlay color. `npm run build` passes clean.

### TASK-007 — Level counter HUD [x]

`src/level-display.ts` created with `LevelDisplay` class. `src/level.ts` updated to import, instantiate, activate, and update the display on level advance. `npm run build` passes clean.

### TASK-005 — Wire game loop [x]

`src/level.ts` rewritten with full game loop: `startPlanningPhase`, `runWavePhase`, `advanceLevel`, `showGameOver`, `showLevelComplete`. Terrain reset on level advance iterates `this.entities`, removes `Tile` instances, and reconstructs `TileGrid` and `WaveAnimator`. `npm run build` passes clean.

### TASK-003 — Planning phase UI [x]

`src/planning-phase.ts` created. `src/level.ts` updated with `TileGrid` field, `currentLevel`, and `PlanningPhase` wiring. `npm run build` passes clean.

### TASK-004 — Wave animator [x]

`src/wave-animator.ts` created. Exports `WaveAnimator` with `animate(waveHeight)` and `cleanup()`. `npm run build` passes clean.

### TASK-001 — Grid foundation [x]

`src/config.ts`, `src/tile.ts`, `src/grid.ts` created. Demo code removed from `src/level.ts`, `src/resources.ts`, `src/player.ts`. `npm run build` passes clean.

### TASK-002 — Wave simulation logic [x]

`src/wave.ts` created. Exports `simulateWave` and `waveHeightForLevel`. Pure TypeScript, no Excalibur imports. Type-checks clean.
