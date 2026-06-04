# Sand Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a moist-sand decoration layer (using `beach_tileset.png`) that sits above the base wet-sand tilemap, with rows 0-1 empty, row 2 showing a wet/moist transition tile, and rows 3+ showing moist sand.

**Architecture:** A new programmatic Excalibur `TileMap` at z=-0.5 is created as `SandLayer` and added to both sessions after the existing tiledMap setup. Flat terrain `Tile` actors are transparent at elevation=0, so the moist sand shows through. The `clearCell(col, gameRow)` method (added for a follow-up feature) removes sprites from individual tiles via `tile.clearGraphics()`.

**Tech Stack:** Excalibur.js `TileMap`, `SpriteSheet.fromImageSource`, Vitest unit tests.

---

### Task 1: Register the beach tileset as a resource

**Files:**
- Modify: `src/resources.ts`

**Step 1: Add the ImageSource and loader entry**

In `src/resources.ts`, add `BeachTileset` to the `Resources` object and to the `loader` array:

```ts
export const Resources = {
  // ... existing entries ...
  BeachTileset: new ImageSource('./images/beach_tileset.png'),
} as const;

export const loader = new Loader([
  // ... existing entries ...
  Resources.BeachTileset,
  tiledMap,
]);
```

**Step 2: Verify build passes**

```bash
node --run build
```
Expected: exits 0 with no type errors.

**Step 3: Commit**

```bash
git add src/resources.ts
git commit -m "feat: register beach tileset image resource"
```

---

### Task 2: Create SandLayer

**Files:**
- Create: `src/view/sand-layer.ts`
- Create: `src/view/sand-layer.test.ts`

#### Background: tileset layout

`beach_tileset.png` is 192×160px. At 16×16 tiles that is **12 columns × 10 rows** (0-indexed).

| Sprite | Tileset col | Tileset row |
|--------|-------------|-------------|
| Moist sand | 1 | 9 (last row) |
| Transition (wet→moist) | 2 | 3 |

The `TileMap` mirrors the full TMX map area: `GRID_WIDTH` columns × `TILEMAP_ROWS` rows. Tilemap row 0 is the ocean strip (above the game grid). Game row `r` = tilemap row `r + TILEMAP_OCEAN_ROWS`.

| Tilemap row | Game row | Sprite |
|-------------|----------|--------|
| 0 | -1 (ocean) | none |
| 1 | 0 | none |
| 2 | 1 | none |
| 3 | 2 | transition |
| 4–16 | 3–15 | moist sand |

**Step 1: Write the failing test**

Create `src/view/sand-layer.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { ImageSource, TileMap } from 'excalibur';
import { SandLayer } from './sand-layer.ts';

function makeStubImage(): ImageSource {
  return { isLoaded: () => false } as unknown as ImageSource;
}

function makeStubScene() {
  const added: unknown[] = [];
  return {
    add: (item: unknown) => { added.push(item); },
    added,
  } as unknown as { add: (item: unknown) => void; added: unknown[] } & import('excalibur').Scene;
}

describe('SandLayer', () => {
  test('adds a TileMap to the scene', () => {
    const scene = makeStubScene();
    new SandLayer(scene, 0, 0, 1, makeStubImage());
    expect((scene as unknown as { added: unknown[] }).added).toHaveLength(1);
  });

  test('clearCell does not throw for in-bounds game rows', () => {
    const scene = makeStubScene();
    const layer = new SandLayer(scene, 0, 0, 1, makeStubImage());
    expect(() => layer.clearCell(0, 3)).not.toThrow();
    expect(() => layer.clearCell(15, 15)).not.toThrow();
  });

  test('clearCell does not throw for out-of-bounds rows', () => {
    const scene = makeStubScene();
    const layer = new SandLayer(scene, 0, 0, 1, makeStubImage());
    expect(() => layer.clearCell(0, -1)).not.toThrow();
    expect(() => layer.clearCell(0, 99)).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
node --run test:unit -- sand-layer
```
Expected: FAIL — module not found.

**Step 3: Implement `src/view/sand-layer.ts`**

```ts
import { TileMap, SpriteSheet, vec, type ImageSource, type Scene } from 'excalibur';
import { GRID_WIDTH, TILEMAP_ROWS, TILEMAP_OCEAN_ROWS } from '../config.ts';

const TILED_TILE_SIZE = 16;
const TILESET_COLS = 12;
const TILESET_ROWS = 10;
const MOIST_COL = 1;
const MOIST_ROW = 9;
const TRANSITION_COL = 2;
const TRANSITION_ROW = 3;
const TRANSITION_GAME_ROW = 2;
const MOIST_START_GAME_ROW = 3;

export class SandLayer {
  private tilemap: TileMap;

  constructor(
    scene: Scene,
    mapX: number,
    mapY: number,
    tileScale: number,
    image: ImageSource,
  ) {
    this.tilemap = new TileMap({
      tileWidth: TILED_TILE_SIZE,
      tileHeight: TILED_TILE_SIZE,
      columns: GRID_WIDTH,
      rows: TILEMAP_ROWS,
    });
    this.tilemap.pos = vec(mapX, mapY);
    this.tilemap.scale = vec(tileScale, tileScale);
    this.tilemap.z = -0.5;

    const spriteSheet = SpriteSheet.fromImageSource({
      image,
      grid: {
        rows: TILESET_ROWS,
        columns: TILESET_COLS,
        spriteWidth: TILED_TILE_SIZE,
        spriteHeight: TILED_TILE_SIZE,
      },
    });

    const moistSprite = spriteSheet.getSprite(MOIST_COL, MOIST_ROW);
    const transitionSprite = spriteSheet.getSprite(TRANSITION_COL, TRANSITION_ROW);

    for (let tilemapRow = 0; tilemapRow < TILEMAP_ROWS; tilemapRow++) {
      const gameRow = tilemapRow - TILEMAP_OCEAN_ROWS;
      for (let col = 0; col < GRID_WIDTH; col++) {
        const tile = this.tilemap.getTile(col, tilemapRow);
        if (!tile) {
          continue;
        }
        if (gameRow === TRANSITION_GAME_ROW && transitionSprite) {
          tile.addGraphic(transitionSprite);
        } else if (gameRow >= MOIST_START_GAME_ROW && moistSprite) {
          tile.addGraphic(moistSprite);
        }
      }
    }

    scene.add(this.tilemap);
  }

  clearCell(col: number, gameRow: number): void {
    const tilemapRow = gameRow + TILEMAP_OCEAN_ROWS;
    const tile = this.tilemap.getTile(col, tilemapRow);
    tile?.clearGraphics();
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
node --run test:unit -- sand-layer
```
Expected: 3 passing.

**Step 5: Verify build**

```bash
node --run build
```
Expected: exits 0.

**Step 6: Commit**

```bash
git add src/view/sand-layer.ts src/view/sand-layer.test.ts
git commit -m "feat: add SandLayer tilemap for moist sand decoration"
```

---

### Task 3: Wire SandLayer into LevelSession and TideSession

**Files:**
- Modify: `src/level-session.ts`
- Modify: `src/tide-session.ts`

**Step 1: Update `LevelSession.onInitialize`**

In `src/level-session.ts`, import `SandLayer` and `Resources`, then instantiate after the tiledMap block:

```ts
import { SandLayer } from './view/sand-layer.ts';
```

Inside `onInitialize`, immediately after the `for (const layer of tiledMap.getTileLayers()) { ... }` block:

```ts
new SandLayer(this, mapX, mapY, tileScale, Resources.BeachTileset);
```

**Step 2: Update `TideSession.onInitialize`**

Same change in `src/tide-session.ts`:

```ts
import { SandLayer } from './view/sand-layer.ts';
```

After the tiledMap layer loop:

```ts
new SandLayer(this, mapX, mapY, tileScale, Resources.BeachTileset);
```

**Step 3: Verify build and unit tests**

```bash
node --run build && node --run test:unit
```
Expected: both pass.

**Step 4: Visual verification**

Open the dev server in a browser and confirm:
- Rows 0-1 of the game grid: no moist sand (wet base layer visible)
- Row 2: transition tile (slightly different texture)
- Rows 3+: moist sand texture overlaying the wet base

**Step 5: Commit**

```bash
git add src/level-session.ts src/tide-session.ts
git commit -m "feat: wire SandLayer into LevelSession and TideSession"
```

---

## Notes

- If sprites appear wrong (wrong tile cut), verify tileset dimensions: `python3 -c "from PIL import Image; img=Image.open('public/images/beach_tileset.png'); print(img.size)"` should print `(192, 160)`. At 16×16 that's 12 cols × 10 rows. If the tileset uses a different tile size, update `TILESET_COLS`, `TILESET_ROWS`, `MOIST_ROW`, and `TRANSITION_ROW` in `sand-layer.ts`.
- The `clearCell` method is intentionally minimal — it's the hook for the water interaction follow-up. No additional logic needed here.
