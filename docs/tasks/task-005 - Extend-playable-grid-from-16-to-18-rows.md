---
id: TASK-005
title: Extend playable grid from 16 to 18 rows
status: Done
assignee:
  - '@claude'
created_date: '2026-06-17 15:47'
updated_date: '2026-06-17 16:19'
labels:
  - gameplay
dependencies: []
references:
  - src/config.ts
  - public/map/new-map/map.tmx
  - docs/gameplay.md
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grow the playable game grid height from 16 to 18 rows (width stays 16) so the board feels less cramped. Split the two new rows around the castle: one extra beach row in front, one behind. Edit the Tiled map directly to match. The audit (research/ecs-pattern-audit) confirmed the wave sim, rendering, layout math, and serialization all derive from the dimension constants with no square-grid assumptions, so this is a low-risk parameter change plus a tilemap edit. Also remove the brittle config.test.ts (asserts an exact tileSize magic number, violates testing guidelines) and the unreferenced legacy public/map/map.tmx.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Playable grid is 18 rows tall and 16 wide: GRID_HEIGHT=18 and TILEMAP_ROWS=19 in src/config.ts (TILEMAP_SAND_ROWS recomputes to 18)
- [x] #2 Castle sits at CASTLE_ROW=12, leaving 12 beach rows in front and 4 behind; castle remains placeable and edit-guarded
- [x] #3 public/map/new-map/map.tmx has both layers height=19 with 18 sand rows of 4s plus the ocean row, water layer extended with matching 0 rows, and the tilemap renders aligned to the grid with no gap or overflow
- [x] #4 src/config.test.ts and public/map/map.tmx are deleted and nothing references the removed map path
- [x] #5 docs/gameplay.md reflects GRID_HEIGHT=18, CASTLE_ROW=12, and the castle position prose (row 11 -> row 12)
- [x] #6 node --run static-check passes
- [x] #7 Change lands as an atomic git commit on a feat/ branch
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Single atomic change on feat/extend-grid-18-rows. The config constants and the .tmx layer data are coupled (the grid must match the tilemap), so they land together.

1. Branch: create/switch to feat/extend-grid-18-rows (currently on research/ecs-pattern-audit).

2. src/config.ts:
   - GRID_HEIGHT 16 -> 18
   - TILEMAP_ROWS 17 -> 19 (TILEMAP_SAND_ROWS derives to 18, matching GRID_HEIGHT)
   - CASTLE_ROW 11 -> 12 (split: +1 beach row in front, +1 behind)

3. public/map/new-map/map.tmx (edit directly):
   - <map> element height 17 -> 19 (leave the pre-existing stale width=18 vs layer width=16 alone; runtime reads layer dims, not map dims)
   - 'base sand' layer: height 17 -> 19; append two rows of sixteen 4s after the existing sand rows (row 0 stays all 0 = ocean gap, then 18 rows of 4)
   - 'water' layer: height 17 -> 19; append two rows of sixteen 0s (row 0 stays the 1,2 ocean pattern)

4. Deletions:
   - rm src/config.test.ts (brittle: asserts tileSize===36 exact magic number; also computeLayout has no other behavioral coverage worth keeping per testing.md)
   - rm public/map/map.tmx (unreferenced; resources.ts loads only ./map/new-map/map.tmx; dist/ copies are build output)

5. docs/gameplay.md:
   - line ~21: '2x2 castle fixed at column 7, row 11' -> 'row 12'
   - Configurable Constants table: GRID_HEIGHT 16 -> 18, CASTLE_ROW 11 -> 12

6. Verify: node --run static-check (lint + typecheck + unit + browser). The wave-field-runtime-*.browser.test.ts and grid-model.browser.test.ts fixtures use their own self-contained dims/castleRow and do not import the production constants, so they should stay green; sand-layer.browser.test.ts reads TILEMAP_ROWS/GRID_WIDTH and auto-adapts. Fix any fallout, then re-run.
   - Manual eyeball: load the app, confirm 18 sand rows render, tilemap aligns to the grid, castle at rows 12-13, wave reaches the new top row.

7. Commit atomically.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extended the playable grid from 16 to 18 rows (width unchanged at 16).

Changes:
- src/config.ts: GRID_HEIGHT 16→18, TILEMAP_ROWS 17→19, CASTLE_ROW 11→12; TILEMAP_SAND_ROWS auto-derives to 18. TOOLBAR_RESERVED_HEIGHT un-exported (internal use only).
- public/map/new-map/map.tmx: map height 17→19, both layers height 17→19; added 2 sand rows (4s) to base-sand layer and 2 zero rows to water layer.
- public/map/map.tmx: deleted (unreferenced legacy map).
- src/config.test.ts: deleted (brittle assertion on tileSize magic number; violated testing guidelines).
- docs/gameplay.md: grid size prose, castle row prose, and configurable constants table updated.

Castle now sits at row 12 with 12 beach rows in front and 4 behind.

Tests: node --run static-check passes (tsc, lint, unit, knip, browser all green).
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->
