# Sand-layer gradient overlay design

## Goal

Preserve the existing moist-sand `TileMap` rendering while replacing directional boundary sprites with a softer 24x24 wet-sand fade at cleared cell edges.

The visual target:

- moist sand still comes from the current `SandLayer` tilemap
- a cleared cell still fully reveals the wet base map underneath
- the hard 16x16 moist/cleared seam is softened by a radial gradient that extends 4px into N/E/S/W neighbors
- overlap between neighboring cleared cells is handled in one shared canvas, not one actor per stamp

## Constraints

- Keep the current binary sand state model: `"moist" | "cleared"`
- Preserve existing wave semantics: `coverCell(col, row)` is permanent and idempotent
- Preserve the initial moist-sand tilemap architecture instead of replacing it with a full custom-rendered sand canvas
- Do not add wave-intensity driven behavior in this change

## Recommended approach

Use a hybrid renderer:

1. Keep the current Excalibur `TileMap` for moist sand tiles.
2. Keep clearing the center tile's graphic when that cell becomes cleared.
3. Add one overlay `Actor` backed by one Excalibur `Canvas`, aligned to the sand tilemap.
4. In the new render mode, repaint that overlay canvas from `states`, drawing one 24x24 radial wet-sand stamp centered on each cleared cell.

This preserves the existing map-aligned moist sand, reveals the wet base map through cleared centers, and uses the overlay only to soften neighboring moist edges.

## Rejected alternatives

### Full-canvas mask renderer

Render the whole moist sand layer into one custom canvas and punch cleared cells out with `destination-out`.

Rejected because it forks away from the current `TileMap` rendering. It also duplicates work the tilemap already does well.

### Per-cell overlay actors

Spawn one 24x24 overlay graphic per cleared cell.

Rejected because overlap, z-order, and refresh complexity all scale with the number of cleared cells. One shared canvas is simpler and more stable.

## Architecture

`SandLayer` keeps ownership of both pieces of rendering:

- the existing moist-sand `TileMap`
- a new overlay actor/canvas above that tilemap

The current `states` array remains the source of truth.

## Rendering behavior

### Shared rules

- Rows above the initial moist region remain empty.
- A cleared cell never renders a moist tile graphic.
- `refresh()` fully rebuilds the visible sand state from `states`.
- `reset()` restores the current initial shoreline.

### Gradient mode

Revised behavior:

- moist cells render the plain moist tile sprite
- cleared cells clear their tile graphic completely
- the overlay canvas is cleared and repainted after any state change
- one radial gradient stamp is drawn per cleared cell

Stamp geometry:

- stamp size: 24x24 source pixels
- brush radius: 12px
- center point: center of the cleared 16x16 tile
- effective overhang: 4px beyond each tile edge

Stamp intent:

- the central area mostly sits on already-cleared space, where the wet base map is visible
- the outer ring softens the boundary by tinting neighboring moist tiles with a wet-sand fade

## Gradient recipe

Initial tuning target:

```ts
const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12);
gradient.addColorStop(0, "rgba(28, 61, 90, 0.35)");
gradient.addColorStop(0.3, "rgba(28, 61, 90, 0.35)");
gradient.addColorStop(1, "rgba(28, 61, 90, 0)");
```

Notes:

- The exact RGBA can be tuned to better match the wet sand already present in the base map.
- This is a paint overlay, not a true alpha mask against the tilemap. The cleared center comes from removing the tile graphic, not from canvas compositing against the `TileMap`.
- Overlapping stamps should accumulate naturally on the shared canvas.

## Data flow

`coverCell(col, gameRow)` remains the wave-driven entry point.

Behavior:

1. Ignore out-of-range coordinates.
2. Ignore cells already marked `"cleared"`.
3. Change state from `"moist"` to `"cleared"`.
4. Repaint the visible representation.

Repaint strategy:

- Tile graphics can still be updated locally, but the shared overlay should be rerendered from all current cleared cells to avoid stale overlap artifacts.

`refresh()` should also rerender the full overlay so later shorter waves do not regress prior deeper clear regions.

## Layering

Suggested draw order:

- base tiled wet sand map at its current z
- `SandLayer` tilemap at current `SAND_LAYER_Z`
- shared gradient overlay actor slightly above `SAND_LAYER_Z`
- gameplay actors remain unchanged

The overlay actor should share the same `mapX`, `mapY`, and `tileScale` as the sand tilemap so source-pixel alignment stays exact.

## Testing

Keep the existing `SandLayer` state/behavior tests focused on the gradient renderer.

Add focused tests for:

- cleared cells remove their tile graphic completely
- moist cells below the shoreline still render the plain moist sprite
- `refresh()` and `reset()` rebuild the overlay state from `states`
- the overlay canvas/actor exists and is reused
- clearing new cells after earlier deeper clears rerenders overlay without regressing prior cleared coverage

Avoid brittle pixel-perfect assertions at first. Prefer structural assertions about state transitions, tile graphic presence, and overlay lifecycle.

## Out of scope

- wave-intensity dependent opacity
- dynamic animated moisture during active wave motion
- true tilemap masking or render-to-texture grouping
- diagonal- or contour-aware brush shaping beyond simple radial overlap
- broader sand-layer refactors unrelated to the gradient renderer

## Success criteria

- The initial moist shoreline still uses the current tilemap-based sand layer.
- In `wetPaint` mode, directional edge sprites are no longer needed to achieve a softened sand boundary.
- A cleared tile fully reveals the wet base map under that tile.
- Neighboring moist tiles receive a soft 4px wet fade from the 24x24 shared-canvas stamp.
- Overlapping cleared cells blend through one shared overlay canvas without actor proliferation.
- Existing wave-driven permanent clear behavior is preserved.
