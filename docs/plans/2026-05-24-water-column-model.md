# Water column model refactor

Fixes the overtopped-hill visual bug (docs/bugs/overtopped-hill-water-visual.md) by replacing the flat `number[]` water representation with a `WaterColumn` class that tracks both where water sits and how deep it is.

## Problem

`EqualizingRowSolver.settle()` zeroes all positive-elevation cells after equalization to prevent lateral spread to neighboring hills. This also removes water from overtopped hills in the animation snapshots, creating a visual gap where water appears on both sides of a hill but not on the hill itself.

The deeper issue: the simulation only tracks water height as a single number. It has no concept of what elevation the water is flowing at, so it can't distinguish "2 units of water on the ground" from "2 units of water flowing over a height-5 wall." This also means terrain slope is handled as an ad-hoc elevation addition rather than what it actually is: the ground rising.

## WaterColumn class

New class in `src/model/flow-field.ts` (or a dedicated file if it gets large enough).

Two stored values, one derived:

- **`floorLevel`**: elevation the water sits on top of. Starts at 0 for an incoming wave on flat ground. Rises when the water hits a wall or the terrain slopes up.
- **`surfaceLevel`**: absolute top of the water column. This is what gets compared against wall heights.
- **`depth`** (getter): `surfaceLevel - floorLevel`. The actual thickness of water. This is what the renderer uses for tint intensity.

### Methods

**`applyTerrain(elevation: number): WallEvent`**

Three cases based on where the wall sits relative to the water:

1. `elevation >= surfaceLevel`: blocked. Water can't get over. Depth becomes 0.
2. `elevation > floorLevel` but `< surfaceLevel`: overtopped. The wall raises the floor but doesn't stop the water. `floorLevel = elevation`, surfaceLevel unchanged, depth shrinks.
3. `elevation <= floorLevel`: pass-through. The terrain is below where the water is already flowing. `floorLevel` drops to `max(elevation, 0)`. Surface unchanged, depth grows.

**`advanceRow(terrainSlope: number): void`**

Raises `floorLevel` by `terrainSlope`. If `floorLevel >= surfaceLevel`, the water is gone (terrain absorbed it). This replaces the current `effectiveElev = terrainSlope + rawElev` pattern with a model where the ground genuinely rises each row.

**`isEmpty(): boolean`**

Returns `depth <= 0`.

## Solver changes

### EqualizingRowSolver

The `settle()` method changes from `number[]` to `WaterColumn[]` input/output.

The post-equalization zeroing loop (lines 156-159) is deleted. Instead, equalization skips positive-elevation cells entirely. Water on an overtopped hill stays put; equalization only moves water between flat/hole cells.

During equalization, surface comparison uses `WaterColumn.surfaceLevel` directly. When water transfers between cells, it adjusts `surfaceLevel` (moving depth) while each cell keeps its own `floorLevel`. A hole cell naturally attracts water because its surface is lower even with the same depth.

The blocked-water redistribution logic at the top of `settle()` simplifies since terrain interaction is already captured in the WaterColumn state rather than separate `blocked`/`blockedWater` arrays.

### LegacyRowSolver

Left as-is. No investment needed since it's not the active solver.

## simulateAdvance changes

`currentHeights` becomes `WaterColumn[]`. Each row:

1. Call `column.advanceRow(terrainSlope)` to apply slope (floor rises, depth shrinks)
2. Call `column.applyTerrain(rawElev)` for wall interaction (returns WallEvent)
3. Pass the row's `WaterColumn[]` to the solver for lateral equalization
4. Write `column.depth` into the snapshot (this drives the renderer's tint)
5. Carry forward the `WaterColumn[]` to the next row

## simulateRecede changes

Same model, reversed direction. Water columns carry `floorLevel` north as they drain.

## What stays the same

- Snapshot format: still `number[][][]` of depth values, so `WaveRenderer` needs no changes
- `WaveResult` interface: unchanged
- `wave-simulation.ts`: unchanged (it just calls simulateAdvance/simulateRecede)
- Hole absorption logic: still operates on depth values

## How this fixes the bug

Overtopped hills now have `depth > 0` in snapshots because `applyTerrain` sets `floorLevel = wallHeight` and preserves `surfaceLevel`. The solver skips them during equalization. No zeroing, no visual gap. The depth value drives the tint, so the renderer shows water with color proportional to how much water cleared the hill.
