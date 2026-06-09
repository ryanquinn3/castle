# Wall Levels Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the continuous height-delta wall model with four discrete, stacked wall levels (L1–L4) as dedicated tools, each with cumulative HP durability and all-or-nothing destruction.

**Architecture:** `Wall` becomes level + HP driven (elevation derived from level: 5/10/15/20). Wall creation moves from `applyDelta(+1)` to an explicit `GridModel.placeWall(col,row,level)`. Damage is HP-based (cumulative max 15/45/90/150); a wall holds full elevation until HP ≤ 0, then vanishes to flat ground with no refund. HP never auto-heals. The toolbar grows to six tools: `[Shovel][W1][W2][W3][W4][Tower]`.

**Tech Stack:** TypeScript, Excalibur.js, Vite, Vitest (`test.extend` fixtures), React (toolbar UI), oxlint, knip.

**Design doc:** `docs/plans/2026-06-08-wall-levels-redesign-design.md`

**Execution notes (read first):**
- No git worktrees — work on the current `main` checkout (repo is not worktree-enabled).
- Subagents are sonnet-based: keep each step mechanical and self-contained; do not improvise beyond the step.
- `node --run static-check` runs tsc + oxlint + **knip** (fails on unused exports) + unit + browser tests. Because it is whole-project, a half-migrated state fails it. Per-task verification below is therefore **scoped** (named test files + `node --run tsc`); the **full** `node --run static-check` is required green at the end of Task 2 and again at the end of the final task.
- `tsc` stays green across Task 1 because `Wall`'s constructor keeps a single `number` parameter and `ToolType`/`terrain-editor.ts` are untouched until Task 2.
- Testing conventions (study before writing): unit tests use `import { describe, expect, test } from 'vitest'`; `grid-model.test.ts` and `terrain-editor.test.ts` use `baseTest.extend<{ grid: GridModel }>(...)` fixtures. Match the file you are editing. Assert behavior, not internals; partial matching where only some fields matter.

---

## Task 1: Config constants + `Wall` model rewrite (level + HP)

Flips the core model. Ends with model/wave/view unit tests green (terrain-editor deferred to Task 2).

**Files:**
- Modify: `src/config.ts` (add wall-level constants)
- Modify: `src/model/terrain/wall.ts` (rewrite to level + HP)
- Modify: `src/model/terrain/flat-ground.ts:26-34` (`applyDelta` no longer creates walls)
- Modify: `src/model/terrain/hole.ts:58-69` (`applyDelta` fill → flat, never wall)
- Modify: `src/model/grid-model.ts` (add `placeWall`; drop `Wall` from `getHitCount`/`incrementHitCount`)
- Test: `src/model/terrain/wall.test.ts` (rewrite)
- Test: `src/model/terrain/flat-ground.test.ts`, `src/model/terrain/hole.test.ts`, `src/model/grid-model.test.ts` (fix + extend)
- Test (fix as needed): `src/view/grid-view.test.ts`, `src/wave/wave-event-applier.test.ts`, `src/model/wave-simulation.test.ts`, `src/model/flow-field.test.ts`

**Step 1: Add config constants**

In `src/config.ts`, after the `TOWER_*` constants (around line 42), add:

```ts
/** Wall blocking elevation per level (index = level - 1). L1=5, L2=10, L3=15, L4=20. */
export const WALL_LEVEL_ELEVATION = [5, 10, 15, 20];
/** Sand cost to build each wall level (index = level - 1). */
export const WALL_LEVEL_COST = [1, 5, 10, 20];
/** Cumulative max HP per wall level (index = level - 1). 3x elevation per tier, summed. */
export const WALL_LEVEL_HP = [15, 45, 90, 150];
/** Highest wall level. */
export const MAX_WALL_LEVEL = 4;
```

**Step 2: Write failing tests for the new `Wall` model**

Replace the entire body of `src/model/terrain/wall.test.ts`. Keep the `connectsTo` describe block as-is (it still passes — `new Wall(3)` is now level 3, but `connectsTo` is level-agnostic). Replace the `describe('Wall', ...)` and contiguous-mass blocks with:

```ts
import { describe, expect, test } from 'vitest';
import { Wall } from './wall.ts';
import { Tower } from './tower.ts';
import { FlatGround } from './flat-ground.ts';
import { Hole } from './hole.ts';
import { GridModel } from '../grid-model.ts';
import { WaterColumn } from '../water-column.ts';
import { Resources } from '../../resources.ts';
import { WALL_LEVEL_ELEVATION, WALL_LEVEL_HP } from '../../config.ts';

describe('connectsTo', () => {
  test('walls connect to walls and towers, not flat/hole/null', () => {
    const wall = new Wall(3);
    expect(wall.connectsTo(new Wall(1))).toBe(true);
    expect(wall.connectsTo(new Tower(15))).toBe(true);
    expect(wall.connectsTo(new FlatGround())).toBe(false);
    expect(wall.connectsTo(new Hole(2))).toBe(false);
    expect(wall.connectsTo(null)).toBe(false);
  });
});

describe('Wall levels', () => {
  test('elevation derives from level', () => {
    expect(new Wall(1).elevation).toBe(5);
    expect(new Wall(2).elevation).toBe(10);
    expect(new Wall(3).elevation).toBe(15);
    expect(new Wall(4).elevation).toBe(20);
  });

  test('constructor clamps level to 1..4', () => {
    expect(new Wall(0).level).toBe(1);
    expect(new Wall(9).level).toBe(4);
  });

  test('hp initializes to the level cumulative max', () => {
    expect(new Wall(1).hp).toBe(WALL_LEVEL_HP[0]);
    expect(new Wall(4).hp).toBe(WALL_LEVEL_HP[3]);
  });

  test('sprite maps level to its swatch texture', () => {
    expect(new Wall(1).sprite).toBe(Resources.WallSwatch1);
    expect(new Wall(4).sprite).toBe(Resources.WallSwatch4);
  });
});

describe('Wall damage (all-or-nothing)', () => {
  test('applyHits decrements hp without changing elevation until destroyed', () => {
    const w = new Wall(2); // hp 45, elevation 10
    expect(w.applyHits(10)).toBeNull();
    expect(w.hp).toBe(35);
    expect(w.elevation).toBe(10);
  });

  test('applyHits returns destruction (newElevation 0) when hp reaches 0', () => {
    const w = new Wall(1); // hp 15
    expect(w.applyHits(14)).toBeNull();
    const result = w.applyHits(1);
    expect(result).toEqual({ newElevation: 0 });
    expect(w.elevation).toBe(0);
  });

  test('onWaterHit blocks and decrements hp when overtopped by >= 2', () => {
    const w = new Wall(1); // elevation 5, hp 15
    const col = new WaterColumn(0, 7); // surface 7, depth 2 above wall top
    const event = w.onWaterHit(col, 'north');
    expect(event).toBe('blocked');
    expect(w.hp).toBe(14);
  });

  test('onWaterHit does not damage when overtopped by < 2', () => {
    const w = new Wall(1); // elevation 5
    const col = new WaterColumn(0, 6); // depth 1 above wall top
    w.onWaterHit(col, 'north');
    expect(w.hp).toBe(15);
  });
});

describe('Wall immutability to tools', () => {
  test('applyDelta is a no-op returning self', () => {
    const w = new Wall(2);
    expect(w.applyDelta(5)).toBe(w);
    expect(w.applyDelta(-5)).toBe(w);
    expect(w.elevation).toBe(10);
  });

  test('resetHits does not restore hp (damage persists)', () => {
    const w = new Wall(3);
    w.applyHits(20);
    const hpAfter = w.hp;
    w.resetHits();
    expect(w.hp).toBe(hpAfter);
  });

  test('serialize includes type, height (elevation), level, hp', () => {
    const w = new Wall(2);
    expect(w.serialize()).toEqual({ type: 'wall', height: 10, level: 2, hp: 45 });
  });
});

describe('Wall.getRenderInfo (contiguous mass)', () => {
  test('returns a customDraw and a wall cacheKey', () => {
    const info = new Wall(1).getRenderInfo();
    expect(info.customDraw).toBeTypeOf('function');
    expect(info.cacheKey).toContain('wall:');
  });

  test('cacheKey changes when a connecting neighbor appears', () => {
    const grid = new GridModel({ width: 16, height: 16, castleCol: 8, castleRow: 12, castleWidth: 2, castleHeight: 2 });
    grid.placeWall(5, 5, 1);
    const before = (grid.getCell(5, 5) as unknown as Wall).getRenderInfo().cacheKey;
    grid.placeWall(6, 5, 1);
    const after = (grid.getCell(5, 5) as unknown as Wall).getRenderInfo().cacheKey;
    expect(before).not.toEqual(after);
  });

  test('cacheKey changes across levels', () => {
    const a = new Wall(1).getRenderInfo().cacheKey;
    const b = new Wall(4).getRenderInfo().cacheKey;
    expect(a).not.toEqual(b);
  });
});
```

**Step 3: Run the new tests, verify they fail**

Run: `node --run test:unit -- src/model/terrain/wall.test.ts`
Expected: FAIL (Wall still height-based; `placeWall`, `level`, `hp` don't exist yet).

**Step 4: Rewrite `src/model/terrain/wall.ts`**

Keep the swatch-rendering helpers (`WALL_SWATCH_RESOLUTION`, `WALL_TEXTURE_PERIOD`, `wallSwatches`, `wallTextureFor`, `getWallSwatch`, the locked visual params) and the `customDraw` body unchanged. Change the class to level + HP. Replace imports and the class:

```ts
import { type ImageSource } from 'excalibur';
import { WALL_LEVEL_ELEVATION, WALL_LEVEL_HP, MAX_WALL_LEVEL } from '../../config.ts';
import { Resources } from '../../resources.ts';
import type { WaterColumn } from '../water-column.ts';
import { Terrain, type CardinalDirection, type ErosionResult, type SerializedTerrain, type TileRenderInfo, type WallEvent } from './terrain.ts';
import { Tower } from './tower.ts';
import { elevationToColor } from './utils.ts';
```

(Remove the `MAX_ELEVATION`/`MIN_ELEVATION`, `FlatGround`, and `Hole` imports — no longer used.)

```ts
export class Wall extends Terrain {
  // 1..4 normally; set to 0 only as a transient destroyed sentinel so the grid's
  // `elevation === 0 -> FlatGround` path removes it.
  level: number;
  hp: number;

  constructor(level: number) {
    super();
    this.level = Math.max(1, Math.min(MAX_WALL_LEVEL, Math.round(level)));
    this.hp = WALL_LEVEL_HP[this.level - 1];
  }

  get elevation(): number {
    if (this.level <= 0) {
      return 0;
    }
    return WALL_LEVEL_ELEVATION[this.level - 1];
  }

  get sprite(): ImageSource | null {
    return wallTextureFor(this.tierIndex);
  }

  onWaterHit(column: WaterColumn, _direction: CardinalDirection): WallEvent {
    if (column.isEmpty()) {
      return null;
    }
    const elev = this.elevation;
    let event: WallEvent = null;
    if (elev >= column.surfaceLevel) {
      column.surfaceLevel = column.floorLevel;
      event = 'blocked';
    } else if (elev > column.floorLevel) {
      column.floorLevel = elev;
      event = 'overtopped';
    }
    if (column.surfaceLevel - elev >= 2) {
      this.hp -= 1;
      if (this.hp <= 0) {
        this.level = 0;
      }
    }
    return event;
  }

  applyHits(count: number): ErosionResult | null {
    this.hp -= count;
    if (this.hp > 0) {
      return null;
    }
    this.level = 0;
    return { newElevation: 0 };
  }

  applyDelta(_amount: number): Terrain {
    return this;
  }

  resetHits(): void {
    // HP persists across waves and levels; no reset.
  }

  serialize(): SerializedTerrain {
    return { type: 'wall', height: this.elevation, level: this.level, hp: this.hp };
  }

  override connectsTo(other: Terrain | null): boolean {
    return other instanceof Wall || other instanceof Tower;
  }

  private get tierIndex(): number {
    return Math.max(0, this.level - 1);
  }

  getRenderInfo(): TileRenderInfo {
    // ... unchanged body, but the local `tier` now comes from this.tierIndex ...
  }
}
```

In `getRenderInfo`, replace `const tier = this.tierIndex;` (it already reads `this.tierIndex`) — the existing body uses `tier`, `this.col`, `this.row`, `this.height` for the fallback color. Change the single fallback line `const fallback = elevationToColor(this.height);` to `const fallback = elevationToColor(this.elevation);`. Everything else in `customDraw` stays.

**Step 5: Update `FlatGround.applyDelta`** (`src/model/terrain/flat-ground.ts`)

Raising flat ground is no longer a delta action (walls are placed via `placeWall`):

```ts
applyDelta(amount: number): Terrain {
  if (amount < 0) {
    return new Hole(-amount);
  }
  return this;
}
```

Remove the now-unused `import { Wall } from './wall.ts';` line.

**Step 6: Update `Hole.applyDelta`** (`src/model/terrain/hole.ts`)

Filling a hole to or above ground yields flat ground, never a wall:

```ts
applyDelta(amount: number): Terrain {
  const newElevation = this.elevation + amount;
  if (newElevation >= 0) {
    return new FlatGround();
  }
  this.depth = Math.min(-newElevation, -MIN_ELEVATION);
  this.puddleDepth = Math.min(this.puddleDepth, this.depth);
  return this;
}
```

Remove the now-unused `import { Wall } from './wall.ts';` and the `MAX_ELEVATION` name from the config import (keep `MIN_ELEVATION`).

**Step 7: Add `placeWall` and update hit-count helpers** (`src/model/grid-model.ts`)

Add after `placeTower` (around line 207):

```ts
placeWall(col: number, row: number, level: number): boolean {
  if (!this.inBounds(col, row) || this.isCastle(col, row)) {
    return false;
  }
  const cell = this.cells[row][col];
  if (level === 1) {
    if (!(cell instanceof FlatGround)) {
      return false;
    }
  } else if (!(cell instanceof Wall) || cell.level !== level - 1) {
    return false;
  }
  this.setCell(col, row, new Wall(level));
  this.detectPools();
  return true;
}
```

In `getHitCount` (line ~209) and `incrementHitCount` (line ~217), remove `Wall` from the `instanceof` checks so walls report 0 and ignore increments (wall damage is HP-based and invisible):

```ts
// getHitCount
if (cell instanceof Hole || cell instanceof Tower) {
  return cell.hitCount;
}
return 0;
// incrementHitCount
if (cell instanceof Hole || cell instanceof Tower) {
  cell.hitCount += amount;
}
```

**Step 8: Write failing tests for `placeWall` + HP persistence**

In `src/model/grid-model.test.ts`, add a new describe block (import `Wall` at the top: `import { Wall } from './terrain/wall.ts';`):

```ts
describe('placeWall', () => {
  test('places a level-1 wall on flat ground', ({ grid }) => {
    expect(grid.placeWall(3, 3, 1)).toBe(true);
    const cell = grid.getCell(3, 3);
    expect(cell).toBeInstanceOf(Wall);
    expect(cell.elevation).toBe(5);
  });

  test('rejects level 2 on flat ground', ({ grid }) => {
    expect(grid.placeWall(3, 3, 2)).toBe(false);
    expect(grid.getCell(3, 3).elevation).toBe(0);
  });

  test('upgrades level 1 to level 2', ({ grid }) => {
    grid.placeWall(3, 3, 1);
    expect(grid.placeWall(3, 3, 2)).toBe(true);
    expect((grid.getCell(3, 3) as unknown as Wall).level).toBe(2);
  });

  test('rejects skipping a level (3 on level 1)', ({ grid }) => {
    grid.placeWall(3, 3, 1);
    expect(grid.placeWall(3, 3, 3)).toBe(false);
  });

  test('rejects placement on the castle', ({ grid }) => {
    expect(grid.placeWall(8, 12, 1)).toBe(false);
  });

  test('wall hp persists across resetHitCounts', ({ grid }) => {
    grid.placeWall(3, 3, 4);
    const wall = grid.getCell(3, 3) as unknown as Wall;
    wall.applyHits(50);
    const hpAfter = wall.hp;
    grid.resetHitCounts();
    expect((grid.getCell(3, 3) as unknown as Wall).hp).toBe(hpAfter);
  });
});
```

**Step 9: Fix existing model/wave/view tests broken by the semantic flip**

These files build walls via `setElevation(col,row,+N)` or `new Wall(N)` assuming `N` = elevation, or assert wall `hitCount`. Migrate each to the new model. Find every occurrence:

```bash
grep -rnE "new Wall\(|setElevation\([^)]*, *[1-9]" src --include="*.test.ts"
grep -rn "getHitCount\|incrementHitCount" src --include="*.test.ts"
```

Apply these mechanical rules:
- "make a wall here" via `setElevation(c,r,3)` → `grid.placeWall(c, r, 1)` (or the intended level: divide old elevation by 5, clamp 1–4).
- `new Wall(3)` where elevation mattered → choose the level whose elevation matches (`new Wall(1)` = elev 5, etc.); where only "a wall" mattered, `new Wall(1)` is fine.
- Tests asserting wall `hitCount` / wall erosion-by-1 → delete or rewrite to assert hp via `applyHits` (walls no longer erode gradually). In `grid-model.test.ts`, the `incrementHitCount and getHitCount on wall` test must change its target to a `Hole` (e.g. dig first with `setElevation(3,3,-2)`) or be removed.
- `flat-ground.test.ts` / `hole.test.ts`: any `applyDelta(+n)` test expecting a `Wall` result must now expect `FlatGround` (or self). Update assertions accordingly.
- `src/view/grid-view.test.ts:153` increments hitCount on (5,5): if that cell is a wall, switch it to a hole/tower or assert `getHitCount` returns 0 for a wall.

Do not weaken assertions; rewrite them to the new behavior.

**Step 10: Run scoped verification, confirm green**

```bash
node --run tsc
node --run test:unit -- src/model src/wave src/view/grid-view.test.ts
```
Expected: tsc PASS; all listed unit suites PASS. (Do **not** run `terrain-editor.test.ts` yet — it migrates in Task 2.)

**Step 11: Commit**

```bash
git add src/config.ts src/model/terrain/wall.ts src/model/terrain/flat-ground.ts src/model/terrain/hole.ts src/model/grid-model.ts src/model/terrain/wall.test.ts src/model/grid-model.test.ts src/model/terrain/flat-ground.test.ts src/model/terrain/hole.test.ts src/view/grid-view.test.ts src/wave/wave-event-applier.test.ts src/model/wave-simulation.test.ts src/model/flow-field.test.ts
git commit -m "feat: wall level+HP model with placeWall and all-or-nothing destruction"
```

---

## Task 2: Tool layer — four wall tools + toolbar

Swaps `ToolType.Wall` for `Wall1`–`Wall4`, rewires the editor to `placeWall`, and grows the toolbar. This task brings the **full** suite back to green.

**Files:**
- Modify: `src/tool-type.ts`
- Modify: `src/view/terrain-editor.ts` (`validActionsFor`, `applyAction`, `availableActionsFor`, `getStateText`)
- Modify: `src/view/toolbar.ts` (`TOOL_DEFS`)
- Modify: `src/ui/ToolbarComponent.tsx:26` (`TOTAL_SLOTS`)
- Test: `src/view/terrain-editor.test.ts`

**Step 1: Redefine `ToolType`** (`src/tool-type.ts`)

```ts
export enum ToolType {
  Shovel = 'shovel',
  Wall1 = 'wall1',
  Wall2 = 'wall2',
  Wall3 = 'wall3',
  Wall4 = 'wall4',
  Tower = 'tower',
}

/** Wall tool -> level it builds. */
export const WALL_TOOL_LEVEL: Partial<Record<ToolType, number>> = {
  [ToolType.Wall1]: 1,
  [ToolType.Wall2]: 2,
  [ToolType.Wall3]: 3,
  [ToolType.Wall4]: 4,
};

/** Level -> the tool that builds it (index = level). */
export const WALL_TOOL_FOR_LEVEL: Record<number, ToolType> = {
  1: ToolType.Wall1,
  2: ToolType.Wall2,
  3: ToolType.Wall3,
  4: ToolType.Wall4,
};
```

**Step 2: Write failing `validActionsFor` tests** (`src/view/terrain-editor.test.ts`)

Replace the existing `describe('validActionsFor', ...)` block (lines ~16-46) with the level-aware version. Update the imports at the top (`Wall` is already imported; add `WALL_LEVEL_COST` from config and use the new `ToolType` members):

```ts
describe('validActionsFor', () => {
  test('flat ground with full sand offers shovel, wall1, tower', () => {
    const actions = validActionsFor({ cell: new FlatGround(), sand: TOWER_COST });
    expect(actions).toEqual(new Set([ToolType.Shovel, ToolType.Wall1, ToolType.Tower]));
  });

  test('flat ground with 1 sand offers shovel and wall1 only', () => {
    const actions = validActionsFor({ cell: new FlatGround(), sand: 1 });
    expect(actions).toEqual(new Set([ToolType.Shovel, ToolType.Wall1]));
  });

  test('flat ground with 0 sand offers shovel only', () => {
    const actions = validActionsFor({ cell: new FlatGround(), sand: 0 });
    expect(actions).toEqual(new Set([ToolType.Shovel]));
  });

  test('hole offers shovel and wall1 (no tower)', () => {
    const actions = validActionsFor({ cell: new Hole(2), sand: TOWER_COST });
    expect(actions).toEqual(new Set([ToolType.Shovel, ToolType.Wall1]));
  });

  test('level-1 wall offers only wall2 when affordable', () => {
    const actions = validActionsFor({ cell: new Wall(1), sand: 5 });
    expect(actions).toEqual(new Set([ToolType.Wall2]));
  });

  test('level-1 wall offers nothing when wall2 unaffordable', () => {
    const actions = validActionsFor({ cell: new Wall(1), sand: 4 });
    expect(actions).toEqual(new Set());
  });

  test('level-4 wall (maxed) offers nothing', () => {
    const actions = validActionsFor({ cell: new Wall(4), sand: 1000 });
    expect(actions).toEqual(new Set());
  });

  test('tower offers nothing', () => {
    const actions = validActionsFor({ cell: new Tower(15), sand: TOWER_COST });
    expect(actions).toEqual(new Set());
  });
});
```

**Step 3: Run, verify fail**

Run: `node --run test:unit -- src/view/terrain-editor.test.ts`
Expected: FAIL (old `ToolType.Wall` and old logic).

**Step 4: Rewrite `validActionsFor`** (`src/view/terrain-editor.ts`)

Update imports: add `Wall` from `../model/terrain/wall.ts`, `WALL_LEVEL_COST` from `../config.ts`, and `WALL_TOOL_LEVEL`, `WALL_TOOL_FOR_LEVEL` from `../tool-type.ts`.

```ts
export function validActionsFor({ cell, sand }: { cell: Terrain; sand: number }): Set<ToolType> {
  const actions = new Set<ToolType>();
  if (cell instanceof Tower) {
    return actions;
  }
  if (cell instanceof Wall) {
    const nextLevel = cell.level + 1;
    if (nextLevel <= 4 && sand >= WALL_LEVEL_COST[nextLevel - 1]) {
      actions.add(WALL_TOOL_FOR_LEVEL[nextLevel]);
    }
    return actions;
  }
  actions.add(ToolType.Shovel);
  if (sand >= WALL_LEVEL_COST[0]) {
    actions.add(ToolType.Wall1);
  }
  if (cell instanceof FlatGround && sand >= TOWER_COST) {
    actions.add(ToolType.Tower);
  }
  return actions;
}
```

**Step 5: Rewrite `applyAction` and simplify `availableActionsFor`** (`src/view/terrain-editor.ts`)

`availableActionsFor` (lines ~293-299) drops the delta-based wall deletion (per-level affordability now lives in `validActionsFor`):

```ts
private availableActionsFor(cell: Terrain): Set<ToolType> {
  return validActionsFor({ cell, sand: this.inventory?.sand ?? 0 });
}
```

`applyAction` (lines ~362-401): keep the `Shovel` and `Tower` branches; replace the single `Wall` branch with a level-driven branch:

```ts
const wallLevel = WALL_TOOL_LEVEL[tool];
if (wallLevel !== undefined) {
  const cost = WALL_LEVEL_COST[wallLevel - 1];
  if (!this.inventory.removeSand(cost)) {
    return;
  }
  if (!this.grid.placeWall(col, row, wallLevel)) {
    this.inventory.addSand(cost);
    return;
  }
  playSound(Resources.WallToolSound);
  this.afterEdit({ tool, cell: { col, row }, delta: cost });
  return;
}
```

Update `getStateText` (lines ~411-431): replace the single `ToolType.Wall` name push with the wall tools. Keep it simple:

```ts
if ([ToolType.Wall1, ToolType.Wall2, ToolType.Wall3, ToolType.Wall4].some(t => actions.has(t))) {
  names.push('wall');
}
```

**Step 6: Update the existing `TerrainEditor apply` tests** (`src/view/terrain-editor.test.ts`)

In the `describe('TerrainEditor apply', ...)` block, any test triggering `ToolType.Wall` must switch to `ToolType.Wall1` and assert level-based outcome (elevation 5 after building L1, sand reduced by 1). Tests that built a wall then "raised it again" with the same tool must select the upgrade tool (`Wall2`) and assert elevation 10 / sand −5. Find them:

```bash
grep -n "ToolType.Wall" src/view/terrain-editor.test.ts
```
Rewrite each to the new tools; assert behavior (resulting `getCell().elevation`, inventory sand), not internals.

**Step 7: Update toolbar tool defs** (`src/view/toolbar.ts`)

Add `WALL_LEVEL_COST` to the config import. Replace `TOOL_DEFS` (lines 10-14):

```ts
const TOOL_DEFS = [
  { type: ToolType.Shovel, hotkeyLabel: '1', spriteUrl: './images/shovel-sprite.png', sandEffect: { amount: 1, variant: 'earn' as const } },
  { type: ToolType.Wall1, hotkeyLabel: '2', spriteUrl: './images/wall-tool-sprite.png', sandEffect: { amount: WALL_LEVEL_COST[0], variant: 'spend' as const } },
  { type: ToolType.Wall2, hotkeyLabel: '3', spriteUrl: './images/wall-tool-sprite.png', sandEffect: { amount: WALL_LEVEL_COST[1], variant: 'spend' as const } },
  { type: ToolType.Wall3, hotkeyLabel: '4', spriteUrl: './images/wall-tool-sprite.png', sandEffect: { amount: WALL_LEVEL_COST[2], variant: 'spend' as const } },
  { type: ToolType.Wall4, hotkeyLabel: '5', spriteUrl: './images/wall-tool-sprite.png', sandEffect: { amount: WALL_LEVEL_COST[3], variant: 'spend' as const } },
  { type: ToolType.Tower, hotkeyLabel: '6', spriteUrl: './images/tower-sprite.png', sandEffect: { amount: TOWER_COST, variant: 'spend' as const } },
];
```

**Step 8: Bump toolbar slot count** (`src/ui/ToolbarComponent.tsx:26`)

```ts
const TOTAL_SLOTS = 6;
```

**Step 9: Verify the toolbar row fits six slots**

Open `src/ui/toolbar.css` and confirm the `.toolbar__slots` layout is not hard-coded to 5 (it uses flex/auto sizing). If a fixed width assumes 5 slots, allow it to size to content / shrink. Manual visual check in the running dev server: all six tools render in one row at the grid width; selecting flat ground enables only Shovel/Wall1/Tower, selecting an L1 wall enables only Wall2.

**Step 10: Run full static-check, confirm green**

Run: `node --run static-check`
Expected: tsc, lint, unit_test, knip, browser_test all `ok`. Fix any unused-export (knip) or lint issues (e.g. a leftover `delta`-only path).

**Step 11: Commit**

```bash
git add src/tool-type.ts src/view/terrain-editor.ts src/view/toolbar.ts src/ui/ToolbarComponent.tsx src/ui/toolbar.css src/view/terrain-editor.test.ts
git commit -m "feat: four dedicated wall-level tools in the toolbar"
```

---

## Task 3: Replay tool + debug serialization format

**Files:**
- Modify: `tools/replay-wave.ts:12-43`
- Modify: `AGENTS.md` (Debug Serialization section)

**Step 1: Update the deserializer** (`tools/replay-wave.ts`)

Extend the `SerializedTerrain` interface and the `wall` branch:

```ts
interface SerializedTerrain {
  type: string;
  height: number;
  level?: number;
  hp?: number;
  puddleDepth?: number;
}
```

```ts
if (data.type === "wall") {
  const level = data.level ?? Math.max(1, Math.min(4, Math.round(data.height / 5)));
  const wall = new Wall(level);
  if (typeof data.hp === "number") {
    wall.hp = data.hp;
  }
  return wall;
}
```

(The `?? Math.round(height/5)` fallback keeps older debug captures replayable.)

**Step 2: Verify the replay tool runs**

Run a minimal board through it:
```bash
echo '{"castle":{"col":7,"row":11,"width":2,"height":2},"cells":[[{"type":"wall","level":2,"hp":45}]],"columnHeights":[]}' | ./tools/replay-wave.ts
```
Expected: prints the grid (a level-2 wall reads as elevation 10), no crash.

**Step 3: Update the AGENTS.md debug format**

In the Debug Serialization section, change the wall example in the JSON to `{ "type": "wall", "height": 10, "level": 2, "hp": 45 }` and add a one-line note: walls serialize `level` (1–4) and `hp`; `height` is the derived blocking elevation.

**Step 4: Commit**

```bash
git add tools/replay-wave.ts AGENTS.md
git commit -m "feat: replay tool reads wall level+hp; document debug format"
```

---

## Task 4: Update gameplay design doc

**Files:**
- Modify: `docs/gameplay.md`

**Step 1: Rewrite the wall sections**

- Tool list (~line 33): replace the single Wall line with the four wall tools, costs 1/5/10/20, each placeable only atop the level below; note hotkeys 2–5 and Tower now hotkey 6.
- Mechanic summary referencing "raise by 1 for 1 sand": update to the level model.
- Block/overtop table (~lines 66-67): keep block/overtop semantics but describe wall blocking elevation as the level's elevation (5/10/15/20).
- Erosion section (~lines 94-102): replace the "lose 1 elevation step after 3 hits" description with: walls have cumulative HP (15/45/90/150 by level), take 1 HP of damage per qualifying overtopping-by-≥2 hit, hold full elevation until HP reaches 0, then the entire wall vanishes to flat ground with no sand refund; wall HP never auto-heals between waves or levels; shovel does not affect walls; the wall sand-redistribution behavior is removed (only holes still redistribute).

Use a mermaid diagram if it clarifies the level→elevation→HP relationship (per repo markdown preference).

**Step 2: Confirm no stale references remain**

```bash
grep -niE "raise .*by 1|wall .*1 sand|3 hits" docs/gameplay.md
```
Expected: no lines describing the old single-wall mechanic.

**Step 3: Commit**

```bash
git add docs/gameplay.md
git commit -m "docs: update gameplay for wall level redesign"
```

---

## Task 5: Final verification

**Step 1: Full static-check**

Run: `node --run static-check`
Expected: every stage `ok`.

**Step 2: Manual playtest checklist (dev server already running)**

- Build L1→L2→L3→L4 on one cell (costs 1,5,10,20; elevation rises 5→20); the four wall buttons light up one at a time.
- Shovel on a wall is disabled; shovel on flat digs a hole.
- Run waves: a low wall overtopped repeatedly vanishes entirely (no gradual shrink) and returns no sand.
- Advance a level: a partially-damaged wall keeps its reduced HP (no heal).
- Press **D**: clipboard JSON shows walls with `level` and `hp`.

**Step 3: Final commit (if the playtest required tweaks)**

```bash
git add -A
git commit -m "chore: wall redesign final polish"
```
