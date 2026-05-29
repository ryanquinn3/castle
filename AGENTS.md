# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules of engagement

- Always collaborate with the user before jumping into implementation. 

## Gameplay Overview

Wave defense game. Each level has two phases:

1. **Planning phase** - player spends a scoop budget to reshape terrain (dig holes, build walls)
2. **Wave phase** - water advances from the top of the grid downward; terrain elevation reduces wave height

**Core mechanic**: Each scoop lowers one tile by 1 elevation and raises another by 1. Walls reduce incoming wave height; holes absorb it. Water that reaches the castle tile ends the game.

Full design doc: `docs/gameplay.md`.

**Important**: When making changes to gameplay, please update `gameplay.md`.

## Task Tracking

All work is tracked in `TASKS.md` at the repo root. Subagents should read it to find unclaimed tasks (`[ ]`), mark them `[~]` before starting, and `[x]` when complete.

## Commands

A dev server is always running in the background. Do not start one.

```bash
npm run dev                      # Vite dev server (already running)
npm run build                    # tsc + vite build
npm run serve                    # Preview production build
npm test                         # Unit tests + build + Playwright visual regression
npm run test:unit                # Vitest unit tests only
npm run test:unit:watch          # Vitest in watch mode
npm run test:integration-update  # Rebuild Playwright snapshot baselines
```

## Architecture

Excalibur.js game (TypeScript + Vite).

### Core files

**Keep this list up to date when making core changes**

- **`src/main.ts`** - Creates the Engine (FillScreen, pixel-art), registers scenes (`title`, `game`), starts the game
- **`src/level-session.ts`** - Level-mode scene. Owns the level loop: planning phase, wave simulation, win/loss checks
- **`src/title-scene.ts`** - Title screen
- **`src/config.ts`** - All game constants (grid size, scoop budget, wave params, tile size, layout)
- **`src/resources.ts`** - Asset loading; exports `Resources`, `loader`, and Tiled map

### Model layer (`src/model/`)

- **`terrain.ts`** - Terrain base class and subclasses (FlatGround, Hole, Wall). Each type owns its elevation, sprite, water interaction, erosion, and mutation behavior
- **`grid-model.ts`** - Grid state: `Terrain[][]` cells, pool detection, sand redistribution, projection helpers
- **`flow-field.ts`** - Flow field computation for wave spread, row solvers, pool absorption
- **`wave-simulation.ts`** - Orchestrates advance/recede passes, takes Terrain cells directly
- **`water-column.ts`** - Water column state for flow field simulation

### View layer (`src/view/`)

- **`grid-view.ts`** - Renders the grid of tiles from GridModel state
- **`tile.ts`** - Individual tile actor with elevation-based coloring
- **`planning-phase.ts`** - Handles scoop/raise input during planning
- **`wave-renderer.ts`** - Animates wave advance/recede across the grid
- **`hud.ts`** - HUD display (scoop budget, wave count, level info)
- **`screen-overlays.ts`** - Banners, level complete, game over overlays
- **`castle-tile.ts`** - Castle tile rendering

### Game modes (`src/modes/`)

- **`game-mode.ts`** - GameMode interface and GameState type
- **`level-mode.ts`** - Per-level state machine (planning, wave, between-waves)

## Testing

**Unit tests**: Vitest files co-located with source (`*.test.ts` in `src/model/` and `src/view/`). Run with `npm run test:unit`.

**Visual regression**: Playwright tests in `tests/`. Build the game, start preview server, click the Excalibur play button (`#excalibur-play`), compare screenshots against baselines in `tests/main.spec.ts-snapshots/`. Update with `npm run test:integration-update`.

## Debug Serialization

Press **D** at any time to copy the board state as JSON to the clipboard. The format:

```json
{
  "castleCol": 10,
  "castleRow": 15,
  "elevations": [[0, 3, -2], [0, 0, 0]],
  "columnHeights": [3.2, 2.8, 4.1],
  "puddleDepths": [[0, 0, 1.5], [0, 0, 0]]
}
```

- `elevations` - 2D grid, row-major. Negative = hole, positive = wall.
- `columnHeights` - per-column wave heights from last wave (empty array if no wave has run).
- `puddleDepths` - 2D grid, row-major. Water depth already absorbed in each hole. Zero for non-hole cells.
- `castleCol`, `castleRow` - castle grid position.

A debug script exists in tools/replay-wave.ts that can be used to debug a game. Once the player provides you the debug output you can run it like this:

```bash
echo '<JSON>' | ./tools/replay-wave.ts
```

You do not need npx or tsx to run this script. Node 22 supports running typescript directly.

## Vite Config Notes

- Custom plugin externalizes `.tsx` Tiled tileset files (avoids React/JSX conflict)
- Excalibur excluded from dep optimization (CJS/ESM issue)
- Assets not inlined (`assetsInlineLimit: 0`) due to Excalibur XML limitation
- `base: './'` for relative paths (itch.io deployment)

