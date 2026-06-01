# Tower Terrain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Tower terrain type with its own tool, serialization refactor to push serialize() into Terrain, and rendering refactor to push render info into Terrain.

**Architecture:** Tower is a new Terrain subclass with fixed height 15, costs 15 sand, erodes every 10 hits (all configurable). Serialization moves from GridModel flat arrays into per-cell `serialize()` on Terrain. Rendering moves from Tile branching into `getRenderInfo()` on Terrain. Hole stores its own pool neighbor flags updated during `detectPools()`.

**Tech Stack:** TypeScript, Excalibur.js, Vitest, React (toolbar UI)

---

## Task 1: Add `serialize()` to Terrain base class and subclasses

**Files:**
- Modify: `src/model/terrain.ts`
- Test: `src/model/terrain.test.ts`

### Step 1: Write failing tests for serialize()

Add to each describe block in `src/model/terrain.test.ts`:

```typescript
// In describe('FlatGround')
test('serialize returns flat type with height 0', () => {
  const t = new FlatGround();
  expect(t.serialize()).toEqual({ type: 'flat', height: 0 });
});

// In describe('Wall')
test('serialize returns wall type with height', () => {
  const w = new Wall(7);
  expect(w.serialize()).toEqual({ type: 'wall', height: 7 });
});

// In describe('Hole')
test('serialize returns hole type with negative height and puddleDepth', () => {
  const h = new Hole(3);
  h.addPuddle(1.5);
  expect(h.serialize()).toEqual({ type: 'hole', height: -3, puddleDepth: 1.5 });
});
```

### Step 2: Run tests to verify they fail

Run: `npm run test:unit -- --run`
Expected: FAIL - `serialize is not a function`

### Step 3: Implement serialize() on Terrain

In `src/model/terrain.ts`, add the interface and abstract method:

```typescript
export interface SerializedTerrain {
  type: string;
  height: number;
  [key: string]: unknown;
}
```

On `Terrain` base class, add:
```typescript
abstract serialize(): SerializedTerrain;
```

On `FlatGround`:
```typescript
serialize(): SerializedTerrain {
  return { type: 'flat', height: 0 };
}
```

On `Wall`:
```typescript
serialize(): SerializedTerrain {
  return { type: 'wall', height: this.height };
}
```

On `Hole`:
```typescript
serialize(): SerializedTerrain {
  return { type: 'hole', height: this.elevation, puddleDepth: this.puddleDepth };
}
```

### Step 4: Run tests to verify they pass

Run: `npm run test:unit -- --run`
Expected: PASS

### Step 5: Commit

```bash
git add src/model/terrain.ts src/model/terrain.test.ts
git commit -m "feat: add serialize() to Terrain base class and subclasses"
```

---

## Task 2: Refactor GridModel serialization to use Terrain.serialize()

**Files:**
- Modify: `src/model/grid-model.ts`
- Test: `src/model/grid-model.test.ts`

### Step 1: Write failing tests for new serialization format

Replace the existing `describe('serialize')` block in `src/model/grid-model.test.ts` with tests for the new format:

```typescript
describe('serialize', () => {
  test('produces JSON with cells and castle object', () => {
    const grid = new GridModel({ width: 4, height: 3, castleCol: 2, castleRow: 1, castleWidth: 2, castleHeight: 2 });
    grid.setElevation(0, 0, 3);
    grid.setElevation(1, 0, -2);

    const result = JSON.parse(grid.serialize({ columnHeights: [1.5, 2.0, 3.0, 1.0] }));

    expect(result.castle).toEqual({ col: 2, row: 1, width: 2, height: 2 });
    expect(result.columnHeights).toEqual([1.5, 2.0, 3.0, 1.0]);
    expect(result.cells[0][0]).toEqual({ type: 'wall', height: 3 });
    expect(result.cells[0][1]).toEqual({ type: 'hole', height: -2, puddleDepth: 0 });
    expect(result.cells[0][2]).toEqual({ type: 'flat', height: 0 });
    // No elevations or puddleDepths at root level
    expect(result.elevations).toBeUndefined();
    expect(result.puddleDepths).toBeUndefined();
  });

  test('defaults columnHeights to empty array', () => {
    const grid = new GridModel({ width: 2, height: 2, castleCol: 0, castleRow: 0, castleWidth: 2, castleHeight: 2 });
    const result = JSON.parse(grid.serialize());
    expect(result.columnHeights).toEqual([]);
  });

  test('includes puddleDepth in hole cells', () => {
    const grid = new GridModel({ width: 3, height: 2, castleCol: 1, castleRow: 1, castleWidth: 2, castleHeight: 2 });
    grid.setElevation(0, 0, -3);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 1.5 }]);

    const result = JSON.parse(grid.serialize());
    expect(result.cells[0][0]).toEqual({ type: 'hole', height: -3, puddleDepth: 1.5 });
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npm run test:unit -- --run`
Expected: FAIL - old format doesn't have `cells` or `castle`

### Step 3: Update GridModel.serialize()

In `src/model/grid-model.ts`, replace `serialize()` (lines 340-350):

```typescript
serialize(input?: SerializeInput): string {
  return JSON.stringify({
    castle: {
      col: this.castleCol,
      row: this.castleRow,
      width: this.castleWidth,
      height: this.castleHeight,
    },
    cells: this.cells.map(row => row.map(cell => cell.serialize())),
    columnHeights: input?.columnHeights ?? [],
  });
}
```

Remove the `SerializeInput` interface (line 41-43) only if `columnHeights` is the only field. Actually, keep `SerializeInput` as-is since it serves the same purpose.

Also remove `castleCol`/`castleRow` from the old output - they're now inside `castle`.

### Step 4: Run tests to verify they pass

Run: `npm run test:unit -- --run`
Expected: PASS

### Step 5: Commit

```bash
git add src/model/grid-model.ts src/model/grid-model.test.ts
git commit -m "feat: refactor GridModel serialization to use Terrain.serialize()"
```

---

## Task 3: Update replay tool for new serialization format

**Files:**
- Modify: `tools/replay-wave.ts`

### Step 1: Update the replay tool

Replace the `BoardState` interface and `parse()` function, and update the pool detection and simulation call. The tool reads stdin JSON, so update it to parse `cells` and `castle`:

```typescript
interface SerializedTerrain {
  type: string;
  height: number;
  puddleDepth?: number;
}

interface BoardState {
  castle: { col: number; row: number; width: number; height: number };
  cells: SerializedTerrain[][];
  columnHeights: number[];
}
```

Extract elevations and puddleDepths from cells:
```typescript
const elevations = parsed.cells.map(row => row.map(cell => cell.height));
const puddleDepths = parsed.cells.map(row =>
  row.map(cell => cell.puddleDepth ?? 0),
);
```

Update castle references:
```typescript
const { castle, columnHeights } = parsed;
```

Update pool detection to use `cell.height < 0` instead of `elevations[row][col] < 0` (or keep using the extracted elevations array).

Update `simulateWave` call to use `castle.col`, `castle.row`, `castle.width`, `castle.height`.

Note: `simulateWave` now takes `cells: Terrain[][]` not `elevations`. The replay tool needs to reconstruct Terrain objects from serialized data. Add a `deserialize` function:

```typescript
import { FlatGround, Wall, Hole, type Terrain } from '../src/model/terrain.ts';

function deserializeTerrain(data: SerializedTerrain): Terrain {
  if (data.type === 'hole') {
    const hole = new Hole(-data.height);
    if (data.puddleDepth) {
      hole.addPuddle(data.puddleDepth);
    }
    return hole;
  }
  if (data.height > 0) {
    return new Wall(data.height);
  }
  return new FlatGround();
}
```

Reconstruct the cells grid:
```typescript
const cells = parsed.cells.map(row => row.map(deserializeTerrain));
```

Pass `cells` to `simulateWave` along with the other params.

### Step 2: Test manually

```bash
echo '{"castle":{"col":10,"row":15,"width":2,"height":2},"cells":[[{"type":"flat","height":0},{"type":"wall","height":3}]],"columnHeights":[2.0,2.0]}' | ./tools/replay-wave.ts
```

Expected: output with advance/recede maps, no crashes.

### Step 3: Commit

```bash
git add tools/replay-wave.ts
git commit -m "feat: update replay tool for new cell-based serialization format"
```

---

## Task 4: Add Tower terrain class

**Files:**
- Modify: `src/model/terrain.ts`
- Modify: `src/config.ts`
- Test: `src/model/terrain.test.ts`

### Step 1: Add config constants

In `src/config.ts`, add after the existing constants (around line 27):

```typescript
export const TOWER_HEIGHT = 15;
export const TOWER_COST = 15;
export const TOWER_HITS_PER_EROSION = 10;
```

### Step 2: Write failing tests for Tower

Add a new describe block to `src/model/terrain.test.ts`:

```typescript
import { FlatGround, Hole, Tower, Wall } from './terrain.ts';

describe('Tower', () => {
  test('elevation equals height', () => {
    const t = new Tower(15);
    expect(t.elevation).toBe(15);
  });

  test('clamps height to MAX_ELEVATION', () => {
    const t = new Tower(25);
    expect(t.elevation).toBe(20);
  });

  test('onWaterHit blocks when tower height >= water surface', () => {
    const t = new Tower(15);
    const col = new WaterColumn(0, 10);
    const event = t.onWaterHit(col, 'north');
    expect(event).toBe('blocked');
    expect(col.depth).toBe(0);
  });

  test('onWaterHit overtops when tower between floor and surface', () => {
    const t = new Tower(5);
    const col = new WaterColumn(0, 10);
    const event = t.onWaterHit(col, 'north');
    expect(event).toBe('overtopped');
    expect(col.floorLevel).toBe(5);
  });

  test('onWaterHit accumulates hits when water depth >= 2 above tower', () => {
    const t = new Tower(5);
    const col = new WaterColumn(0, 10);
    t.onWaterHit(col, 'north');
    expect(t.hitCount).toBe(1);
  });

  test('erodes after TOWER_HITS_PER_EROSION hits', () => {
    const t = new Tower(15);
    for (let i = 0; i < 10; i++) {
      t.onWaterHit(new WaterColumn(0, 20), 'north');
    }
    expect(t.elevation).toBe(14);
    expect(t.hitCount).toBe(0);
  });

  test('does not erode before reaching hit threshold', () => {
    const t = new Tower(15);
    for (let i = 0; i < 9; i++) {
      t.onWaterHit(new WaterColumn(0, 20), 'north');
    }
    expect(t.elevation).toBe(15);
    expect(t.hitCount).toBe(9);
  });

  test('applyHits erodes using TOWER_HITS_PER_EROSION threshold', () => {
    const t = new Tower(15);
    const result = t.applyHits(10);
    expect(result).toEqual({ newElevation: 14 });
  });

  test('applyHits handles multiple erosions', () => {
    const t = new Tower(15);
    t.applyHits(20);
    expect(t.elevation).toBe(13);
  });

  test('applyDelta returns self unchanged (immutable to tools)', () => {
    const t = new Tower(15);
    const result = t.applyDelta(5);
    expect(result).toBe(t);
    expect(t.elevation).toBe(15);
  });

  test('applyDelta with negative returns self unchanged', () => {
    const t = new Tower(15);
    const result = t.applyDelta(-5);
    expect(result).toBe(t);
    expect(t.elevation).toBe(15);
  });

  test('serialize returns tower type with height', () => {
    const t = new Tower(15);
    expect(t.serialize()).toEqual({ type: 'tower', height: 15 });
  });

  test('resetHits clears hit count', () => {
    const t = new Tower(15);
    t.applyHits(5);
    expect(t.hitCount).toBe(5);
    t.resetHits();
    expect(t.hitCount).toBe(0);
  });

  test('becomes FlatGround when fully eroded', () => {
    const t = new Tower(1);
    t.applyHits(10);
    expect(t.elevation).toBe(0);
  });
});
```

### Step 3: Run tests to verify they fail

Run: `npm run test:unit -- --run`
Expected: FAIL - `Tower` not exported

### Step 4: Implement Tower class

In `src/model/terrain.ts`, add the Tower class after Wall (around line 140):

```typescript
import { MAX_ELEVATION, MIN_ELEVATION, TOWER_HITS_PER_EROSION } from '../config.ts';

export class Tower extends Terrain {
  height: number;
  hitCount: number = 0;

  constructor(height: number) {
    super();
    this.height = Math.min(height, MAX_ELEVATION);
  }

  get elevation(): number {
    return this.height;
  }

  get sprite(): ImageSource | null {
    return Resources.TowerSprite;
  }

  onWaterHit(
    column: WaterColumn,
    _direction: CardinalDirection,
  ): WallEvent {
    if (column.isEmpty()) {
      return null;
    }

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

  applyDelta(_amount: number): Terrain {
    return this;
  }

  serialize(): SerializedTerrain {
    return { type: 'tower', height: this.height };
  }

  resetHits(): void {
    this.hitCount = 0;
  }
}
```

Note: `Resources.TowerSprite` doesn't exist yet. The `sprite` getter will be used by the rendering refactor later. For now, the tests don't test `sprite` directly since it requires resource loading. We'll add the resource in a later task.

Temporarily return `null` from `get sprite()` until the resource is registered:
```typescript
get sprite(): ImageSource | null {
  return null;
}
```

### Step 5: Run tests to verify they pass

Run: `npm run test:unit -- --run`
Expected: PASS

### Step 6: Commit

```bash
git add src/model/terrain.ts src/model/terrain.test.ts src/config.ts
git commit -m "feat: add Tower terrain class with configurable erosion"
```

---

## Task 5: Add Tower to GridModel (placement + erosion + hit counting)

**Files:**
- Modify: `src/model/grid-model.ts`
- Test: `src/model/grid-model.test.ts`

### Step 1: Write failing tests

Add tests to `src/model/grid-model.test.ts`:

```typescript
import { Tower } from './terrain.ts';

describe('placeTower', () => {
  test('places tower on flat ground', ({ grid }) => {
    grid.placeTower(3, 3);
    expect(grid.getElevation(3, 3)).toBe(15);
    expect(grid.getCell(3, 3)).toBeInstanceOf(Tower);
  });

  test('returns false on non-flat ground', ({ grid }) => {
    grid.setElevation(3, 3, 5);
    expect(grid.placeTower(3, 3)).toBe(false);
    expect(grid.getCell(3, 3)).not.toBeInstanceOf(Tower);
  });

  test('returns false on castle cell', ({ grid }) => {
    expect(grid.placeTower(8, 12)).toBe(false);
  });

  test('returns false out of bounds', ({ grid }) => {
    expect(grid.placeTower(-1, 0)).toBe(false);
  });

  test('tower immutable to setElevation', ({ grid }) => {
    grid.placeTower(3, 3);
    grid.setElevation(3, 3, -5);
    expect(grid.getElevation(3, 3)).toBe(15);
    expect(grid.getCell(3, 3)).toBeInstanceOf(Tower);
  });
});

describe('tower erosion', () => {
  test('tower erodes after TOWER_HITS_PER_EROSION hits via applyErosion', ({ grid }) => {
    grid.placeTower(0, 0);
    const w = 16;
    const h = 16;
    const advance = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));
    const recede = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));
    advance[0][0] = 20;
    recede[0][0] = 20;

    // 5 rounds of 2 hits each = 10 hits total
    for (let i = 0; i < 5; i++) {
      grid.applyErosion(advance, recede);
    }
    expect(grid.getElevation(0, 0)).toBe(14);
  });

  test('tower hit count increments correctly', ({ grid }) => {
    grid.placeTower(0, 0);
    grid.incrementHitCount(0, 0, 5);
    expect(grid.getHitCount(0, 0)).toBe(5);
  });
});

describe('tower serialization', () => {
  test('tower appears in serialized cells', ({ grid }) => {
    grid.placeTower(3, 3);
    const result = JSON.parse(grid.serialize());
    expect(result.cells[3][3]).toEqual({ type: 'tower', height: 15 });
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npm run test:unit -- --run`
Expected: FAIL - `placeTower` not defined

### Step 3: Implement placeTower and update hit counting

In `src/model/grid-model.ts`:

Add Tower import:
```typescript
import { Terrain, FlatGround, Wall, Hole, Tower } from './terrain.ts';
```

Add `placeTower` method:
```typescript
placeTower(col: number, row: number): boolean {
  if (!this.inBounds(col, row)) {
    return false;
  }
  if (this.isCastle(col, row)) {
    return false;
  }
  if (!(this.cells[row][col] instanceof FlatGround)) {
    return false;
  }
  this.cells[row][col] = new Tower(TOWER_HEIGHT);
  return true;
}
```

Add `TOWER_HEIGHT` import from config.

Update `getHitCount` (lines 164-173) and `incrementHitCount` (lines 175-185) to handle Tower:

```typescript
getHitCount(col: number, row: number): number {
  const cell = this.getCell(col, row);
  if (cell instanceof Wall || cell instanceof Hole || cell instanceof Tower) {
    return cell.hitCount;
  }
  return 0;
}

incrementHitCount(col: number, row: number, amount: number): void {
  if (!this.inBounds(col, row)) {
    return;
  }
  const cell = this.cells[row][col];
  if (cell instanceof Wall || cell instanceof Hole || cell instanceof Tower) {
    cell.hitCount += amount;
  }
}
```

The `applyErosion` method already calls `cell.applyHits()` polymorphically, so Tower erosion works automatically. However, the erosion cleanup at line 224 (`if (cell.elevation === 0) { this.cells[row][col] = new FlatGround(); }`) will also convert a fully-eroded Tower to FlatGround, which is correct.

### Step 4: Run tests to verify they pass

Run: `npm run test:unit -- --run`
Expected: PASS

### Step 5: Run typecheck

Run: `npm run build`
Expected: PASS

### Step 6: Commit

```bash
git add src/model/grid-model.ts src/model/grid-model.test.ts
git commit -m "feat: add placeTower to GridModel with hit counting support"
```

---

## Task 6: Add TowerSprite resource and Tower tool type

**Files:**
- Modify: `src/resources.ts`
- Modify: `src/tool-type.ts`
- Modify: `src/config.ts` (if not already done)

### Step 1: Add TowerSprite to resources

In `src/resources.ts`, add to the Resources object:

```typescript
TowerSprite: new ImageSource('./images/tower-sprite.png'),
TowerToolSound: new Sound('./sound/wall_tool_sound.mp3'), // reuse wall sound for now
```

Add to the loader array:
```typescript
Resources.TowerSprite,
Resources.TowerToolSound,
```

### Step 2: Add Tower to ToolType enum

In `src/tool-type.ts`:

```typescript
export enum ToolType {
  Shovel = 'shovel',
  Wall = 'wall',
  Tower = 'tower',
}
```

### Step 3: Update Tower.sprite to use TowerSprite

In `src/model/terrain.ts`, update the Tower class `sprite` getter:

```typescript
get sprite(): ImageSource | null {
  return Resources.TowerSprite;
}
```

### Step 4: Run typecheck

Run: `npm run build`
Expected: PASS

### Step 5: Commit

```bash
git add src/resources.ts src/tool-type.ts src/model/terrain.ts
git commit -m "feat: add TowerSprite resource and Tower tool type"
```

---

## Task 7: Add Tower tool to toolbar

**Files:**
- Modify: `src/view/toolbar.ts`

### Step 1: Add Tower tool definition

In `src/view/toolbar.ts`, add to `TOOL_DEFS` array (line 10-13):

```typescript
const TOOL_DEFS = [
  { type: ToolType.Shovel, hotkeyLabel: '1', spriteUrl: './images/shovel-sprite.png', sandEffect: { amount: 1, variant: 'earn' as const } },
  { type: ToolType.Wall, hotkeyLabel: '2', spriteUrl: './images/wall-tool-sprite.png', sandEffect: { amount: 1, variant: 'spend' as const } },
  { type: ToolType.Tower, hotkeyLabel: '3', spriteUrl: './images/tower-sprite.png', sandEffect: { amount: TOWER_COST, variant: 'spend' as const } },
];
```

Import `TOWER_COST` from config:
```typescript
import { computeLayout, TILEMAP_SAND_ROWS, TOWER_COST } from '../config.ts';
```

### Step 2: Add disabled state for insufficient sand

The toolbar needs to know the current sand count to disable the tower tool. Add a `sandCount` property to the Toolbar class and pass it through to the component.

In `src/view/toolbar.ts`, add to the Toolbar class:

```typescript
private _sandCount = 0;

setSandCount(count: number): void {
  this._sandCount = count;
  this.render();
}
```

Update `TOOL_DEFS` to be a method so it can use dynamic sand count, or add a `disabledTools` prop to the component. The simpler approach: add a `disabledTools` set to the render props.

In the `render()` method, compute which tools are disabled:
```typescript
private getDisabledTools(): Set<ToolType> {
  const disabled = new Set<ToolType>();
  for (const tool of TOOL_DEFS) {
    if (tool.sandEffect?.variant === 'spend' && tool.sandEffect.amount > this._sandCount) {
      disabled.add(tool.type);
    }
  }
  return disabled;
}
```

Pass `disabledTools` to ToolbarComponent:
```typescript
this.root?.render(
  createElement(ToolbarComponent, {
    tools: TOOL_DEFS,
    activeTool: this.activeTool,
    disabled: this._disabled,
    disabledTools: this.getDisabledTools(),
    onToolSelected: (tool: ToolType) => this.selectTool(tool),
  })
);
```

### Step 3: Update ToolbarComponent to show disabled tools

In `src/ui/ToolbarComponent.tsx`, add `disabledTools` to props:

```typescript
interface ToolbarProps {
  tools: ToolDef[];
  activeTool: ToolType;
  disabled: boolean;
  disabledTools: Set<ToolType>;
  onToolSelected: (tool: ToolType) => void;
}
```

In the slot rendering, add a disabled class and prevent clicks:

```typescript
const isToolDisabled = tool && disabledTools.has(tool.type);
// In the className:
`toolbar__slot ${isActive ? 'toolbar__slot--active' : ''} ${tool ? 'toolbar__slot--filled' : ''} ${isToolDisabled ? 'toolbar__slot--tool-disabled' : ''}`
// In onClick:
if (!disabled && tool && !isToolDisabled) {
  onToolSelected(tool.type);
}
```

Add CSS for disabled state in the toolbar CSS file (visual dimming).

### Step 4: Wire up sandCount updates

In `src/view/planning-phase.ts`, wherever `onSandChanged` fires, also call `toolbar.setSandCount()`. This is already wired through the `DiggingStrategyOptions.onSandChanged` callback. Update the planning phase to call `toolbar.setSandCount(inventory.sand)` on activation and in the sand changed callback.

### Step 5: Run typecheck and verify in browser

Run: `npm run build`
Expected: PASS

### Step 6: Commit

```bash
git add src/view/toolbar.ts src/ui/ToolbarComponent.tsx src/view/planning-phase.ts
git commit -m "feat: add Tower tool to toolbar with sand-based disabling"
```

---

## Task 8: Handle Tower tool clicks in SingleCellDigging

**Files:**
- Modify: `src/view/single-cell-digging.ts`
- Modify: `src/view/grid-view.ts`

### Step 1: Add tower cursor

In `src/view/single-cell-digging.ts`, add a tower cursor constant:

```typescript
const CURSOR_TOWER = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect x="6" y="2" width="12" height="20" rx="2" fill="#8B8B8B" stroke="#555" stroke-width="1.5"/><rect x="8" y="5" width="3" height="3" fill="#555"/><rect x="13" y="5" width="3" height="3" fill="#555"/><rect x="8" y="12" width="3" height="3" fill="#555"/><rect x="13" y="12" width="3" height="3" fill="#555"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
})();
```

### Step 2: Update applyCursor

```typescript
private applyCursor(): void {
  if (!this.canvas || !this.toolbar) {
    return;
  }
  if (this.toolbar.active === ToolType.Shovel) {
    this.canvas.style.cursor = CURSOR_SHOVEL;
  } else if (this.toolbar.active === ToolType.Tower) {
    this.canvas.style.cursor = CURSOR_TOWER;
  } else {
    this.canvas.style.cursor = CURSOR_WALL;
  }
}
```

### Step 3: Add tower placement to handleClick

In `handleClick()`, after the Wall block (line 150-162), add:

```typescript
if (activeTool === ToolType.Tower) {
  if (!this.inventory.removeSand(TOWER_COST)) {
    return;
  }
  if (!this.grid.placeTower(col, row)) {
    this.inventory.addSand(TOWER_COST);
    return;
  }
  this.onSandChanged?.(this.inventory.sand);
  Resources.WallToolSound.play();
  this.onScoopComplete?.({
    tool: ToolType.Tower,
    cell: { col, row },
    delta: TOWER_COST,
  });
  return;
}
```

Import `TOWER_COST` from config.

### Step 4: Add placeTower to GridView

In `src/view/grid-view.ts`, add:

```typescript
placeTower(col: number, row: number): boolean {
  const result = this.model.placeTower(col, row);
  if (result) {
    this.refreshTileVisual(col, row);
  }
  return result;
}
```

Update `handleClick` in single-cell-digging to call `this.grid.placeTower(col, row)` instead of `this.grid.model.placeTower(col, row)`.

### Step 5: Update hover feedback for tower tool

In `onTileEnter()`, add tower tool case:

```typescript
if (this.toolbar.active === ToolType.Tower) {
  const cell = this.grid.model.getCell(tile.col, tile.row);
  const canPlace = cell instanceof FlatGround && (this.inventory?.sand ?? 0) >= TOWER_COST;
  tile.graphics.use(new Rectangle({
    width: w,
    height: h,
    color: canPlace
      ? Color.fromRGB(100, 220, 100, 0.7)
      : Color.fromRGB(220, 80, 80, 0.7),
  }));
  return;
}
```

Import `FlatGround` from terrain, `TOWER_COST` from config.

### Step 6: Update getStateText

```typescript
getStateText(): string {
  if (!this.toolbar) {
    return 'Click a tile to dig';
  }
  if (this.toolbar.active === ToolType.Shovel) {
    return 'Click a tile to dig';
  }
  if (this.toolbar.active === ToolType.Tower) {
    if ((this.inventory?.sand ?? 0) < TOWER_COST) {
      return 'Not enough sand for tower';
    }
    return 'Click flat ground to place tower';
  }
  if (!this.inventory?.hasSand) {
    return 'No sand - dig first';
  }
  return 'Click a tile to build wall';
}
```

### Step 7: Run typecheck and test in browser

Run: `npm run build`
Expected: PASS

### Step 8: Commit

```bash
git add src/view/single-cell-digging.ts src/view/grid-view.ts
git commit -m "feat: handle Tower tool clicks and hover feedback"
```

---

## Task 9: Rendering refactor - getRenderInfo() on Terrain

**Files:**
- Modify: `src/model/terrain.ts`
- Modify: `src/view/tile.ts`
- Test: `src/model/terrain.test.ts`

### Step 1: Write failing tests for getRenderInfo

In `src/model/terrain.test.ts`, add to each describe block:

```typescript
// FlatGround
test('getRenderInfo returns null sprite and no customDraw', () => {
  const t = new FlatGround();
  const info = t.getRenderInfo();
  expect(info.sprite).toBeNull();
  expect(info.tint).toBeNull();
  expect(info.customDraw).toBeUndefined();
});

// Wall
test('getRenderInfo returns sprite with tint', () => {
  const w = new Wall(3);
  const info = w.getRenderInfo();
  expect(info.sprite).not.toBeNull();
  expect(info.tint).not.toBeNull();
  expect(info.customDraw).toBeUndefined();
});

// Hole
test('getRenderInfo returns customDraw function', () => {
  const h = new Hole(3);
  const info = h.getRenderInfo();
  expect(info.sprite).toBeNull();
  expect(info.tint).toBeNull();
  expect(info.customDraw).toBeInstanceOf(Function);
});

// Tower
test('getRenderInfo returns tower sprite with no tint', () => {
  const t = new Tower(15);
  const info = t.getRenderInfo();
  expect(info.sprite).not.toBeNull();
  expect(info.tint).toBeNull();
  expect(info.customDraw).toBeUndefined();
});
```

### Step 2: Run tests to verify they fail

Run: `npm run test:unit -- --run`
Expected: FAIL - `getRenderInfo is not a function`

### Step 3: Define TileRenderInfo and implement getRenderInfo

In `src/model/terrain.ts`, add the interface:

```typescript
import { Color, type ImageSource } from 'excalibur';

export interface PoolNeighborFlags {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export interface TileRenderInfo {
  sprite: ImageSource | null;
  tint: Color | null;
  customDraw?: (ctx: CanvasRenderingContext2D, width: number, height: number, neighbors?: PoolNeighborFlags) => void;
}
```

Add abstract method to Terrain:
```typescript
abstract getRenderInfo(): TileRenderInfo;
```

**FlatGround:**
```typescript
getRenderInfo(): TileRenderInfo {
  return { sprite: null, tint: null };
}
```

**Wall** - move the tier/tint logic from tile.ts:
```typescript
getRenderInfo(): TileRenderInfo {
  const tiers = [
    { min: 1, max: 5, resource: Resources.WallLevel1 },
    { min: 6, max: 10, resource: Resources.WallLevel2 },
    { min: 11, max: 15, resource: Resources.WallLevel3 },
    { min: 16, max: 20, resource: Resources.WallLevel4 },
  ];
  for (const tier of tiers) {
    if (this.height >= tier.min && this.height <= tier.max) {
      const t = (this.height - tier.min) / (tier.max - tier.min);
      const r = 255;
      const g = Math.round(255 - t * 40);
      const b = Math.round(255 - t * 100);
      return { sprite: tier.resource, tint: Color.fromRGB(r, g, b) };
    }
  }
  return { sprite: null, tint: null };
}
```

**Hole** - provide a `customDraw` that encapsulates the canvas rendering logic currently in tile.ts. The Hole needs neighbor flags, which it stores (see Task 10). For now, neighbors are passed as a param to `customDraw`:

```typescript
getRenderInfo(): TileRenderInfo {
  return {
    sprite: null,
    tint: null,
    customDraw: (ctx, width, height, neighbors) => {
      // Move the hole canvas rendering logic from tile.ts here
      // Uses this.elevation, this.puddleDepth, this.depth, and neighbors
    },
  };
}
```

The full hole drawing logic from tile.ts (lines 134-208) moves into this function, referencing `this.elevation`, `this.puddleDepth`, etc. directly.

**Tower:**
```typescript
getRenderInfo(): TileRenderInfo {
  return { sprite: Resources.TowerSprite, tint: null };
}
```

### Step 4: Update Tile to use getRenderInfo

In `src/view/tile.ts`, simplify `updateVisual()`:

```typescript
updateVisual(neighbors?: PoolNeighbors): void {
  const terrain = this.terrain; // need to pass terrain to tile (see note)
  if (!terrain || this.elevation === 0) {
    this.graphics.use(flatRect);
    return;
  }

  const info = terrain.getRenderInfo();

  if (info.sprite && !info.customDraw) {
    // Wall or Tower
    const cacheKey = `${info.sprite.path}:${this.elevation}`;
    const cached = graphicsCache.get(cacheKey);
    if (cached) {
      this.graphics.use(cached);
      return;
    }
    const sprite = info.sprite.toSprite();
    sprite.width = TILE_SIZE - 1;
    sprite.height = TILE_SIZE - 1;
    if (info.tint) {
      sprite.tint = info.tint;
    }
    graphicsCache.set(cacheKey, sprite);
    this.graphics.use(sprite);
    return;
  }

  if (info.customDraw) {
    // Hole
    const nKey = neighbors ? `${+neighbors.top}${+neighbors.bottom}${+neighbors.left}${+neighbors.right}` : '0000';
    const cacheKey = `${this.elevation}:${this.puddleDepth}:${nKey}`;
    const cached = graphicsCache.get(cacheKey);
    if (cached) {
      this.graphics.use(cached);
      return;
    }
    const canvas = new Canvas({
      width: TILE_SIZE,
      height: TILE_SIZE,
      cache: true,
      draw: (ctx) => info.customDraw!(ctx, TILE_SIZE, TILE_SIZE, neighbors),
    });
    graphicsCache.set(cacheKey, canvas);
    this.graphics.use(canvas);
    return;
  }

  this.graphics.use(flatRect);
}
```

**Note:** The Tile currently doesn't hold a reference to the Terrain object. The `refreshTileVisual` in grid-view.ts needs to pass the terrain to the tile. Update `Tile` to accept terrain or update `refreshTileVisual` to pass the terrain's render info. Simplest: add a `terrain` property to Tile that gets set during refresh:

In `src/view/grid-view.ts` `refreshTileVisual`:
```typescript
refreshTileVisual(col: number, row: number): void {
  const tile = this.getTile(col, row);
  if (!tile) {
    return;
  }
  tile.elevation = this.model.getElevation(col, row);
  tile.puddleDepth = this.model.getPuddleDepth(col, row);
  tile.waveHitCount = this.model.getHitCount(col, row);
  tile.terrain = this.model.getCell(col, row);
  const neighbors = this.model.getPoolNeighbors(col, row);
  tile.updateVisual(neighbors ?? undefined);
}
```

Add to Tile class:
```typescript
terrain: Terrain | null = null;
```

### Step 5: Remove old rendering logic from tile.ts

Remove `WALL_TIERS`, `elevationToColor`, and all the elevation-based branching from `updateVisual`. The `elevationToColor` function moves into `Hole.getRenderInfo()` (only holes use it now).

### Step 6: Run tests and typecheck

Run: `npm run test:unit -- --run && npm run build`
Expected: PASS

### Step 7: Commit

```bash
git add src/model/terrain.ts src/model/terrain.test.ts src/view/tile.ts src/view/grid-view.ts
git commit -m "refactor: move rendering logic into Terrain.getRenderInfo()"
```

---

## Task 10: Store pool neighbor flags on Hole during detectPools

**Files:**
- Modify: `src/model/terrain.ts` (add `neighbors` field to Hole)
- Modify: `src/model/grid-model.ts` (update detectPools to set neighbors)
- Test: `src/model/grid-model.test.ts`

### Step 1: Write failing test

```typescript
describe('pool neighbor flags on Hole', () => {
  test('detectPools sets neighbor flags on holes', ({ grid }) => {
    grid.setElevation(3, 3, -1);
    grid.setElevation(4, 3, -1);
    grid.setElevation(3, 4, -1);

    const hole33 = grid.getCell(3, 3) as Hole;
    expect(hole33.neighbors).toEqual({
      top: false,
      bottom: true,
      left: false,
      right: true,
    });
  });

  test('isolated hole has all false neighbors', ({ grid }) => {
    grid.setElevation(3, 3, -1);
    const hole = grid.getCell(3, 3) as Hole;
    expect(hole.neighbors).toEqual({
      top: false,
      bottom: false,
      left: false,
      right: false,
    });
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npm run test:unit -- --run`
Expected: FAIL - `neighbors` undefined on Hole

### Step 3: Add neighbors field to Hole

In `src/model/terrain.ts`, add to the Hole class:

```typescript
neighbors: PoolNeighborFlags = { top: false, bottom: false, left: false, right: false };
```

### Step 4: Update detectPools to set neighbor flags

In `src/model/grid-model.ts`, at the end of `detectPools()`, after building pools, iterate each pool and set neighbor flags:

```typescript
detectPools(): void {
  // ... existing BFS code ...

  // Set neighbor flags on each hole
  for (const pool of this.pools) {
    for (const { col, row } of pool.members) {
      const cell = this.cells[row][col];
      if (cell instanceof Hole) {
        cell.neighbors = {
          top: this.poolMap.get(`${col}:${row - 1}`) === this.poolMap.get(`${col}:${row}`),
          bottom: this.poolMap.get(`${col}:${row + 1}`) === this.poolMap.get(`${col}:${row}`),
          left: this.poolMap.get(`${col - 1}:${row}`) === this.poolMap.get(`${col}:${row}`),
          right: this.poolMap.get(`${col + 1}:${row}`) === this.poolMap.get(`${col}:${row}`),
        };
      }
    }
  }

  // Also reset neighbors on holes that are no longer in pools (edge case: hole filled in)
  // This is handled implicitly since detectPools rebuilds from scratch
}
```

### Step 5: Update Hole.getRenderInfo to use stored neighbors

Instead of passing neighbors into `customDraw`, the Hole reads its own `this.neighbors`:

```typescript
getRenderInfo(): TileRenderInfo {
  const neighbors = this.neighbors;
  // ... use neighbors directly in customDraw closure
}
```

Update the `customDraw` signature to not require the neighbors parameter (it captures `this.neighbors` in the closure).

### Step 6: Run tests to verify they pass

Run: `npm run test:unit -- --run`
Expected: PASS

### Step 7: Commit

```bash
git add src/model/terrain.ts src/model/grid-model.ts src/model/grid-model.test.ts
git commit -m "feat: store pool neighbor flags on Hole during detectPools"
```

---

## Task 11: Update replay tool for Tower deserialization

**Files:**
- Modify: `tools/replay-wave.ts`

### Step 1: Add Tower to deserializeTerrain

Update the `deserializeTerrain` function in `tools/replay-wave.ts`:

```typescript
import { FlatGround, Wall, Hole, Tower } from '../src/model/terrain.ts';

function deserializeTerrain(data: SerializedTerrain): Terrain {
  if (data.type === 'tower') {
    return new Tower(data.height);
  }
  if (data.type === 'hole') {
    const hole = new Hole(-data.height);
    if (data.puddleDepth) {
      hole.addPuddle(data.puddleDepth);
    }
    return hole;
  }
  if (data.height > 0) {
    return new Wall(data.height);
  }
  return new FlatGround();
}
```

### Step 2: Test manually

```bash
echo '{"castle":{"col":10,"row":15,"width":2,"height":2},"cells":[[{"type":"tower","height":15},{"type":"flat","height":0}]],"columnHeights":[5.0,5.0]}' | ./tools/replay-wave.ts
```

Expected: Tower blocks/overtops water in output.

### Step 3: Commit

```bash
git add tools/replay-wave.ts
git commit -m "feat: add Tower deserialization to replay tool"
```

---

## Task 12: Final integration testing

### Step 1: Run full test suite

```bash
npm run test:unit -- --run
```

Expected: All tests pass.

### Step 2: Run typecheck

```bash
npm run build
```

Expected: No type errors.

### Step 3: Run lint

```bash
npm run lint 2>/dev/null || echo "No lint script"
```

### Step 4: Manual browser testing

Open the dev server and verify:
1. Tower tool appears in toolbar slot 3 with hotkey "3"
2. Tower tool shows cost badge of 15
3. Tower tool is disabled when sand < 15
4. Clicking flat ground with tower tool places tower (tower sprite renders)
5. Clicking wall/hole/tower with tower tool does nothing (red highlight)
6. Tower blocks water during wave phase
7. Tower erodes much slower than walls
8. Shoveling a tower does nothing
9. Press D to copy debug state - verify new JSON format with `cells` array and tower entries
10. Paste debug JSON into replay tool - verify it works

### Step 5: Commit any fixes, then final commit if needed

```bash
git add -A
git commit -m "test: verify tower terrain integration"
```
