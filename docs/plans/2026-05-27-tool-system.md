# Tool System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the scoop/dump mechanic with a tool selection system where shovel digs (collecting sand) and wall tool places sand, managed through a persistent toolbar UI.

**Architecture:** New `InventoryModel` owns sand count. New `ToolType` enum and toolbar view manage tool selection. `PlanningPhase` routes clicks through the active tool instead of the current two-step scoop/dump flow. `SingleCellDigging` is split into two tool behaviors. Enhanced shovel mechanic removed.

**Tech Stack:** Excalibur.js, TypeScript, Vitest

---

### Task 1: Create InventoryModel

**Files:**
- Create: `src/model/inventory-model.ts`
- Create: `src/model/inventory-model.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { InventoryModel } from './inventory-model.ts';

describe('InventoryModel', () => {
  test('starts with 0 sand', () => {
    const inv = new InventoryModel();
    expect(inv.sand).toBe(0);
  });

  test('addSand increases count', () => {
    const inv = new InventoryModel();
    inv.addSand(3);
    expect(inv.sand).toBe(3);
  });

  test('removeSand decreases count', () => {
    const inv = new InventoryModel();
    inv.addSand(5);
    inv.removeSand(2);
    expect(inv.sand).toBe(3);
  });

  test('removeSand returns false when insufficient', () => {
    const inv = new InventoryModel();
    inv.addSand(1);
    expect(inv.removeSand(2)).toBe(false);
    expect(inv.sand).toBe(1);
  });

  test('removeSand returns true on success', () => {
    const inv = new InventoryModel();
    inv.addSand(5);
    expect(inv.removeSand(3)).toBe(true);
  });

  test('hasSand returns true when sand > 0', () => {
    const inv = new InventoryModel();
    expect(inv.hasSand).toBe(false);
    inv.addSand(1);
    expect(inv.hasSand).toBe(true);
  });

  test('persists across multiple add/remove cycles', () => {
    const inv = new InventoryModel();
    inv.addSand(10);
    inv.removeSand(3);
    inv.addSand(2);
    inv.removeSand(5);
    expect(inv.sand).toBe(4);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --reporter=verbose src/model/inventory-model.test.ts`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

```ts
export class InventoryModel {
  private _sand = 0;

  get sand(): number {
    return this._sand;
  }

  get hasSand(): boolean {
    return this._sand > 0;
  }

  addSand(amount: number): void {
    this._sand += amount;
  }

  removeSand(amount: number): boolean {
    if (this._sand < amount) {
      return false;
    }
    this._sand -= amount;
    return true;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --reporter=verbose src/model/inventory-model.test.ts`
Expected: All 7 tests PASS

**Step 5: Lint and typecheck**

Run: `npm run build`
Expected: Clean build

**Step 6: Commit**

```bash
git add src/model/inventory-model.ts src/model/inventory-model.test.ts
git commit -m "feat: add InventoryModel for sand resource tracking"
```

---

### Task 2: Register sprite assets

**Files:**
- Modify: `src/resources.ts`

The sprites already exist at `public/images/shovel-sprite.png` and `public/images/wall-tool-sprite.png`.

**Step 1: Add ImageSource entries and register with loader**

In `src/resources.ts`, add to the `Resources` object:

```ts
Shovel: new ImageSource('./images/shovel-sprite.png'),
WallTool: new ImageSource('./images/wall-tool-sprite.png'),
```

Add both to the `loader` array.

**Step 2: Run build to verify assets compile**

Run: `npm run build`
Expected: Clean build

**Step 3: Commit**

```bash
git add src/resources.ts
git commit -m "feat: register shovel and wall-tool sprite assets"
```

---

### Task 3: Define ToolType and create toolbar view

**Files:**
- Create: `src/view/toolbar.ts`

**Step 1: Write the toolbar component**

This is a UI-heavy component so we build it directly. It needs:
- `ToolType` enum: `Shovel`, `Wall`
- A horizontal bar at bottom-center with slots for each tool
- Each slot renders the tool sprite, a hotkey number overlay in top-left corner, and a yellow highlight border when active
- A "Build Tools" label above the slots
- Sand count displayed on the wall tool slot
- `disabled` state dims the entire toolbar when not in planning phase
- Keyboard listener for hotkeys `1` and `2`
- `onToolSelected` callback

```ts
import { Scene, Actor, Color, Text, Font, Rectangle, Vector, Sprite, Keys } from 'excalibur';
import { Resources } from '../resources.ts';
import { computeLayout } from '../config.ts';

export enum ToolType {
  Shovel = 'shovel',
  Wall = 'wall',
}

interface ToolSlot {
  type: ToolType;
  hotkey: Keys;
  hotkeyLabel: string;
  sprite: Sprite;
}

const SLOT_SIZE = 48;
const SLOT_GAP = 4;
const SLOT_BORDER = 2;
const TOOLBAR_PADDING = 8;
const LABEL_HEIGHT = 16;
const TOTAL_SLOTS = 8;
const TOOLBAR_Z = 20;

export class Toolbar {
  private actors: Actor[] = [];
  private slotActors: Map<ToolType, Actor> = new Map();
  private borderActors: Map<ToolType, Actor> = new Map();
  private sandCountText: Text | null = null;
  private sandCountActor: Actor | null = null;
  private activeTool: ToolType = ToolType.Shovel;
  private _disabled = true;
  private scene: Scene | null = null;

  onToolSelected: ((tool: ToolType) => void) | null = null;

  private readonly tools: ToolSlot[] = [
    { type: ToolType.Shovel, hotkey: Keys.Digit1, hotkeyLabel: '1', sprite: Resources.Shovel.toSprite() },
    { type: ToolType.Wall, hotkey: Keys.Digit2, hotkeyLabel: '2', sprite: Resources.WallTool.toSprite() },
  ];

  get active(): ToolType {
    return this.activeTool;
  }

  get disabled(): boolean {
    return this._disabled;
  }

  activate(scene: Scene): void {
    this.scene = scene;
    const { canvasWidth, canvasHeight } = computeLayout(window);

    const toolbarWidth = TOOLBAR_PADDING + TOTAL_SLOTS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP + TOOLBAR_PADDING;
    const toolbarHeight = TOOLBAR_PADDING + SLOT_SIZE + TOOLBAR_PADDING;
    const toolbarX = (canvasWidth - toolbarWidth) / 2;
    const toolbarY = canvasHeight - toolbarHeight - LABEL_HEIGHT - 4;

    // "Build Tools" label
    const label = new Actor({
      x: canvasWidth / 2,
      y: toolbarY - 2,
      z: TOOLBAR_Z + 1,
      anchor: new Vector(0.5, 1),
    });
    label.graphics.use(new Text({
      text: 'Build Tools',
      color: Color.White,
      font: new Font({ size: 12 }),
    }));
    scene.add(label);
    this.actors.push(label);

    // Background
    const bg = new Actor({
      x: toolbarX,
      y: toolbarY,
      z: TOOLBAR_Z,
      anchor: Vector.Zero,
    });
    bg.graphics.use(new Rectangle({
      width: toolbarWidth,
      height: toolbarHeight,
      color: Color.fromRGB(20, 20, 30, 0.85),
    }));
    scene.add(bg);
    this.actors.push(bg);

    // Render all slots (empty slots first, then tool slots on top)
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const slotX = toolbarX + TOOLBAR_PADDING + i * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE / 2;
      const slotY = toolbarY + TOOLBAR_PADDING + SLOT_SIZE / 2;

      // Slot background
      const slotBg = new Actor({ x: slotX, y: slotY, z: TOOLBAR_Z + 1 });
      slotBg.graphics.use(new Rectangle({
        width: SLOT_SIZE,
        height: SLOT_SIZE,
        color: Color.fromRGB(40, 40, 50, 0.9),
      }));
      scene.add(slotBg);
      this.actors.push(slotBg);

      const tool = this.tools[i];
      if (!tool) {
        continue;
      }

      // Border (highlight for active tool)
      const border = new Actor({ x: slotX, y: slotY, z: TOOLBAR_Z + 2 });
      border.graphics.use(new Rectangle({
        width: SLOT_SIZE + SLOT_BORDER * 2,
        height: SLOT_SIZE + SLOT_BORDER * 2,
        color: Color.Transparent,
      }));
      scene.add(border);
      this.actors.push(border);
      this.borderActors.set(tool.type, border);

      // Tool sprite
      const spriteActor = new Actor({ x: slotX, y: slotY, z: TOOLBAR_Z + 3 });
      const sprite = tool.sprite.clone();
      const scale = (SLOT_SIZE - 8) / Math.max(sprite.width, sprite.height);
      spriteActor.scale = new Vector(scale, scale);
      spriteActor.graphics.use(sprite);
      scene.add(spriteActor);
      this.actors.push(spriteActor);
      this.slotActors.set(tool.type, spriteActor);

      // Click handler on slot background
      slotBg.on('pointerdown', () => {
        if (this._disabled) {
          return;
        }
        this.selectTool(tool.type);
      });

      // Hotkey number overlay (top-left corner of slot)
      const hotkeyActor = new Actor({
        x: slotX - SLOT_SIZE / 2 + 8,
        y: slotY - SLOT_SIZE / 2 + 8,
        z: TOOLBAR_Z + 4,
      });
      hotkeyActor.graphics.use(new Text({
        text: tool.hotkeyLabel,
        color: Color.fromRGB(200, 200, 200),
        font: new Font({ size: 10 }),
      }));
      scene.add(hotkeyActor);
      this.actors.push(hotkeyActor);

      // Sand count on wall tool
      if (tool.type === ToolType.Wall) {
        this.sandCountText = new Text({
          text: '0',
          color: Color.fromRGB(255, 220, 100),
          font: new Font({ size: 11 }),
        });
        this.sandCountActor = new Actor({
          x: slotX + SLOT_SIZE / 2 - 6,
          y: slotY + SLOT_SIZE / 2 - 6,
          z: TOOLBAR_Z + 4,
          anchor: new Vector(1, 1),
        });
        this.sandCountActor.graphics.use(this.sandCountText);
        scene.add(this.sandCountActor);
        this.actors.push(this.sandCountActor);
      }
    }

    // Keyboard hotkeys
    scene.engine.input.keyboard.on('press', this.onKeyPress);

    this.updateHighlight();
    this.setDisabled(true);
  }

  private onKeyPress = (evt: { key: Keys }): void => {
    if (this._disabled) {
      return;
    }
    for (const tool of this.tools) {
      if (evt.key === tool.hotkey) {
        this.selectTool(tool.type);
        return;
      }
    }
  };

  selectTool(tool: ToolType): void {
    this.activeTool = tool;
    this.updateHighlight();
    this.onToolSelected?.(tool);
  }

  setDisabled(disabled: boolean): void {
    this._disabled = disabled;
    const opacity = disabled ? 0.4 : 1.0;
    for (const actor of this.actors) {
      actor.graphics.opacity = opacity;
    }
  }

  updateSandCount(count: number): void {
    if (this.sandCountText && this.sandCountActor) {
      this.sandCountText.text = String(count);
      this.sandCountActor.graphics.use(this.sandCountText);
    }
  }

  private updateHighlight(): void {
    for (const [type, border] of this.borderActors) {
      const color = type === this.activeTool
        ? Color.fromRGB(255, 220, 50)
        : Color.Transparent;
      border.graphics.use(new Rectangle({
        width: SLOT_SIZE + SLOT_BORDER * 2,
        height: SLOT_SIZE + SLOT_BORDER * 2,
        color,
      }));
    }
  }

  deactivate(scene: Scene): void {
    scene.engine.input.keyboard.off('press', this.onKeyPress);
    for (const actor of this.actors) {
      scene.remove(actor);
    }
    this.actors = [];
    this.slotActors.clear();
    this.borderActors.clear();
    this.sandCountText = null;
    this.sandCountActor = null;
    this.scene = null;
  }
}
```

**Step 2: Run build to verify it compiles**

Run: `npm run build`
Expected: Clean build

**Step 3: Commit**

```bash
git add src/view/toolbar.ts
git commit -m "feat: add toolbar view with shovel and wall tool slots"
```

---

### Task 4: Rewire PlanningPhase to use tool system

This is the biggest change. The current `SingleCellDigging` does a two-step scoop/dump flow (click to dig, click to place). We need to replace this with:
- Shovel active: click a tile to dig (lower by 1, add 1 sand to inventory, spend 1 action)
- Wall active: click a tile to place (raise by 1, remove 1 sand from inventory, spend 1 action)

**Files:**
- Modify: `src/view/planning-phase.ts`
- Modify: `src/view/single-cell-digging.ts`

**Step 1: Refactor SingleCellDigging to accept tool context**

Replace the two-step scoop/dump flow. `SingleCellDigging` now receives a `ToolContext` with the active tool and inventory, and each click is a single action:

In `src/view/digging-strategy.ts`, update the `ScoopResult` to also include a `tool` field:

```ts
import type { ToolType } from './toolbar.ts';

export interface ScoopResult {
  tool: ToolType;
  cell: { col: number; row: number };
  delta: number;
}
```

Remove `dugCells` and `dumpCell` since the single-action model no longer pairs them.

Update `DiggingStrategyOptions`:

```ts
import type { InventoryModel } from '../model/inventory-model.ts';
import type { Toolbar } from './toolbar.ts';

export interface DiggingStrategyOptions {
  delta: number;
  inventory: InventoryModel;
  toolbar: Toolbar;
}
```

**Step 2: Rewrite SingleCellDigging for single-click tool actions**

Replace the contents of `src/view/single-cell-digging.ts`. The new flow:
- Shovel active: left-click digs, lowering by delta, adding delta sand to inventory
- Wall active: left-click places, raising by delta, removing delta sand from inventory (no-op if insufficient sand)
- Right-click does nothing (no cancel needed since it's single-action)
- Cursor changes based on active tool
- Hover tint: shovel = white highlight, wall = green highlight (only when has sand)

```ts
import { Scene, Color, Rectangle, PointerEvent, PointerButton } from 'excalibur';
import { Tile } from './tile.ts';
import { GridView } from './grid-view.ts';
import { GRID_WIDTH, GRID_HEIGHT, computeLayout } from '../config.ts';
import type { DiggingStrategy, DiggingStrategyOptions, ScoopResult } from './digging-strategy.ts';
import { ToolType } from './toolbar.ts';
import type { InventoryModel } from '../model/inventory-model.ts';
import type { Toolbar } from './toolbar.ts';

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

const CURSOR_SHOVEL = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="20" y1="3" x2="13" y2="11" stroke="#8B4513" stroke-width="3" stroke-linecap="round"/><path d="M13 11 L7 11 L5 18 L10 21 L15 16 Z" fill="white" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 19, auto`;
})();

const CURSOR_WALL = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#C2A050" stroke="#8B7530" stroke-width="2"/><line x1="3" y1="10" x2="21" y2="10" stroke="#8B7530" stroke-width="1"/><line x1="3" y1="17" x2="21" y2="17" stroke="#8B7530" stroke-width="1"/><line x1="12" y1="3" x2="12" y2="10" stroke="#8B7530" stroke-width="1"/><line x1="7" y1="10" x2="7" y2="17" stroke="#8B7530" stroke-width="1"/><line x1="17" y1="10" x2="17" y2="17" stroke="#8B7530" stroke-width="1"/><line x1="12" y1="17" x2="12" y2="21" stroke="#8B7530" stroke-width="1"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
})();

export class SingleCellDigging implements DiggingStrategy {
  onScoopComplete: ((result: ScoopResult) => void) | null = null;

  private hoverListenerTiles: Tile[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private pointerHandler: ((evt: PointerEvent) => void) | null = null;
  private grid: GridView | null = null;
  private delta = 1;
  private inventory: InventoryModel | null = null;
  private toolbar: Toolbar | null = null;
  private locked = false;

  activate(scene: Scene, grid: GridView, opts: DiggingStrategyOptions): void {
    this.grid = grid;
    this.delta = opts.delta;
    this.inventory = opts.inventory;
    this.toolbar = opts.toolbar;
    this.canvas = scene.engine.canvas;
    this.updateCursor();

    this.pointerHandler = (evt: PointerEvent) => {
      if (this.locked) {
        return;
      }
      const col = Math.floor((evt.worldPos.x - GRID_LEFT) / TILE_SIZE);
      const row = Math.floor((evt.worldPos.y - GRID_TOP) / TILE_SIZE);
      if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_HEIGHT) {
        return;
      }
      if (evt.button === PointerButton.Right) {
        return;
      }
      this.handleClick(col, row);
    };
    scene.input.pointers.primary.on('down', this.pointerHandler);

    for (let row = 0; row < GRID_HEIGHT; row++) {
      for (let col = 0; col < GRID_WIDTH; col++) {
        const tile = grid.getTile(col, row);
        if (!tile || tile.isCastle) {
          continue;
        }
        tile.on('pointerenter', () => this.onTileEnter(tile));
        tile.on('pointerleave', () => this.onTileLeave(tile));
        this.hoverListenerTiles.push(tile);
      }
    }
  }

  deactivate(scene: Scene): void {
    for (const tile of this.hoverListenerTiles) {
      tile.off('pointerenter');
      tile.off('pointerleave');
    }
    this.hoverListenerTiles = [];
    if (this.pointerHandler) {
      scene.input.pointers.primary.off('down', this.pointerHandler);
      this.pointerHandler = null;
    }
    if (this.canvas) {
      this.canvas.style.cursor = '';
      this.canvas = null;
    }
    this.grid = null;
    this.inventory = null;
    this.toolbar = null;
  }

  getStateText(): string {
    if (!this.toolbar) {
      return '';
    }
    if (this.toolbar.active === ToolType.Shovel) {
      return 'Click to dig';
    }
    if (!this.inventory?.hasSand) {
      return 'No sand - dig first';
    }
    return 'Click to place wall';
  }

  lock(): void {
    this.locked = true;
  }

  unlock(): void {
    this.locked = false;
  }

  updateCursor(): void {
    if (!this.canvas || !this.toolbar) {
      return;
    }
    this.canvas.style.cursor = this.toolbar.active === ToolType.Shovel ? CURSOR_SHOVEL : CURSOR_WALL;
  }

  private handleClick(col: number, row: number): void {
    if (!this.grid || !this.toolbar || !this.inventory) {
      return;
    }
    const tile = this.grid.getTile(col, row);
    if (!tile || tile.isCastle) {
      return;
    }

    const tool = this.toolbar.active;

    if (tool === ToolType.Shovel) {
      this.grid.setElevation(col, row, -this.delta);
      this.inventory.addSand(this.delta);
      this.toolbar.updateSandCount(this.inventory.sand);
      this.onScoopComplete?.({ tool, cell: { col, row }, delta: this.delta });
      return;
    }

    if (tool === ToolType.Wall) {
      if (!this.inventory.removeSand(this.delta)) {
        return;
      }
      this.grid.setElevation(col, row, this.delta);
      this.toolbar.updateSandCount(this.inventory.sand);
      this.onScoopComplete?.({ tool, cell: { col, row }, delta: this.delta });
    }
  }

  private onTileEnter(tile: Tile): void {
    if (!this.grid || !this.toolbar) {
      return;
    }
    const neighbors = this.grid.model.getPoolNeighbors(tile.col, tile.row);
    const w = neighbors?.right ? TILE_SIZE : TILE_SIZE - 1;
    const h = neighbors?.bottom ? TILE_SIZE : TILE_SIZE - 1;

    if (this.toolbar.active === ToolType.Wall && this.inventory?.hasSand) {
      tile.graphics.use(new Rectangle({
        width: w,
        height: h,
        color: Color.fromRGB(100, 220, 100, 0.7),
      }));
    } else {
      tile.graphics.use(new Rectangle({
        width: w,
        height: h,
        color: Color.fromRGB(255, 255, 255, 0.45),
      }));
    }
  }

  private onTileLeave(tile: Tile): void {
    if (!this.grid) {
      return;
    }
    this.grid.refreshTileVisual(tile.col, tile.row);
  }
}
```

**Step 3: Update PlanningPhase**

Modify `src/view/planning-phase.ts`:
- Remove the send wave button entirely (the `sendWaveActor`, `sendWaveInnerActor`, and all related code)
- Remove the `hasEnhancedShovel` constructor parameter and `ENHANCED_SHOVEL_DELTA` usage (always pass `delta: 1`)
- Accept `InventoryModel` and `Toolbar` in constructor, pass them through to strategy via `DiggingStrategyOptions`
- When tool changes via toolbar callback, update cursor and state text
- Remove `PlanningHud` interface dependency for scoop text (toolbar replaces it)
- Keep wave text in the HUD

Constructor signature becomes:

```ts
constructor(
  private grid: GridView,
  private hud: PlanningHud,
  scoops: number,
  private waveReach: number,
  private waveHeight: number,
  private numWaves: number,
  private inventory: InventoryModel,
  private toolbar: Toolbar,
  private onComplete: () => void,
  strategy?: DiggingStrategy,
)
```

In `activate()`:
- Pass `{ delta: 1, inventory: this.inventory, toolbar: this.toolbar }` to `strategy.activate()`
- Enable the toolbar: `this.toolbar.setDisabled(false)` and set `this.toolbar.selectTool(ToolType.Shovel)`
- Wire `toolbar.onToolSelected` to update cursor and state text
- Remove all send wave button code
- Keep the wave reach indicator line

In `deactivate()`:
- Disable toolbar: `this.toolbar.setDisabled(true)`
- Remove send wave button cleanup (it's gone)

In `handleScoopComplete()`:
- Same budget logic, but update toolbar sand count after each action
- When budget depleted, delay 600ms then call `onComplete` (same as before, minus send wave)

**Step 4: Run build**

Run: `npm run build`
Expected: Clean build (there will be errors in game-session.ts from constructor change, fixed in next task)

**Step 5: Commit**

```bash
git add src/view/digging-strategy.ts src/view/single-cell-digging.ts src/view/planning-phase.ts
git commit -m "feat: rewire planning phase for tool-based single-click actions"
```

---

### Task 5: Wire everything together in GameSession

**Files:**
- Modify: `src/game-session.ts`

**Step 1: Integrate InventoryModel and Toolbar into GameSession**

Changes to `src/game-session.ts`:

- Import `InventoryModel` and `Toolbar`
- Add `private inventory = new InventoryModel()` and `private toolbar = new Toolbar()` as class fields
- In `onInitialize()`: call `this.toolbar.activate(this)` after hud activation, and `this.toolbar.updateSandCount(this.inventory.sand)`
- In `startPlanningPhase()`: pass `this.inventory` and `this.toolbar` to `PlanningPhase` constructor, remove `this.state.hasEnhancedShovel`
- Remove `checkCleanWave()` method entirely (enhanced shovel is gone)
- Remove the `checkCleanWave` call in `runWavePhase()`
- In `resetGame()`: create a new `InventoryModel` (sand resets on game over), update toolbar sand count
- Remove `hasEnhancedShovel` from `GameState` usage (leave the interface alone for now since other modes may still reference it)

**Step 2: Remove enhanced shovel from config**

In `src/config.ts`, remove:
- `ENHANCED_SHOVEL_WAVES_REQUIRED`
- `ENHANCED_SHOVEL_DELTA`

In `src/game-session.ts`, remove imports of those constants.

**Step 3: Clean up GameState**

In `src/modes/game-mode.ts`:
- Remove `hasEnhancedShovel` from `GameState`
- Remove `checkCleanWaveReward` from `GameMode` interface

In `src/modes/level-mode.ts`:
- Remove `checkCleanWaveReward` method
- Remove `ENHANCED_SHOVEL_WAVES_REQUIRED` import

In `src/game-session.ts`:
- Remove `consecutiveCleanWaves` and `hasEnhancedShovel` from the state initialization
- Remove the `checkCleanWave` method and its call in `runWavePhase`

**Step 4: Update HUD to remove scoop display**

In `src/view/hud.ts`, `showPlanning()`:
- Remove the `scoopText` parameter and related row
- Keep wave text display (now row 2 instead of row 4)
- Adjust background height (2 rows instead of 4: level + wave info)

Update `PlanningHud` interface in `planning-phase.ts`:
- Remove `updateScoops` from the interface
- Adjust `showPlanning` signature to drop `scoopText`

**Step 5: Run full test suite and build**

Run: `npm run test:unit && npm run build`
Expected: All tests pass, clean build. Some existing tests may need updating if they reference `hasEnhancedShovel` or `checkCleanWaveReward`.

**Step 6: Fix any broken tests**

- `src/modes/level-mode.test.ts`: Remove tests for `checkCleanWaveReward`
- Any test referencing `hasEnhancedShovel` in GameState: remove the field

**Step 7: Commit**

```bash
git add src/game-session.ts src/config.ts src/modes/game-mode.ts src/modes/level-mode.ts src/view/hud.ts src/view/planning-phase.ts src/modes/level-mode.test.ts
git commit -m "feat: wire tool system into game session, remove enhanced shovel"
```

---

### Task 6: Verify in browser

**Step 1: Check the dev server**

Open the game in the browser and verify:
- Toolbar appears at bottom-center with shovel and wall tool slots
- Toolbar is dimmed before planning starts
- During planning, toolbar enables, shovel is selected by default
- Clicking a tile with shovel lowers it and sand count increases on wall slot
- Pressing `2` switches to wall tool, highlight moves
- Clicking a tile with wall tool raises it and sand count decreases
- Wall tool click does nothing when sand is 0
- Sand persists between waves and levels
- No send wave button exists
- Planning ends when budget is depleted
- Hotkeys 1 and 2 work

**Step 2: Run all tests**

Run: `npm test`
Expected: Unit tests pass, build succeeds, visual regression tests may need baseline updates (toolbar is new UI).

**Step 3: Update visual regression baselines if needed**

Run: `npm run test:integration-update`

**Step 4: Update gameplay.md**

Add the tool system section to `docs/gameplay.md` describing shovel/wall tools, sand inventory persistence, and toolbar UI.

**Step 5: Final commit**

```bash
git add docs/gameplay.md tests/
git commit -m "docs: update gameplay for tool system, update visual baselines"
```
