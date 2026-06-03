# Terrain Class Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split `src/model/terrain.ts` into one file per class inside `src/model/terrain/`, with co-located tests.

**Architecture:** Each terrain subclass gets its own file and test file. Shared rendering utilities go in `utils.ts`. The abstract base class and shared types go in `terrain.ts` inside the new directory. All importers are updated to point at the specific sub-file they need — no barrel/index file.

**Circular dependency note:** `wall.ts`, `hole.ts`, and `flat-ground.ts` will have a three-way circular import (each `applyDelta` creates instances of the others). This is safe in ES modules because the classes are only used inside method bodies, not at module initialization time. TypeScript compiles this correctly.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Create `utils.ts`

Extract the three pure helper functions shared by `Wall` and `Hole` rendering.

**Files:**
- Create: `src/model/terrain/utils.ts`

**Step 1: Create the file**

```ts
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

export function elevationToColor(elevation: number): { r: number; g: number; b: number } {
  if (elevation === 0) {
    return { r: 210, g: 180, b: 140 };
  }
  if (elevation > 0) {
    if (elevation <= 5) {
      const t = (elevation - 1) / 4;
      return {
        r: lerpChannel(195, 160, t),
        g: lerpChannel(150, 110, t),
        b: lerpChannel(85, 50, t),
      };
    } else {
      const t = (elevation - 5) / 5;
      return {
        r: lerpChannel(160, 100, t),
        g: lerpChannel(110, 65, t),
        b: lerpChannel(50, 20, t),
      };
    }
  }
  const depth = -elevation;
  if (depth <= 5) {
    const t = (depth - 1) / 4;
    return {
      r: lerpChannel(130, 80, t),
      g: lerpChannel(105, 60, t),
      b: lerpChannel(75, 40, t),
    };
  } else {
    const t = (depth - 5) / 5;
    return {
      r: lerpChannel(80, 40, t),
      g: lerpChannel(60, 30, t),
      b: lerpChannel(40, 20, t),
    };
  }
}
```

Note: the return type changes from Excalibur `Color` to a plain `{ r, g, b }` object so `utils.ts` has no Excalibur dependency. Call sites in `wall.ts` and `hole.ts` already destructure `r`, `g`, `b` directly — no call-site changes needed.

**Step 2: Verify existing tests still pass**

```bash
node --run test:unit
```

Expected: all pass (nothing imports utils.ts yet).

**Step 3: Commit**

```bash
git add src/model/terrain/utils.ts
git commit -m "feat: add terrain/utils.ts with shared rendering helpers"
```

---

### Task 2: Create abstract `terrain.ts` in the new directory

Move the abstract `Terrain` class and all shared types into the new directory.

**Files:**
- Create: `src/model/terrain/terrain.ts`

**Step 1: Create the file**

Copy the following from the old `src/model/terrain.ts` verbatim — do not add or change anything:

```ts
import type { WaterColumn } from '../water-column.ts';
import type { ImageSource, Sprite } from 'excalibur';
import { Color } from 'excalibur';

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';
export type WallEvent = 'overtopped' | 'blocked' | null;

export interface SerializedTerrain {
  type: string;
  height: number;
  [key: string]: unknown;
}

export interface ErosionResult {
  newElevation: number;
}

export type Neighbors = {
  north: Terrain | null;
  south: Terrain | null;
  east: Terrain | null;
  west: Terrain | null;
};

export interface NeighborGrid {
  neighborsOf(col: number, row: number): Neighbors;
}

const NO_NEIGHBORS: Neighbors = { north: null, south: null, east: null, west: null };

export interface TileRenderInfo {
  sprite: Sprite | null;
  tint: Color | null;
  cacheKey?: string;
  customDraw?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

export abstract class Terrain {
  private grid: NeighborGrid | null = null;
  col = -1;
  row = -1;

  attach(grid: NeighborGrid, col: number, row: number): void {
    this.grid = grid;
    this.col = col;
    this.row = row;
  }

  get neighbors(): Neighbors {
    if (!this.grid) {
      return NO_NEIGHBORS;
    }
    return this.grid.neighborsOf(this.col, this.row);
  }

  connectsTo(_other: Terrain | null): boolean {
    return false;
  }

  abstract get elevation(): number;
  abstract get sprite(): ImageSource | null;
  abstract onWaterHit(column: WaterColumn, direction: CardinalDirection): WallEvent;
  abstract applyHits(count: number): ErosionResult | null;
  abstract applyDelta(amount: number): Terrain;
  abstract resetHits(): void;
  abstract serialize(): SerializedTerrain;
  abstract getRenderInfo(): TileRenderInfo;
}
```

**Step 2: Verify existing tests still pass**

```bash
node --run test:unit
```

**Step 3: Commit**

```bash
git add src/model/terrain/terrain.ts
git commit -m "feat: add terrain/terrain.ts with abstract base class and shared types"
```

---

### Task 3: Create `flat-ground.ts` and `flat-ground.test.ts`

**Files:**
- Create: `src/model/terrain/flat-ground.ts`
- Create: `src/model/terrain/flat-ground.test.ts`

**Step 1: Create `flat-ground.ts`**

```ts
import type { ImageSource } from 'excalibur';
import { Terrain, type CardinalDirection, type ErosionResult, type SerializedTerrain, type TileRenderInfo, type WallEvent } from './terrain.ts';
import type { WaterColumn } from '../water-column.ts';

export class FlatGround extends Terrain {
  get elevation(): number {
    return 0;
  }

  get sprite(): ImageSource | null {
    return null;
  }

  onWaterHit(_column: WaterColumn, _direction: CardinalDirection): WallEvent {
    return null;
  }

  applyHits(_count: number): ErosionResult | null {
    return null;
  }

  applyDelta(amount: number): Terrain {
    if (amount > 0) {
      // Defer import to avoid module initialization circularity
      const { Wall } = require('./wall.ts') as typeof import('./wall.ts');
      return new Wall(amount);
    }
    if (amount < 0) {
      const { Hole } = require('./hole.ts') as typeof import('./hole.ts');
      return new Hole(-amount);
    }
    return new FlatGround();
  }

  resetHits(): void {}

  serialize(): SerializedTerrain {
    return { type: 'flat', height: 0 };
  }

  getRenderInfo(): TileRenderInfo {
    return { sprite: null, tint: null };
  }
}
```

**Important — circular dependency pattern:** Because `Wall` → `Hole` → `FlatGround` → `Wall` is circular, use dynamic `import()` or inline requires inside `applyDelta`. However, Vite/TypeScript with ESM does not support synchronous `require()`. The idiomatic fix for ESM circular deps with class instantiation is to accept the static import and rely on the fact that class bodies execute lazily. Replace the `require` pattern above with static imports:

```ts
import type { ImageSource } from 'excalibur';
import { Terrain, type CardinalDirection, type ErosionResult, type SerializedTerrain, type TileRenderInfo, type WallEvent } from './terrain.ts';
import type { WaterColumn } from '../water-column.ts';
import { Wall } from './wall.ts';
import { Hole } from './hole.ts';

export class FlatGround extends Terrain {
  get elevation(): number { return 0; }
  get sprite(): ImageSource | null { return null; }
  onWaterHit(_column: WaterColumn, _direction: CardinalDirection): WallEvent { return null; }
  applyHits(_count: number): ErosionResult | null { return null; }

  applyDelta(amount: number): Terrain {
    if (amount > 0) { return new Wall(amount); }
    if (amount < 0) { return new Hole(-amount); }
    return new FlatGround();
  }

  resetHits(): void {}
  serialize(): SerializedTerrain { return { type: 'flat', height: 0 }; }
  getRenderInfo(): TileRenderInfo { return { sprite: null, tint: null }; }
}
```

This works because `Wall` and `Hole` are only referenced inside method bodies, never at module scope initialization.

**Step 2: Create `flat-ground.test.ts`**

Extract the `FlatGround` and `Terrain.neighbors` describe blocks from `src/model/terrain.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { FlatGround } from './flat-ground.ts';
import { Wall } from './wall.ts';
import { Hole } from './hole.ts';
import { type NeighborGrid } from './terrain.ts';
import { WaterColumn } from '../water-column.ts';

describe('Terrain.neighbors', () => {
  test('unattached terrain reports all-null neighbors', () => {
    const wall = new Wall(3);
    expect(wall.neighbors).toEqual({ north: null, south: null, east: null, west: null });
  });

  test('attach wires a NeighborGrid that resolves directions', () => {
    const north = new Wall(1);
    const fakeGrid: NeighborGrid = {
      neighborsOf: (_col: number, _row: number) => ({ north, south: null, east: null, west: null }),
    };
    const wall = new Wall(3);
    wall.attach(fakeGrid, 2, 5);
    expect(wall.col).toBe(2);
    expect(wall.row).toBe(5);
    expect(wall.neighbors.north).toBe(north);
  });
});

describe('FlatGround', () => {
  test('has elevation 0', () => {
    expect(new FlatGround().elevation).toBe(0);
  });

  test('sprite is null', () => {
    expect(new FlatGround().sprite).toBeNull();
  });

  test('onWaterHit passes water through unchanged', () => {
    const t = new FlatGround();
    const column = new WaterColumn(0, 5);
    expect(t.onWaterHit(column, 'north')).toBeNull();
    expect(column.depth).toBe(5);
  });

  test('applyHits returns null', () => {
    expect(new FlatGround().applyHits(5)).toBeNull();
  });

  test('applyDelta +3 returns Wall with height 3', () => {
    const result = new FlatGround().applyDelta(3);
    expect(result.elevation).toBe(3);
    expect(result.constructor.name).toBe('Wall');
  });

  test('applyDelta -2 returns Hole with depth 2', () => {
    const result = new FlatGround().applyDelta(-2);
    expect(result.elevation).toBe(-2);
    expect(result.constructor.name).toBe('Hole');
  });

  test('applyDelta 0 returns FlatGround', () => {
    expect(new FlatGround().applyDelta(0).constructor.name).toBe('FlatGround');
  });

  test('resetHits is a no-op', () => {
    const t = new FlatGround();
    t.resetHits();
    expect(t.elevation).toBe(0);
  });

  test('serialize returns flat type with height 0', () => {
    expect(new FlatGround().serialize()).toEqual({ type: 'flat', height: 0 });
  });

  test('getRenderInfo returns null sprite and no customDraw', () => {
    const info = new FlatGround().getRenderInfo();
    expect(info.sprite).toBeNull();
    expect(info.tint).toBeNull();
    expect(info.customDraw).toBeUndefined();
  });
});
```

**Step 3: Run only the new test file to verify it works**

```bash
node --run test:unit -- --reporter=verbose src/model/terrain/flat-ground.test.ts
```

Expected: all pass.

**Step 4: Commit**

```bash
git add src/model/terrain/flat-ground.ts src/model/terrain/flat-ground.test.ts
git commit -m "feat: add terrain/flat-ground.ts with tests"
```

---

### Task 4: Create `wall.ts` and `wall.test.ts`

**Files:**
- Create: `src/model/terrain/wall.ts`
- Create: `src/model/terrain/wall.test.ts`

**Step 1: Create `wall.ts`**

Copy the wall texture constants, `wallSwatches`, `wallTextureFor`, `getWallSwatch` helpers, and the `Wall` class. Update the `applyDelta` imports to use `FlatGround` and `Hole` from sibling files.

```ts
import { type ImageSource } from 'excalibur';
import { MAX_ELEVATION, MIN_ELEVATION } from '../../config.ts';
import { Resources } from '../../resources.ts';
import type { WaterColumn } from '../water-column.ts';
import { Terrain, type CardinalDirection, type ErosionResult, type SerializedTerrain, type TileRenderInfo, type WallEvent } from './terrain.ts';
import { FlatGround } from './flat-ground.ts';
import { Hole } from './hole.ts';
import { Tower } from './tower.ts';

const WALL_TEXTURE_SWATCH = 64;
const wallSwatches: (HTMLCanvasElement | null)[] = [null, null, null, null];

const WALL_BEVEL_STRENGTH = 0.58;
const WALL_BEVEL_WIDTH_PX = 3;
const WALL_CORNER_RADIUS_PX = 10;
const WALL_OUTLINE_DARKNESS = 0.34;
const WALL_DROP_SHADOW = 0.24;

function wallTextureFor(tierIndex: number): ImageSource {
  const textures = [
    Resources.WallLevel1,
    Resources.WallLevel2,
    Resources.WallLevel3,
    Resources.WallLevel4,
  ];
  return textures[tierIndex] ?? Resources.WallLevel1;
}

function getWallSwatch(tierIndex: number): HTMLCanvasElement | null {
  const existing = wallSwatches[tierIndex];
  if (existing) { return existing; }
  const source = wallTextureFor(tierIndex);
  if (!source.isLoaded()) { return null; }
  const img = source.image;
  const swatch = document.createElement('canvas');
  swatch.width = WALL_TEXTURE_SWATCH;
  swatch.height = WALL_TEXTURE_SWATCH;
  const sctx = swatch.getContext('2d');
  if (!sctx) { return null; }
  sctx.imageSmoothingEnabled = false;
  const sx = Math.floor(img.width * 0.18);
  const sw = Math.floor(img.width * 0.64);
  const sy = Math.floor(img.height * 0.42);
  const sh = Math.floor(img.height * 0.5);
  sctx.drawImage(img, sx, sy, sw, sh, 0, 0, WALL_TEXTURE_SWATCH, WALL_TEXTURE_SWATCH);
  wallSwatches[tierIndex] = swatch;
  return swatch;
}

export class Wall extends Terrain {
  height: number;
  hitCount: number = 0;

  constructor(height: number) {
    super();
    this.height = Math.min(height, MAX_ELEVATION);
  }

  get elevation(): number { return this.height; }

  get sprite(): ImageSource | null { return wallTextureFor(this.tierIndex); }

  onWaterHit(column: WaterColumn, _direction: CardinalDirection): WallEvent {
    if (column.isEmpty()) { return null; }
    let event: WallEvent = null;
    if (this.height >= column.surfaceLevel) {
      column.surfaceLevel = column.floorLevel;
      event = 'blocked';
    } else if (this.height > column.floorLevel) {
      column.floorLevel = this.height;
      event = 'overtopped';
    }
    if (column.surfaceLevel - this.height >= 2) {
      this.hitCount += 1;
      if (this.hitCount >= 3) {
        this.hitCount -= 3;
        this.height -= 1;
      }
    }
    return event;
  }

  applyHits(count: number): ErosionResult | null {
    this.hitCount += count;
    let eroded = false;
    while (this.hitCount >= 3 && this.height > 0) {
      this.hitCount -= 3;
      this.height -= 1;
      eroded = true;
    }
    return eroded ? { newElevation: this.height } : null;
  }

  applyDelta(amount: number): Terrain {
    const newHeight = this.height + amount;
    if (newHeight <= 0) {
      if (newHeight < 0) { return new Hole(Math.min(-newHeight, -MIN_ELEVATION)); }
      return new FlatGround();
    }
    this.height = Math.min(newHeight, MAX_ELEVATION);
    return this;
  }

  serialize(): SerializedTerrain { return { type: 'wall', height: this.height }; }

  resetHits(): void { this.hitCount = 0; }

  override connectsTo(other: Terrain | null): boolean {
    return other instanceof Wall || other instanceof Tower;
  }

  private get tierIndex(): number {
    if (this.height <= 5) { return 0; }
    if (this.height <= 10) { return 1; }
    if (this.height <= 15) { return 2; }
    return 3;
  }

  getRenderInfo(): TileRenderInfo {
    const tier = this.tierIndex;
    const nb = this.neighbors;
    const cN = this.connectsTo(nb.north);
    const cS = this.connectsTo(nb.south);
    const cE = this.connectsTo(nb.east);
    const cW = this.connectsTo(nb.west);
    const mask = `${+cN}${+cS}${+cE}${+cW}`;
    const cacheKey = `wall:${tier}:${mask}:${this.col}:${this.row}`;

    return {
      sprite: null,
      tint: null,
      cacheKey,
      customDraw: (ctx, w, h) => {
        const tl = (!cN && !cW) ? WALL_CORNER_RADIUS_PX : 0;
        const tr = (!cN && !cE) ? WALL_CORNER_RADIUS_PX : 0;
        const br = (!cS && !cE) ? WALL_CORNER_RADIUS_PX : 0;
        const bl = (!cS && !cW) ? WALL_CORNER_RADIUS_PX : 0;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, [tl, tr, br, bl]);
        ctx.clip();

        const swatch = getWallSwatch(tier);
        const pattern = swatch ? ctx.createPattern(swatch, 'repeat') : null;
        if (pattern) {
          const phaseX = (this.col * w) % WALL_TEXTURE_SWATCH;
          const phaseY = (this.row * h) % WALL_TEXTURE_SWATCH;
          pattern.setTransform(new DOMMatrix().translateSelf(-phaseX, -phaseY));
          ctx.fillStyle = pattern;
        } else {
          const { elevationToColor } = await import('./utils.ts');
          const fallback = elevationToColor(this.height);
          ctx.fillStyle = `rgb(${fallback.r},${fallback.g},${fallback.b})`;
        }
        ctx.fillRect(0, 0, w, h);

        if (!cN) {
          ctx.fillStyle = `rgba(255,250,235,${WALL_BEVEL_STRENGTH})`;
          ctx.fillRect(0, 0, w, WALL_BEVEL_WIDTH_PX);
        }
        if (!cS) {
          ctx.fillStyle = `rgba(0,0,0,${Math.min(1, WALL_BEVEL_STRENGTH * 0.85 + WALL_DROP_SHADOW)})`;
          ctx.fillRect(0, h - WALL_BEVEL_WIDTH_PX, w, WALL_BEVEL_WIDTH_PX);
        }

        ctx.restore();

        ctx.strokeStyle = `rgba(40,25,10,${WALL_OUTLINE_DARKNESS})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (!cN) { ctx.moveTo(tl, 0.5); ctx.lineTo(w - tr, 0.5); }
        if (!cS) { ctx.moveTo(bl, h - 0.5); ctx.lineTo(w - br, h - 0.5); }
        if (!cW) { ctx.moveTo(0.5, tl); ctx.lineTo(0.5, h - bl); }
        if (!cE) { ctx.moveTo(w - 0.5, tr); ctx.lineTo(w - 0.5, h - br); }
        ctx.stroke();
      },
    };
  }
}
```

Note: `elevationToColor` in `customDraw` — import it statically at the top of the file alongside the other imports (no `await import` needed since it's not in an async context). The original code imported `Color` from excalibur and called `elevationToColor` which returned a `Color`. After the utils refactor it returns `{r,g,b}` — no change needed at call sites since both are destructured the same way.

**Correction:** import `elevationToColor` at the top of the file:

```ts
import { elevationToColor } from './utils.ts';
```

And replace:
```ts
const fallback = elevationToColor(this.height);
ctx.fillStyle = `rgb(${fallback.r},${fallback.g},${fallback.b})`;
```

**Step 2: Create `wall.test.ts`**

Extract the `Wall`, `connectsTo`, and `Wall.getRenderInfo` describe blocks from `src/model/terrain.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { Wall } from './wall.ts';
import { Tower } from './tower.ts';
import { FlatGround } from './flat-ground.ts';
import { Hole } from './hole.ts';
import { GridModel } from '../grid-model.ts';
import { WaterColumn } from '../water-column.ts';
import { Resources } from '../../resources.ts';

describe('connectsTo', () => {
  test('walls connect to walls and towers, not flat/hole/null', () => {
    const wall = new Wall(3);
    expect(wall.connectsTo(new Wall(1))).toBe(true);
    expect(wall.connectsTo(new Tower(15))).toBe(true);
    expect(wall.connectsTo(new FlatGround())).toBe(false);
    expect(wall.connectsTo(new Hole(2))).toBe(false);
    expect(wall.connectsTo(null)).toBe(false);
  });

  test('towers connect to walls and towers', () => {
    const tower = new Tower(15);
    expect(tower.connectsTo(new Wall(1))).toBe(true);
    expect(tower.connectsTo(new Tower(15))).toBe(true);
    expect(tower.connectsTo(new FlatGround())).toBe(false);
  });

  test('flat and hole connect to nothing', () => {
    expect(new FlatGround().connectsTo(new Wall(1))).toBe(false);
    expect(new Hole(2).connectsTo(new Hole(2))).toBe(false);
  });
});

describe('Wall', () => {
  test('elevation equals height', () => {
    expect(new Wall(5).elevation).toBe(5);
  });

  test('sprite returns the tier-1 texture for height 1-5', () => {
    expect(new Wall(3).sprite).toBe(Resources.WallLevel1);
  });

  test('sprite returns the tier-4 texture for height 16-20', () => {
    expect(new Wall(18).sprite).toBe(Resources.WallLevel4);
  });

  test('onWaterHit blocks when wall height >= water surface', () => {
    const w = new Wall(5);
    const col = new WaterColumn(0, 4);
    expect(w.onWaterHit(col, 'north')).toBe('blocked');
    expect(col.depth).toBe(0);
  });

  test('onWaterHit overtops when wall between floor and surface', () => {
    const w = new Wall(3);
    const col = new WaterColumn(0, 5);
    expect(w.onWaterHit(col, 'north')).toBe('overtopped');
    expect(col.floorLevel).toBe(3);
    expect(col.depth).toBe(2);
  });

  test('onWaterHit passes through when wall at or below floor', () => {
    const w = new Wall(1);
    const col = new WaterColumn(2, 5);
    expect(w.onWaterHit(col, 'north')).toBeNull();
  });

  test('onWaterHit counts hit when water depth >= 2 above wall', () => {
    const w = new Wall(3);
    w.onWaterHit(new WaterColumn(0, 6), 'north');
    expect(w.hitCount).toBe(1);
  });

  test('onWaterHit does not count hit when water depth < 2 above wall', () => {
    const w = new Wall(3);
    w.onWaterHit(new WaterColumn(0, 4), 'north');
    expect(w.hitCount).toBe(0);
  });

  test('erodes after 3 hits', () => {
    const w = new Wall(5);
    for (let i = 0; i < 3; i++) { w.onWaterHit(new WaterColumn(0, 10), 'north'); }
    expect(w.elevation).toBe(4);
    expect(w.hitCount).toBe(0);
  });

  test('applyHits erodes and returns result at threshold', () => {
    const w = new Wall(5);
    expect(w.applyHits(2)).toBeNull();
    expect(w.applyHits(1)).toEqual({ newElevation: 4 });
    expect(w.hitCount).toBe(0);
  });

  test('applyHits handles multiple erosions from large hit count', () => {
    const w = new Wall(5);
    w.applyHits(6);
    expect(w.elevation).toBe(3);
    expect(w.hitCount).toBe(0);
  });

  test('applyDelta +2 increases height', () => {
    const w = new Wall(3);
    const result = w.applyDelta(2);
    expect(result.elevation).toBe(5);
    expect(result).toBe(w);
  });

  test('applyDelta -3 on height 3 returns FlatGround', () => {
    expect(new Wall(3).applyDelta(-3).constructor.name).toBe('FlatGround');
  });

  test('applyDelta -5 on height 3 returns Hole with depth 2', () => {
    const result = new Wall(3).applyDelta(-5);
    expect(result.constructor.name).toBe('Hole');
    expect(result.elevation).toBe(-2);
  });

  test('applyDelta clamps to MAX_ELEVATION', () => {
    expect(new Wall(18).applyDelta(5).elevation).toBe(20);
  });

  test('resetHits clears hit count', () => {
    const w = new Wall(5);
    w.applyHits(2);
    w.resetHits();
    expect(w.hitCount).toBe(0);
  });

  test('serialize returns wall type with height', () => {
    expect(new Wall(7).serialize()).toEqual({ type: 'wall', height: 7 });
  });

  test('getRenderInfo returns customDraw with no sprite or tint', () => {
    const info = new Wall(3).getRenderInfo();
    expect(info.sprite).toBeNull();
    expect(info.tint).toBeNull();
    expect(info.customDraw).toBeTypeOf('function');
  });
});

describe('Wall.getRenderInfo (contiguous mass)', () => {
  test('returns a customDraw and a wall cacheKey', () => {
    const info = new Wall(3).getRenderInfo();
    expect(info.customDraw).toBeTypeOf('function');
    expect(info.cacheKey).toContain('wall:');
  });

  test('cacheKey changes when a connecting neighbor appears', () => {
    const grid = new GridModel({ width: 16, height: 16, castleCol: 8, castleRow: 12, castleWidth: 2, castleHeight: 2 });
    grid.setElevation(5, 5, 3);
    const before = (grid.getCell(5, 5) as Wall).getRenderInfo().cacheKey;
    grid.setElevation(6, 5, 3);
    const after = (grid.getCell(5, 5) as Wall).getRenderInfo().cacheKey;
    expect(before).not.toEqual(after);
  });

  test('cacheKey changes across tiers', () => {
    const a = new Wall(3).getRenderInfo().cacheKey;
    const b = new Wall(18).getRenderInfo().cacheKey;
    expect(a).not.toEqual(b);
  });
});
```

**Step 3: Run the new test file**

```bash
node --run test:unit -- --reporter=verbose src/model/terrain/wall.test.ts
```

Expected: all pass.

**Step 4: Commit**

```bash
git add src/model/terrain/wall.ts src/model/terrain/wall.test.ts
git commit -m "feat: add terrain/wall.ts with tests"
```

---

### Task 5: Create `hole.ts` and `hole.test.ts`

**Files:**
- Create: `src/model/terrain/hole.ts`
- Create: `src/model/terrain/hole.test.ts`

**Step 1: Create `hole.ts`**

```ts
import type { ImageSource } from 'excalibur';
import { MAX_ELEVATION, MIN_ELEVATION } from '../../config.ts';
import type { WaterColumn } from '../water-column.ts';
import { Terrain, type CardinalDirection, type ErosionResult, type SerializedTerrain, type TileRenderInfo, type WallEvent } from './terrain.ts';
import { FlatGround } from './flat-ground.ts';
import { Wall } from './wall.ts';
import { clamp, elevationToColor } from './utils.ts';

export class Hole extends Terrain {
  depth: number;
  puddleDepth: number = 0;
  hitCount: number = 0;

  constructor(depth: number) {
    super();
    this.depth = Math.min(depth, -MIN_ELEVATION);
  }

  get elevation(): number { return -this.depth; }

  get effectiveDepth(): number { return Math.max(0, this.depth - this.puddleDepth); }

  get sprite(): ImageSource | null { return null; }

  addPuddle(amount: number): void {
    this.puddleDepth = Math.min(this.depth, this.puddleDepth + amount);
  }

  onWaterHit(_column: WaterColumn, _direction: CardinalDirection): WallEvent { return null; }

  applyHits(count: number): ErosionResult | null {
    this.hitCount += count;
    let eroded = false;
    while (this.hitCount >= 3 && this.depth > 0) {
      this.hitCount -= 3;
      this.depth -= 1;
      eroded = true;
    }
    this.puddleDepth = Math.min(this.puddleDepth, this.depth);
    return eroded ? { newElevation: this.elevation } : null;
  }

  applyDelta(amount: number): Terrain {
    const newElevation = this.elevation + amount;
    if (newElevation >= 0) {
      if (newElevation > 0) { return new Wall(Math.min(newElevation, MAX_ELEVATION)); }
      return new FlatGround();
    }
    this.depth = Math.min(-newElevation, -MIN_ELEVATION);
    this.puddleDepth = Math.min(this.puddleDepth, this.depth);
    return this;
  }

  serialize(): SerializedTerrain {
    return { type: 'hole', height: this.elevation, puddleDepth: this.puddleDepth };
  }

  resetHits(): void { this.hitCount = 0; }

  getRenderInfo(): TileRenderInfo {
    const nb = this.neighbors;
    const nt = nb.north instanceof Hole;
    const nbm = nb.south instanceof Hole;
    const nl = nb.west instanceof Hole;
    const nr2 = nb.east instanceof Hole;
    const cacheKey = `hole:${this.elevation}:${this.puddleDepth}:${+nt}${+nbm}${+nl}${+nr2}`;
    return {
      sprite: null,
      tint: null,
      cacheKey,
      customDraw: (ctx, width, height) => {
        const elevation = this.elevation;
        const puddleDepth = this.puddleDepth;
        const { r, g, b } = elevationToColor(elevation);
        const cornerRadius = Math.max(3, Math.floor(width * 0.2));

        const fillW = nr2 ? width : width - 1;
        const fillH = nbm ? height : height - 1;

        const tl = (!nt && !nl) ? cornerRadius : 0;
        const tr = (!nt && !nr2) ? cornerRadius : 0;
        const br = (!nbm && !nr2) ? cornerRadius : 0;
        const bl = (!nbm && !nl) ? cornerRadius : 0;
        ctx.beginPath();
        ctx.roundRect(0, 0, fillW, fillH, [tl, tr, br, bl]);
        ctx.save();
        ctx.clip();

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, 0, fillW, fillH);

        const shadowR = clamp(r - 60, 0, 255);
        const shadowG = clamp(g - 60, 0, 255);
        const shadowB = clamp(b - 60, 0, 255);
        const diffuseR = clamp(r + 30, 0, 255);
        const diffuseG = clamp(g + 30, 0, 255);
        const diffuseB = clamp(b + 30, 0, 255);

        ctx.fillStyle = `rgb(${shadowR},${shadowG},${shadowB})`;
        if (!nt) { ctx.fillRect(0, 0, fillW, 2); }
        if (!nl) { ctx.fillRect(0, 0, 2, fillH); }

        ctx.fillStyle = `rgb(${diffuseR},${diffuseG},${diffuseB})`;
        if (!nbm) { ctx.fillRect(0, height - 2, fillW, 1); }
        if (!nr2) { ctx.fillRect(width - 2, 0, 1, fillH); }

        if (puddleDepth > 0 && elevation < 0) {
          const puddleAlpha = 0.25 + (puddleDepth / -elevation) * 0.45;
          ctx.fillStyle = `rgba(60, 130, 200, ${puddleAlpha})`;
          const px = nl ? 2 : 0;
          const py = nt ? 2 : 0;
          const pw = (nr2 ? width : width - 2) - px;
          const ph = (nbm ? height : height - 2) - py;
          ctx.fillRect(px, py, pw, ph);
        }

        ctx.restore();
      },
    };
  }
}
```

**Step 2: Create `hole.test.ts`**

Extract the `Hole` describe block from `src/model/terrain.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { Hole } from './hole.ts';
import { Wall } from './wall.ts';
import { WaterColumn } from '../water-column.ts';

describe('Hole', () => {
  test('elevation is negative depth', () => {
    expect(new Hole(3).elevation).toBe(-3);
  });

  test('sprite is null', () => {
    expect(new Hole(3).sprite).toBeNull();
  });

  test('starts with 0 puddle depth', () => {
    expect(new Hole(3).puddleDepth).toBe(0);
  });

  test('effectiveDepth is depth minus puddle', () => {
    const h = new Hole(5);
    h.puddleDepth = 2;
    expect(h.effectiveDepth).toBe(3);
  });

  test('effectiveDepth is 0 when fully puddled', () => {
    const h = new Hole(3);
    h.puddleDepth = 3;
    expect(h.effectiveDepth).toBe(0);
  });

  test('addPuddle increases puddle depth clamped to max', () => {
    const h = new Hole(3);
    h.addPuddle(5);
    expect(h.puddleDepth).toBe(3);
  });

  test('onWaterHit returns null', () => {
    const h = new Hole(3);
    const col = new WaterColumn(0, 5);
    expect(h.onWaterHit(col, 'north')).toBeNull();
  });

  test('applyHits erodes toward zero after threshold', () => {
    const h = new Hole(3);
    const result = h.applyHits(3);
    expect(result).toEqual({ newElevation: -2 });
    expect(h.elevation).toBe(-2);
  });

  test('applyDelta +3 on depth 3 returns FlatGround', () => {
    expect(new Hole(3).applyDelta(3).constructor.name).toBe('FlatGround');
  });

  test('applyDelta +5 on depth 3 returns Wall with height 2', () => {
    const result = new Hole(3).applyDelta(5);
    expect(result.constructor.name).toBe('Wall');
    expect(result.elevation).toBe(2);
  });

  test('applyDelta -2 increases depth', () => {
    const h = new Hole(3);
    const result = h.applyDelta(-2);
    expect(result.elevation).toBe(-5);
    expect(result).toBe(h);
  });

  test('applyDelta clamps to MIN_ELEVATION', () => {
    expect(new Hole(18).applyDelta(-5).elevation).toBe(-20);
  });

  test('applyDelta clears excess puddle when depth shrinks', () => {
    const h = new Hole(5);
    h.puddleDepth = 4;
    h.applyDelta(3);
    expect(h.depth).toBe(2);
    expect(h.puddleDepth).toBe(2);
  });

  test('resetHits clears hit count', () => {
    const h = new Hole(3);
    h.applyHits(2);
    h.resetHits();
    expect(h.applyHits(2)).toBeNull();
  });

  test('serialize returns hole type with negative height and puddleDepth', () => {
    const h = new Hole(3);
    h.addPuddle(1.5);
    expect(h.serialize()).toEqual({ type: 'hole', height: -3, puddleDepth: 1.5 });
  });

  test('getRenderInfo returns customDraw function', () => {
    const info = new Hole(3).getRenderInfo();
    expect(info.sprite).toBeNull();
    expect(info.tint).toBeNull();
    expect(info.customDraw).toBeInstanceOf(Function);
  });
});
```

**Step 3: Run the new test file**

```bash
node --run test:unit -- --reporter=verbose src/model/terrain/hole.test.ts
```

Expected: all pass.

**Step 4: Commit**

```bash
git add src/model/terrain/hole.ts src/model/terrain/hole.test.ts
git commit -m "feat: add terrain/hole.ts with tests"
```

---

### Task 6: Create `tower.ts` and `tower.test.ts`

**Files:**
- Create: `src/model/terrain/tower.ts`
- Create: `src/model/terrain/tower.test.ts`

**Step 1: Create `tower.ts`**

```ts
import type { ImageSource } from 'excalibur';
import { MAX_ELEVATION, TOWER_HITS_PER_EROSION } from '../../config.ts';
import { Resources } from '../../resources.ts';
import type { WaterColumn } from '../water-column.ts';
import { Terrain, type CardinalDirection, type ErosionResult, type SerializedTerrain, type TileRenderInfo, type WallEvent } from './terrain.ts';
import { Wall } from './wall.ts';

export class Tower extends Terrain {
  height: number;
  hitCount: number = 0;

  constructor(height: number) {
    super();
    this.height = Math.min(height, MAX_ELEVATION);
  }

  get elevation(): number { return this.height; }

  get sprite(): ImageSource | null { return Resources.TowerSprite; }

  onWaterHit(column: WaterColumn, _direction: CardinalDirection): WallEvent {
    if (column.isEmpty()) { return null; }
    let event: WallEvent = null;
    if (this.height >= column.surfaceLevel) {
      column.surfaceLevel = column.floorLevel;
      event = 'blocked';
    } else if (this.height > column.floorLevel) {
      column.floorLevel = this.height;
      event = 'overtopped';
    }
    if (column.surfaceLevel - this.height >= 2) {
      this.hitCount += 1;
      if (this.hitCount >= TOWER_HITS_PER_EROSION) {
        this.hitCount -= TOWER_HITS_PER_EROSION;
        this.height -= 1;
      }
    }
    return event;
  }

  applyHits(count: number): ErosionResult | null {
    this.hitCount += count;
    let eroded = false;
    while (this.hitCount >= TOWER_HITS_PER_EROSION && this.height > 0) {
      this.hitCount -= TOWER_HITS_PER_EROSION;
      this.height -= 1;
      eroded = true;
    }
    return eroded ? { newElevation: this.height } : null;
  }

  applyDelta(_amount: number): Terrain { return this; }

  serialize(): SerializedTerrain { return { type: 'tower', height: this.height }; }

  resetHits(): void { this.hitCount = 0; }

  override connectsTo(other: Terrain | null): boolean {
    return other instanceof Wall || other instanceof Tower;
  }

  getRenderInfo(): TileRenderInfo {
    return { sprite: Resources.TowerSprite.toSprite(), tint: null };
  }
}
```

**Step 2: Create `tower.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import { Tower } from './tower.ts';
import { Wall } from './wall.ts';
import { WaterColumn } from '../water-column.ts';

describe('Tower', () => {
  test('elevation equals height', () => {
    expect(new Tower(15).elevation).toBe(15);
  });

  test('clamps height to MAX_ELEVATION', () => {
    expect(new Tower(25).elevation).toBe(20);
  });

  test('onWaterHit blocks when tower height >= water surface', () => {
    const t = new Tower(15);
    const col = new WaterColumn(0, 10);
    expect(t.onWaterHit(col, 'north')).toBe('blocked');
    expect(col.depth).toBe(0);
  });

  test('onWaterHit overtops when tower between floor and surface', () => {
    const t = new Tower(5);
    const col = new WaterColumn(0, 10);
    expect(t.onWaterHit(col, 'north')).toBe('overtopped');
    expect(col.floorLevel).toBe(5);
  });

  test('onWaterHit accumulates hits when water depth >= 2 above tower', () => {
    const t = new Tower(5);
    t.onWaterHit(new WaterColumn(0, 10), 'north');
    expect(t.hitCount).toBe(1);
  });

  test('erodes after TOWER_HITS_PER_EROSION hits', () => {
    const t = new Tower(15);
    for (let i = 0; i < 10; i++) { t.onWaterHit(new WaterColumn(0, 20), 'north'); }
    expect(t.elevation).toBe(14);
    expect(t.hitCount).toBe(0);
  });

  test('does not erode before reaching hit threshold', () => {
    const t = new Tower(15);
    for (let i = 0; i < 9; i++) { t.onWaterHit(new WaterColumn(0, 20), 'north'); }
    expect(t.elevation).toBe(15);
    expect(t.hitCount).toBe(9);
  });

  test('applyHits erodes using TOWER_HITS_PER_EROSION threshold', () => {
    expect(new Tower(15).applyHits(10)).toEqual({ newElevation: 14 });
  });

  test('applyHits handles multiple erosions', () => {
    const t = new Tower(15);
    t.applyHits(20);
    expect(t.elevation).toBe(13);
  });

  test('applyDelta returns self unchanged', () => {
    const t = new Tower(15);
    expect(t.applyDelta(5)).toBe(t);
    expect(t.elevation).toBe(15);
  });

  test('applyDelta with negative returns self unchanged', () => {
    const t = new Tower(15);
    expect(t.applyDelta(-5)).toBe(t);
    expect(t.elevation).toBe(15);
  });

  test('serialize returns tower type with height', () => {
    expect(new Tower(15).serialize()).toEqual({ type: 'tower', height: 15 });
  });

  test('resetHits clears hit count', () => {
    const t = new Tower(15);
    t.applyHits(5);
    t.resetHits();
    expect(t.hitCount).toBe(0);
  });

  test('becomes fully eroded when hits accumulate past height * threshold', () => {
    const t = new Tower(1);
    t.applyHits(10);
    expect(t.elevation).toBe(0);
  });

  test('getRenderInfo returns tower sprite with no tint', () => {
    const info = new Tower(15).getRenderInfo();
    expect(info.sprite).not.toBeNull();
    expect(info.tint).toBeNull();
    expect(info.customDraw).toBeUndefined();
  });

  test('connectsTo wall and tower, not others', () => {
    const t = new Tower(15);
    expect(t.connectsTo(new Wall(3))).toBe(true);
    expect(t.connectsTo(new Tower(15))).toBe(true);
  });
});
```

**Step 3: Run the new test file**

```bash
node --run test:unit -- --reporter=verbose src/model/terrain/tower.test.ts
```

Expected: all pass.

**Step 4: Commit**

```bash
git add src/model/terrain/tower.ts src/model/terrain/tower.test.ts
git commit -m "feat: add terrain/tower.ts with tests"
```

---

### Task 7: Update all importers

No barrel file means each importer must point at the specific class file it needs.

**Files to modify:**

| File | Old import | New import |
|------|-----------|------------|
| `src/model/grid-model.ts` | `from './terrain.ts'` | Split into per-symbol imports from `./terrain/terrain.ts`, `./terrain/flat-ground.ts`, `./terrain/wall.ts`, `./terrain/hole.ts`, `./terrain/tower.ts` |
| `src/model/grid-model.test.ts` | `from './terrain.ts'` | `from './terrain/hole.ts'` and `from './terrain/tower.ts'` |
| `src/model/wave-simulation.ts` | `from './terrain.ts'` | `from './terrain/terrain.ts'` (Terrain type), `from './terrain/hole.ts'` (Hole) |
| `src/model/wave-simulation.test.ts` | `from './terrain.ts'` | Split into per-symbol imports |
| `src/view/single-cell-digging.ts` | `from '../model/terrain.ts'` | `from '../model/terrain/flat-ground.ts'` |
| `src/view/tile.ts` | `from "../model/terrain.ts"` | `from "../model/terrain/terrain.ts"` |
| `src/model/terrain.test.ts` | (entire file) | Already replaced by per-class test files — delete this file in Task 8 |

For `grid-model.ts`, the current import is:
```ts
import { Terrain, FlatGround, Wall, Hole, Tower, type NeighborGrid, type Neighbors } from './terrain.ts';
```
Replace with:
```ts
import { Terrain, type NeighborGrid, type Neighbors } from './terrain/terrain.ts';
import { FlatGround } from './terrain/flat-ground.ts';
import { Wall } from './terrain/wall.ts';
import { Hole } from './terrain/hole.ts';
import { Tower } from './terrain/tower.ts';
```

**Step 1: Update each file listed above**

**Step 2: Run full test suite**

```bash
node --run test:unit
```

Expected: all pass.

**Step 3: Run typecheck**

```bash
node --run build
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/model/grid-model.ts src/model/grid-model.test.ts src/model/wave-simulation.ts src/model/wave-simulation.test.ts src/view/single-cell-digging.ts src/view/tile.ts
git commit -m "refactor: update importers to use terrain/ submodule paths"
```

---

### Task 8: Delete old terrain files

**Step 1: Delete the old monolithic files**

```bash
rm src/model/terrain.ts src/model/terrain.test.ts
```

**Step 2: Run full test suite and typecheck**

```bash
node --run test:unit && node --run build
```

Expected: all pass, no errors.

**Step 3: Commit**

```bash
git add -u src/model/terrain.ts src/model/terrain.test.ts
git commit -m "refactor: remove old monolithic terrain.ts and terrain.test.ts"
```

---

### Final verification

```bash
node --run lint && node --run test:unit && node --run build
```

All three must pass before this work is considered done.
