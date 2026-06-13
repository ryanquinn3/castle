# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Rules of engagement

- Always collaborate with the user before jumping into implementation.

## Docs

- Main gameplay design doc: `docs/gameplay.md`.
- Design docs, implementation plans, and proposals belong in `docs/plans/`.
- Notes and research that are not plans belong in `docs/notes/`.
- Bug writeups and investigation artifacts belong in `docs/bugs/`.
- When making gameplay changes, update `docs/gameplay.md` in the same change.

## Gameplay Overview

Wave defense game. Each level has two phases:

1. **Planning phase** - player selects a non-castle cell, moves the selection with arrow keys, and applies context-valid shovel, wall, or tower actions to reshape terrain
2. **Wave phase** - water advances from the top of the grid downward; terrain elevation reduces wave height

**Core mechanic**: Shovel digs the selected cell and adds 1 sand. Walls are built in four stacked levels (L1-L4) at costs 1/5/10/20 sand; each level can only be placed on the level below it (L1 on flat ground only). Tower places a fixed height-15 tower on selected flat ground for 15 sand. In Classic, only shovel actions consume the finite planning budget; Tide planning is countdown-based. Walls reduce incoming wave height; holes absorb it. Towers erode after 10 hits instead of 3. Water that reaches the castle tile ends the game.

Full design doc: `docs/gameplay.md`.

## Commands

A dev server is always running in the background. Do not start one.

To run all code check tools including tests, linter, typecheck etc use the following command: `node --run static-check`.

This command runs the full verification suite. This is run before a commit can be made to the repo.

## Architecture

Excalibur.js game (TypeScript + Vite).

Use context7 mcp to read docs on the excaliburjs engine. We should always aim to write idiomatic code with the framework.

### Core files

**Keep this list up to date when making core changes**

- **`src/main.ts`** - Thin bootstrap that calls `startGame("game")`
- **`src/engine.ts`** - Creates the Engine (FillScreen, pixel-art), registers scenes (`title`, `game`, `tide`), and starts the game on the title scene
- **`src/level-session.ts`** - Classic level-mode scene. Owns the loop: planning phase, wave simulation, win/loss checks
- **`src/tide-session.ts`** - Tide-mode scene. Runs continuous timed waves, countdowns, high score, planning lockout, win/loss checks
- **`src/title-scene.ts`** - React-backed title screen with Classic and Tide mode selection
- **`src/config.ts`** - All game constants (grid size, scoop budget, wave params, tile size, layout)
- **`src/resources.ts`** - Asset loading; exports `Resources`, `loader`, and Tiled map

### Model layer (`src/model/`)

- **`terrain/terrain.ts`** - Terrain base class and shared types. Each terrain is an Excalibur `Actor`: it owns its transform (positioned from col/row in `attach`), a tile-sized `CollisionType.Passive` collider (dormant; reserved for future wave/terrain physics), and self-renders via `syncGraphic()` (canvas cached by `cacheKey`). Each instance knows its live cardinal neighbors (`get neighbors`) and can report adjacency with `connectsTo(other)`.
- **`terrain/flat-ground.ts`**, **`terrain/hole.ts`**, **`terrain/wall.ts`**, **`terrain/tower.ts`** - Terrain implementations. Each type owns elevation, sprite/render info, water interaction, erosion, mutation behavior, and serialization (`serialize()`). Walls render procedurally as a **contiguous mass** using grid-anchored per-tier textures and edge decoration; holes derive edge flags from neighbors.
- **`grid-model.ts`** - The single grid container. Holds the `Terrain[][]` actor grid, pool detection, tower placement, sand redistribution, projection helpers, and debug serialization. Takes the `Scene` and adds/removes terrain actors to it: `setCell` swaps the actor when a cell's type changes (detected by `applyDelta` returning a new instance) and refreshes the changed cell + neighbors via `syncGraphic()`. Implements `NeighborGrid` (`neighborsOf`); every cell assignment routes through `setCell` so each terrain is attached for neighbor lookups
- **`inventory-model.ts`** - Sand inventory used by digging, wall placement, and tower placement
- **`flow-field.ts`** - Flow field computation for wave spread, row solvers, pool absorption
- **`wave-simulation.ts`** - Orchestrates advance/recede passes, takes Terrain cells directly
- **`water-column.ts`** - Water column state for flow field simulation

### Wave runtime (`src/wave/`)

- **`wave-actor-runtime.ts`** - Live wave runtime used by Classic and Tide sessions; coordinates spawned segment actors, collects runtime results, and reports castle flooding / erosion / redistribution
- **`wave-event-applier.ts`** - Applies `WaveSegment` events back into the terrain actor grid (`GridModel`) and sand-layer state
- **`wave-field-runtime.ts`** - Pressure-driven wave runtime (behind `PRESSURE_WATER_ENABLED`). Builds the overlay, registers dynamic + render systems, and resolves when no water remains. Wires `WaveEventApplier` for hole pooling and castle flooding (M3); erosion and sand redistribution remain M4.
- **`wave-spawner.ts`** - Builds deterministic per-column wave segment spawn data from peak-height inputs
- **`wave-segment.ts`** - Actor-driven wave segment: handles surge, recession, and still water. Segments self-clone as they advance (still copies replace the old separate static actor). Overlapping segments merge via momentum conservation.
- **`wave-terrain-feedback.ts`** - Pure post-flux terrain feedback for the pressure field: holes absorb resting water into `puddleDepth` (finite capacity) and a wet castle cell flags a flood. Consumed by `WaveFieldRuntime` via `WaveDynamicSystem`'s `onResolveCells` hook.

### View layer (`src/view/`)

Terrain rendering now lives on the terrain actors themselves (`Terrain.syncGraphic()` in the model layer); there is no separate tile/grid view actor. `GridModel` owns the actor grid directly.

- **`planning-phase.ts`** - Coordinates planning state, HUD text, tool selection, wave reach indicator, and `TerrainEditor` lifecycle
- **`terrain-editor.ts`** - Selection-based planning input: tracks the selected cell, moves it with arrow keys, renders the selection highlight, and applies dig/wall/tower edits with context-sensitive tool validity
- **`toolbar.ts`** - React-backed tool selector and sand cost UI bridge
- **`wave-renderer.ts`** - Animates wave advance/recede across the grid
- **`hud.ts`** - HUD display (scoop budget, wave count, level info)
- **`tide-hud.ts`** - Tide mode HUD display (wave count, sand, countdown, best score)
- **`screen-overlays.ts`** - Banners, level complete, game over overlays
- **`castle-actor.ts`** - Standalone castle overlay actor (spans the castle footprint) plus the `placeCastle()` helper sessions use to (re)place it; the underlying castle cells stay `FlatGround` in the grid, edit-guarded by `isCastle`

### UI layer (`src/ui/`)

- React components and CSS for the title menu, HUDs, sand counter, toolbar, and tool cost badges. Excalibur scenes mount these into `#game-ui`.

### Game modes (`src/modes/`)

- **`game-mode.ts`** - GameMode interface and GameState type
- **`level-mode.ts`** - Per-level state machine (planning, wave, between-waves)
- **`tide-mode.ts`** - Continuous tide-mode wave progression and score state

## Sound

All sound playback must go through `playSound()` from `src/sound.ts`, never call `.play()` directly on a Sound resource. The helper checks the `__SOUNDS_DISABLED__` compile-time flag (set `true` in `vitest.config.ts`) so tests skip audio entirely and avoid jsdom's incomplete Audio support.

## Testing

See `docs/testing.md` for the unit-vs-browser decision rule, the two Vitest projects, the shared browser fixture, and screenshot capture. Tests are co-located with source (`*.test.ts` / `*.browser.test.ts`).

## Debug Serialization

Press **D** at any time to copy the board state as JSON to the clipboard. The format:

```json
{
  "castle": { "col": 7, "row": 11, "width": 2, "height": 2 },
  "cells": [
    [{ "type": "wall", "height": 10, "level": 2, "hp": 45 }, { "type": "hole", "height": -2, "puddleDepth": 1.5 }, { "type": "tower", "height": 15 }],
    [{ "type": "flat", "height": 0 }, { "type": "flat", "height": 0 }, { "type": "flat", "height": 0 }]
  ],
  "columnHeights": [3.2, 2.8, 4.1]
}
```

- `castle` - castle grid position and dimensions.
- `cells` - 2D grid, row-major. Each cell has `type` (flat/wall/hole/tower), `height`, and optional fields (e.g. `puddleDepth` for holes). Walls also serialize `level` (1-4) and `hp` (current durability); `height` is the derived blocking elevation (5/10/15/20).
- `columnHeights` - per-column wave heights from last wave (empty array if no wave has run).

> The standalone `tools/replay-wave.ts` replay script was retired in the terrain→Actor migration: terrain now imports Excalibur (which requires a browser `window`) and can no longer be loaded in pure Node. Use the debug JSON to reconstruct state and trace the wave runtime, or rebuild an actor-driven replay harness (running under the browser Vitest project) if needed.

## Vite Config Notes

- Custom plugin externalizes `.tsx` Tiled tileset files (avoids React/JSX conflict)
- Excalibur excluded from dep optimization (CJS/ESM issue)
- Assets not inlined (`assetsInlineLimit: 0`) due to Excalibur XML limitation
- `base: './'` for relative paths

## Temporary files

Use `./.tmp` for temporary files instead of `/tmp`.

## No worktrees

This repo is not set up for git worktrees so always work on the current branch / checkout.
