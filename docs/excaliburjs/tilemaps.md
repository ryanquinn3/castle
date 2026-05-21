# Excalibur.js Isometric Tile Maps

Source: https://excaliburjs.com/docs/isometric

Isometric tilemaps (2.5D) simulate a 45-degree camera view. In Excalibur, the x-axis moves down the top-right edge, the y-axis moves down the top-left edge.

## IsometricMap Basics

`IsometricMap` represents a single layer. Tiles start invisible (no graphics attached).

```typescript
const isoMap = new ex.IsometricMap({
  pos: ex.vec(250, 10),
  tileWidth: 32,
  tileHeight: 16,
  columns: 5,
  rows: 5,
});
game.currentScene.add(isoMap);
```

### Constructor Options

- `pos` - world position of the map
- `tileWidth` / `tileHeight` - pixel dimensions of each tile (tileHeight is typically half of the asset height for diamond tiles)
- `columns` / `rows` - grid dimensions
- `elevation` - layer stacking index (used for multi-layer maps)
- `renderFromTopOfGraphic` - if `true`, draws graphics from top edge instead of bottom-left; useful for conceptually flat tiles

## Adding Graphics to Tiles

Load an image, create a sprite, iterate tiles:

```typescript
const image = new ex.ImageSource('./path/to/image.png');
await image.load();
const sprite = image.toSprite();

for (let tile of isoMap.tiles) {
  tile.addGraphic(sprite);
}
```

With a spritesheet:

```typescript
const sheet = SpriteSheet.fromImageSource({
  image: Resources.Tiles,
  grid: { rows: 3, columns: 6, spriteWidth: 32, spriteHeight: 32 },
});

isoMap.tiles.forEach((tile) => {
  tile.addGraphic(sheet.getSprite(0, 0));
});
```

## Layered Maps with Elevation

Multiple `IsometricMap` instances stack via the `elevation` property. Offset `pos.y` by `-tileHeight * elevation` to align visually:

```typescript
this.layers.forEach((layer, index) => {
  const isoMap = new IsometricMap({
    pos: vec(300, 184 + index * -16),
    tileWidth: 32,
    tileHeight: 16,
    columns: layer.length,
    rows: layer[0].length,
    elevation: index,
  });
  this.add(isoMap);

  isoMap.tiles.forEach((tile) => {
    const value = layer[tile.y][tile.x];
    if (value === 1) tile.addGraphic(sheet.getSprite(0, 0));
    if (value === 2) tile.addGraphic(sheet.getSprite(3, 0));
    if (value === 3) tile.addGraphic(sheet.getSprite(5, 0));
  });
});
```

## Coordinate Conversion

### Tile to World

```typescript
const worldPos = isoMap.tileToWorld(ex.vec(0, 0));
```

### World to Tile

```typescript
game.input.pointers.on('move', (evt) => {
  const tileCoord = isoMap.worldToTile(evt.worldPos);
});
```

## Colliders

Tiles must have `solid = true` to act as `CollisionType.Fixed` colliders. Add custom polygon colliders per tile:

```typescript
const isoMap = new ex.IsometricMap({
  tileWidth: 111,
  tileHeight: 64,
  columns: 2,
  rows: 2,
});

for (let tile of isoMap.tiles) {
  tile.solid = true;
  tile.addCollider(
    ex.Shape.Polygon([
      ex.vec(0, 95),
      ex.vec(55, -32 + 95),
      ex.vec(111, 95),
      ex.vec(55, 32 + 95),
    ])
  );
}
```

## Tiled Editor Integration

Use `@excaliburjs/plugin-tiled` to load `.tmx` files (recommended over manual tile assignment for complex maps):

```typescript
import * as tiled from '@excaliburjs/plugin-tiled';

const tiledMapResource = new tiled.TiledResource('./map.tmx');
const loader = new ex.Loader([tiledMapResource]);

game.start(loader).then(() => {
  tiledMapResource.addToScene(game.currentScene);
});
```

Query tiles from a loaded Tiled map by layer name:

```typescript
// By world position
const tile = tiledMap.getTileByPoint('ground', ex.vec(200, 100));

// By integer coordinate
const tile = tiledMap.getTileByCoordinate('ground', 0, 2);

tile.tiledTile; // Tiled metadata
tile.exTile;    // Excalibur Tile object
```
