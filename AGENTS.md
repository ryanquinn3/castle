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

**Core mechanic**: Shovel digs the selected cell and adds 1 sand, wall raises the selected cell for 1 sand, and tower places a fixed height-15 tower on selected flat ground for 15 sand. In Classic, only shovel actions consume the finite planning budget; Tide planning is countdown-based. Walls reduce incoming wave height; holes absorb it. Towers erode after 10 hits instead of 3. Water that reaches the castle tile ends the game.

Full design doc: `docs/gameplay.md`.

## Commands

A dev server is always running in the background. Do not start one.

To run all code check tools including tests, linter, typecheck etc use the following command: `node --run static-check`.

This command runs the full verification suite. This is run before a commit can be made to the repo.

## Architecture

Excalibur.js game (TypeScript + Vite).

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

- **`terrain/terrain.ts`** - Terrain base class and shared types. Each terrain instance knows its live cardinal neighbors (`get neighbors`) and can report adjacency with `connectsTo(other)`.
- **`terrain/flat-ground.ts`**, **`terrain/hole.ts`**, **`terrain/wall.ts`**, **`terrain/tower.ts`** - Terrain implementations. Each type owns elevation, sprite/render info, water interaction, erosion, mutation behavior, and serialization (`serialize()`). Walls render procedurally as a **contiguous mass** using grid-anchored per-tier textures and edge decoration; holes derive edge flags from neighbors.
- **`grid-model.ts`** - Grid state: `Terrain[][]` cells, pool detection, tower placement, sand redistribution, projection helpers, and debug serialization. Implements `NeighborGrid` (`neighborsOf`) and routes every cell assignment through `setCell` so each terrain is attached to the grid for neighbor lookups
- **`inventory-model.ts`** - Sand inventory used by digging, wall placement, and tower placement
- **`flow-field.ts`** - Flow field computation for wave spread, row solvers, pool absorption
- **`wave-simulation.ts`** - Orchestrates advance/recede passes, takes Terrain cells directly
- **`water-column.ts`** - Water column state for flow field simulation

### Wave runtime (`src/wave/`)

- **`wave-actor-runtime.ts`** - Live wave runtime used by Classic and Tide sessions; coordinates spawned segment actors, collects runtime results, and reports castle flooding / erosion / redistribution
- **`wave-event-applier.ts`** - Applies `WaveSegment` events back into `GridView` and sand-layer state
- **`wave-spawner.ts`** - Builds deterministic per-column wave segment spawn data from peak-height inputs
- **`wave-segment.ts`** - Actor-driven wave segment movement and event emission during surge / recede

### View layer (`src/view/`)

- **`grid-view.ts`** - Renders the grid of tiles from GridModel state
- **`tile.ts`** - Individual tile actor; delegates rendering to `Terrain.getRenderInfo()` and caches the resulting `Canvas` graphic keyed by the terrain's `cacheKey`
- **`planning-phase.ts`** - Coordinates planning state, HUD text, tool selection, wave reach indicator, and `TerrainEditor` lifecycle
- **`terrain-editor.ts`** - Selection-based planning input: tracks the selected cell, moves it with arrow keys, renders the selection highlight, and applies dig/wall/tower edits with context-sensitive tool validity
- **`toolbar.ts`** - React-backed tool selector and sand cost UI bridge
- **`wave-renderer.ts`** - Animates wave advance/recede across the grid
- **`hud.ts`** - HUD display (scoop budget, wave count, level info)
- **`tide-hud.ts`** - Tide mode HUD display (wave count, sand, countdown, best score)
- **`screen-overlays.ts`** - Banners, level complete, game over overlays
- **`castle-tile.ts`** - Castle tile rendering

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
    [{ "type": "wall", "height": 3 }, { "type": "hole", "height": -2, "puddleDepth": 1.5 }, { "type": "tower", "height": 15 }],
    [{ "type": "flat", "height": 0 }, { "type": "flat", "height": 0 }, { "type": "flat", "height": 0 }]
  ],
  "columnHeights": [3.2, 2.8, 4.1]
}
```

- `castle` - castle grid position and dimensions.
- `cells` - 2D grid, row-major. Each cell has `type` (flat/wall/hole/tower), `height`, and optional fields (e.g. `puddleDepth` for holes).
- `columnHeights` - per-column wave heights from last wave (empty array if no wave has run).

A debug script exists in tools/replay-wave.ts that can be used to debug a game. Once the player provides you the debug output you can run it like this:

```bash
echo '<JSON>' | ./tools/replay-wave.ts
```

You do not need npx or tsx to run this script. Node supports running typescript directly.

## Vite Config Notes

- Custom plugin externalizes `.tsx` Tiled tileset files (avoids React/JSX conflict)
- Excalibur excluded from dep optimization (CJS/ESM issue)
- Assets not inlined (`assetsInlineLimit: 0`) due to Excalibur XML limitation
- `base: './'` for relative paths

## Temporary files

Use `./.tmp` for temporary files instead of `/tmp`.

## No worktrees

This repo is not set up for git worktrees so always work on the current branch / checkout.
