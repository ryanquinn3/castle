# Toolbar Below Grid

## Problem

The toolbar floats over the bottom rows of the play grid. With the smaller
grid those rows are now valuable. The toolbar must move out of the playfield.

## Goals

- Tool slots sit directly below the grid, not overlapping any tiles.
- Slots are left-aligned to the grid's left edge.
- A small "Build Tools" label floats inside the grid's bottom-left corner.
- The grid still fits the viewport. Tile size shrinks only when needed to
  make room for the toolbar.

## Layout

- Slots row: top edge at `sandBottom + 6px`, left edge at `gridLeft`.
- Slots dimensions: 48px slot height + 8px container padding x2 = 64px.
  Reserve 70px including the 6px gap.
- Floating label: bottom-left corner at `(gridLeft + 4, sandBottom - 4)`.
  Same dark pill style as today.

## `computeLayout` conditional shrink

Add `TOOLBAR_RESERVED_HEIGHT = 70`.

```ts
const unconstrainedTile = Math.min(
  Math.floor((vw - PADDING * 2) / GRID_WIDTH),
  Math.floor((vh - HUD_TOP - PADDING * 2) / TILEMAP_ROWS),
);
const constrainedTile = Math.min(
  Math.floor((vw - PADDING * 2) / GRID_WIDTH),
  Math.floor((vh - HUD_TOP - PADDING * 2 - TOOLBAR_RESERVED_HEIGHT) / TILEMAP_ROWS),
);
const unconstrainedMapHeight = TILEMAP_ROWS * unconstrainedTile;
const unconstrainedMapTop = HUD_TOP + Math.floor((vh - HUD_TOP - unconstrainedMapHeight) / 2);
const unconstrainedSandBottom = unconstrainedMapTop + TILEMAP_ROWS * unconstrainedTile;
const fits = unconstrainedSandBottom + TOOLBAR_RESERVED_HEIGHT + PADDING <= vh;
const tileSize = Math.max(16, Math.min(36, fits ? unconstrainedTile : constrainedTile));
```

When shrinking, center the grid+toolbar unit by computing `mapTop` against
`vh - TOOLBAR_RESERVED_HEIGHT` instead of full `vh`.

## DOM and CSS

- `toolbar.ts`: drop `--toolbar-center-x`. Add `--toolbar-left`,
  `--label-left`, `--label-bottom`. Compute from `gridLeft` and `sandBottom`.
- `toolbar.css`: replace `.toolbar` centering with left-aligned absolute
  positioning. Add `.toolbar__floating-label` with its own position vars.
  Drop the old `.toolbar__label` block.
- `ToolbarComponent.tsx`: return a Fragment with two absolutely-positioned
  siblings (label + slots). No shared wrapper needed.

## Disabled state

Apply `--disabled` only to the slots group. The label stays visible as a
static caption since it carries no interaction.

## Tests

- `computeLayout` unit tests: tall viewport (no shrink), short viewport
  (shrink kicks in).
- Visual check via dev server at a couple of viewport heights.

## Out of scope

- Rebalancing HUD or sand counter placement.
- Changes to tool icons or interactions.
