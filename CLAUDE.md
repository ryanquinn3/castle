# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Gameplay Overview

Wave defense game. Each level has two phases:

1. **Planning phase** - player spends a scoop budget to reshape terrain (dig holes, build walls)
2. **Wave phase** - water advances column-by-column from the top of the grid downward

**Core mechanic**: Each scoop lowers one tile by 1 elevation and raises another by 1. Holes absorb/reduce incoming wave height; walls block or reduce it. Water that reaches the castle tile ends the game.

**Wave/elevation interaction**: Wave height tracks per column. A wall of height W reduces wave by W (blocks fully if W >= wave height). A hole of depth D reduces wave by D (absorbs fully if D >= wave height).

Full design doc: `docs/gameplay.md`. All project docs live in `docs/`.

**Key configurable constants** (all in one place, to be determined):
- `GRID_WIDTH` / `GRID_HEIGHT` (20×30)
- `MAX_ELEVATION` (10)
- `SCOOP_START` / `SCOOP_INCREMENT` (10, +2/level)
- `WAVE_HEIGHT_START` / `WAVE_HEIGHT_INCREMENT` (1, +1/level)

## Task Tracking

All work is tracked in `TASKS.md` at the repo root. Subagents should read it to find unclaimed tasks (`[ ]`), mark them `[~]` before starting, and `[x]` when complete.

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Type-check + production build
npm run serve        # Preview production build at localhost:4173
npm test             # Build + run Playwright visual regression tests
npm run test:integration-update  # Rebuild snapshot baselines
```

## Architecture

This is a minimal Excalibur.js game (TypeScript + Vite). The structure follows Excalibur conventions:

- **`src/main.ts`** - Creates the `Engine` (800x600, pixel-art mode, FadeInOut transition), registers scenes, starts the game
- **`src/resources.ts`** - Centralizes all asset loading; exports a `Resources` object and `loader` to pass to `engine.start()`
- **`src/level.ts`** - Scene class (`MyLevel extends Scene`); `onInitialize` adds actors to the scene
- **`src/player.ts`** - Actor class (`Player extends Actor`); handles graphics, actions, and events

**Adding to the game:**
- New actors: create a class extending `Actor`, add to scene in `level.ts`
- New assets: register in `resources.ts`, use `ImageSource` for images
- New scenes: create a class extending `Scene`, register with engine in `main.ts`

## Testing

Tests are Playwright visual regression tests only (no unit tests). They build the game, start the preview server, click the Excalibur play button (`#excalibur-play`), then compare a screenshot against stored baselines in `tests/main.spec.ts-snapshots/`. Update baselines with `npm run test:integration-update`.

## Vite Config Notes

- Custom plugin strips the `.tsx` extension from Tiled tilemap imports (avoids React conflicts)
- Excalibur is excluded from Vite's dep optimization (CJS/ESM issue)
- Assets are not inlined (`assetsInlineLimit: 0`) due to an Excalibur XML limitation
- `base: './'` enables relative paths for itch.io deployments
