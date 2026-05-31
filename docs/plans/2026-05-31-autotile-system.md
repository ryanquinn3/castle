# Autotile System Design

## Goal

Make adjacent walls and towers look visually connected instead of showing individual tile borders. A row of walls should look like one continuous battlement. A tower next to a wall should seamlessly join.

## Sprite approach

- All terrain sprites normalized to **64x64** with no transparent padding
- Each terrain type that supports autotiling gets a **16-variant spritesheet** (4x4 grid, 4px margin between sprites)
- Variant index = 4-bit neighbor mask: `top(8) | right(4) | bottom(2) | left(1)`
- Neighbor detection is **cross-type**: a wall next to a tower counts as a neighbor for both

### Wall tiers - height-proportional sprites

Each tier's sprite occupies a different vertical portion of the 64x64 tile (bottom-aligned, transparent above):

- **Tier 1 (height 1-5)**: ~25% fill, low sand ridge
- **Tier 2 (height 6-10)**: ~50% fill, proper wall
- **Tier 3 (height 11-15)**: ~75% fill, tall wall
- **Tier 4 (height 16-20)**: ~90%+ fill, full wall with battlements

This gives instant visual feedback about wall strength. Within each tier, tinting can still show finer height differences.

### Wall autotile variants (per tier)

- **No neighbors (0)**: standalone wall with borders on all sides
- **Has neighbor on edge**: that edge becomes seamless (texture extends to edge)
- **Top neighbor**: only relevant for taller tiers where the wall reaches near the top of the tile
- **Bottom neighbor**: base edge cleaned up
- **Left/right neighbor**: side borders removed, texture extends to fill

### Tower variants

- **No neighbors (0)**: distinct tower shape, slightly wider than current but still recognizably a tower
- **Has neighbor on side (1-15)**: full-width connected variant, tower body extends to fill that edge, connecting with adjacent wall/tower
- Two visual modes: standalone (mask 0) vs connected (masks 1-15)

### Neighbor rules

- Walls connect with walls and towers
- Towers connect with walls and towers
- Holes do NOT participate in autotile neighbor detection

## Code changes

### Model layer

- `GridModel` needs a method to compute neighbor flags for a cell, checking if adjacent cells are "connectable" terrain (Wall or Tower)
- Terrain types get a `connectsTo(other: Terrain): boolean` method or similar

### Render layer

- `resources.ts`: load spritesheet `ImageSource` per autotile set
- `terrain.ts`: `getRenderInfo()` accepts neighbor flags, returns the correct sprite from the spritesheet
- `tile.ts`: passes neighbor flags to `getRenderInfo()`, uses `SpriteSheet.fromImageSource()` to pick the right variant

### Excalibur spritesheet usage

```ts
const wallSheet = SpriteSheet.fromImageSource({
  image: Resources.WallLevel4Sheet,
  grid: {
    rows: 4,
    columns: 4,
    spriteWidth: 64,
    spriteHeight: 64,
  },
  spacing: {
    margin: { x: 4, y: 4 },
  },
});

// Get variant by neighbor mask
const sprite = wallSheet.getSprite(mask % 4, Math.floor(mask / 4));
```

## Asset pipeline

- `tools/make-autotile-sheet.py`: uv script that composites 16 variants from a source sprite
- Source sprites need to be redrawn/adjusted to be full-bleed 64x64 first
- The script handles edge removal/extension for each variant

## Decisions made

- Standalone towers (mask 0) keep a distinct tower shape, slightly wider than current
- Connected towers (masks 1-15) switch to full-width variant
- Wall tiers have height-proportional sprites (shorter = lower tier) instead of same-height + tint
- Holes stay independent from autotile

## Open questions

- Exact height proportions per tier (25/50/75/90 or different?)

## Resolved

- Only tier 4 gets battlements
- Cross-tier adjacency shows the height step -- each tile extends its own texture to the edge independently, so the step is visible
