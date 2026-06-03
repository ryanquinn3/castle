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

1. **Planning phase** - player spends a scoop budget to reshape terrain (dig holes, build walls, place towers)
2. **Wave phase** - water advances from the top of the grid downward; terrain elevation reduces wave height

**Core mechanic**: Each scoop lowers one tile by 1 elevation and raises another by 1. Walls reduce incoming wave height; holes absorb it. Towers cost 15 sand, have fixed height 15, and erode 10x slower than walls. Water that reaches the castle tile ends the game.

Full design doc: `docs/gameplay.md`.

## Commands

A dev server is always running in the background. Do not start one.

These static checks are automatically run before committing. You do not need to run them ad-hoc if you are intending to commit.
```bash
node --run build      # tsc + vite build
node --run lint      # linter
node --run test:unit  # Vitest unit tests only
```

## Architecture

Excalibur.js game (TypeScript + Vite).

### Core files

**Keep this list up to date when making core changes**

- **`src/main.ts`** - Creates the Engine (FillScreen, pixel-art), registers scenes (`title`, `game`, `tide`), starts the game
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

### View layer (`src/view/`)

- **`grid-view.ts`** - Renders the grid of tiles from GridModel state
- **`tile.ts`** - Individual tile actor; delegates rendering to `Terrain.getRenderInfo()` and caches the resulting `Canvas` graphic keyed by the terrain's `cacheKey`
- **`planning-phase.ts`** - Coordinates planning state, HUD text, tool selection, wave reach indicator, and digging strategy lifecycle
- **`digging-strategy.ts`**, **`single-cell-digging.ts`**, **`drag-digging.ts`** - Planning input strategies for shovel/wall/tower interactions
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

**Unit tests**: Vitest files co-located with source (`*.test.ts`). Run with `node --run test:unit`.

## Debug Serialization

Press **D** at any time to copy the board state as JSON to the clipboard. The format:

```json
{
  "castle": { "col": 10, "row": 15, "width": 2, "height": 2 },
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
