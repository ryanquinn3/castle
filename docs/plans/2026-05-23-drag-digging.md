# Drag-to-Dig Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the digging mechanic into a `DiggingStrategy` interface, preserve the existing single-cell implementation, then add a new drag-to-dig strategy that lets the player select up to 3 contiguous cells.

**Architecture:** Strategy pattern. `PlanningPhase` becomes a thin coordinator that delegates pointer handling to a `DiggingStrategy`. Two implementations: `SingleCellDigging` (current behavior, extracted) and `DragDigging` (new). The strategy owns "how the user performs a scoop"; PlanningPhase owns "what happens after a scoop."

**Tech Stack:** TypeScript, Excalibur.js (pointer events, graphics)

---

### Task 1: Define the DiggingStrategy interface

**Files:**
- Create: `src/view/digging-strategy.ts`

**Step 1: Write the interface**

```ts
import { Scene } from 'excalibur';
import { GridView } from './grid-view.ts';

export interface ScoopResult {
  dugCells: { col: number; row: number }[];
  dumpCell: { col: number; row: number };
  totalDelta: number;
}

export interface DiggingStrategyOptions {
  delta: number;
}

export interface DiggingStrategy {
  onScoopComplete: ((result: ScoopResult) => void) | null;
  activate(scene: Scene, grid: GridView, opts: DiggingStrategyOptions): void;
  deactivate(scene: Scene): void;
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no imports consume it yet)

**Step 3: Commit**

```
feat: add DiggingStrategy interface
```

---

### Task 2: Extract SingleCellDigging from PlanningPhase

This is the largest task. We extract the pointer-down handler, held-tile state, tint logic, and hover logic from `PlanningPhase` into a new `SingleCellDigging` class that implements `DiggingStrategy`.

**Files:**
- Create: `src/view/single-cell-digging.ts`
- Modify: `src/view/planning-phase.ts`

**Step 1: Write a failing test**

Create `src/view/single-cell-digging.test.ts`. We can't easily unit-test Excalibur pointer events, but we can test the state machine logic if we extract it. Instead, we'll verify correctness through the existing visual regression tests and a manual smoke test.

Skip to Step 2.

**Step 2: Create SingleCellDigging**

Create `src/view/single-cell-digging.ts`. This class implements `DiggingStrategy` and contains all the digging interaction logic currently in `PlanningPhase`:

- **State:** `heldTile`, `hoverListenerTiles`, `canvas` reference
- **From PlanningPhase, move these methods:**
  - The pointer-down handler (lines 131-140 of planning-phase.ts) -- the coordinate conversion and dispatch to handleClick
  - `handleClick` (lines 190-249) -- the full click state machine
  - `onTileEnter` / `onTileLeave` (lines 252-279) -- hover highlighting
  - `applyHeldTint` / `clearHeldTint` (lines 281-294) -- visual feedback
  - `updateCursor` logic (cursor empty/full switching)
- **Cursor SVGs:** Move `CURSOR_EMPTY` and `CURSOR_FULL` static fields into this class
- **Callback:** When a full dig+dump cycle completes (the `else if (button === 'left' && !tile.isCastle)` branch, line 226), call `this.onScoopComplete` with the result instead of directly modifying `scoopsRemaining`
- **Cancel:** When the user cancels (right-click or click held tile, line 217), no callback -- the strategy just undoes the dig internally

The `activate` method should:
1. Store canvas ref, set cursor to empty
2. Register the pointer-down handler on `scene.input.pointers.primary`
3. Register hover listeners on all non-castle tiles

The `deactivate` method should:
1. Reset cursor
2. Remove pointer-down handler
3. Remove hover listeners
4. If a tile is held, undo the dig (raise it back)

```ts
import { Scene, Color, Rectangle, PointerEvent, PointerButton } from 'excalibur';
import { Tile } from './tile.ts';
import { GridView } from './grid-view.ts';
import { GRID_WIDTH, GRID_HEIGHT, computeLayout } from '../config.ts';
import type { DiggingStrategy, DiggingStrategyOptions, ScoopResult } from './digging-strategy.ts';

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

export class SingleCellDigging implements DiggingStrategy {
  private static readonly CURSOR_EMPTY = (() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="20" y1="3" x2="13" y2="11" stroke="#8B4513" stroke-width="3" stroke-linecap="round"/><path d="M13 11 L7 11 L5 18 L10 21 L15 16 Z" fill="white" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 19, auto`;
  })();

  private static readonly CURSOR_FULL = (() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="20" y1="3" x2="13" y2="11" stroke="#8B4513" stroke-width="3" stroke-linecap="round"/><path d="M13 11 L7 11 L5 18 L10 21 L15 16 Z" fill="#A0522D" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 19, auto`;
  })();

  onScoopComplete: ((result: ScoopResult) => void) | null = null;

  private grid!: GridView;
  private delta = 1;
  private heldTile: Tile | null = null;
  private hoverListenerTiles: Tile[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private pointerHandler: ((evt: PointerEvent) => void) | null = null;

  activate(scene: Scene, grid: GridView, opts: DiggingStrategyOptions): void {
    this.grid = grid;
    this.delta = opts.delta;
    this.canvas = scene.engine.canvas;
    this.canvas.style.cursor = SingleCellDigging.CURSOR_EMPTY;

    this.pointerHandler = (evt: PointerEvent) => {
      const col = Math.floor((evt.worldPos.x - GRID_LEFT) / TILE_SIZE);
      const row = Math.floor((evt.worldPos.y - GRID_TOP) / TILE_SIZE);
      if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_HEIGHT) {
        return;
      }
      const button = evt.button === PointerButton.Right ? 'right' : 'left';
      this.handleClick(col, row, button);
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
    if (this.heldTile) {
      this.grid.setElevation(this.heldTile.col, this.heldTile.row, +this.delta);
      this.clearHeldTint(this.heldTile);
      this.heldTile = null;
    }
    if (this.canvas) {
      this.canvas.style.cursor = '';
      this.canvas = null;
    }
    for (const tile of this.hoverListenerTiles) {
      tile.off('pointerenter');
      tile.off('pointerleave');
    }
    this.hoverListenerTiles = [];
    if (this.pointerHandler) {
      scene.input.pointers.primary.off('down', this.pointerHandler);
      this.pointerHandler = null;
    }
  }

  getStateText(): string {
    return this.heldTile === null
      ? 'Click a tile to scoop'
      : 'Click another tile to dump | Right-click to cancel';
  }

  private handleClick(col: number, row: number, button: 'left' | 'right'): void {
    const tile = this.grid.getTile(col, row);
    if (!tile) {
      return;
    }

    if (this.heldTile === null) {
      if (button === 'left' && tile.isCastle) {
        return;  // PlanningPhase handles the HUD message for castle clicks
      }
      if (button === 'left' && !tile.isCastle) {
        this.grid.setElevation(col, row, -this.delta);
        this.applyHeldTint(tile);
        this.heldTile = tile;
        if (this.canvas) {
          this.canvas.style.cursor = SingleCellDigging.CURSOR_FULL;
        }
      }
      return;
    }

    const isHeldTile = this.heldTile.col === col && this.heldTile.row === row;
    if (button === 'right' || isHeldTile) {
      this.grid.setElevation(this.heldTile.col, this.heldTile.row, +this.delta);
      this.clearHeldTint(this.heldTile);
      this.heldTile = null;
      if (this.canvas) {
        this.canvas.style.cursor = SingleCellDigging.CURSOR_EMPTY;
      }
      return;
    }

    if (button === 'left' && !tile.isCastle) {
      this.grid.setElevation(col, row, +this.delta);
      this.clearHeldTint(this.heldTile);
      const result: ScoopResult = {
        dugCells: [{ col: this.heldTile.col, row: this.heldTile.row }],
        dumpCell: { col, row },
        totalDelta: this.delta,
      };
      this.heldTile = null;
      if (this.canvas) {
        this.canvas.style.cursor = SingleCellDigging.CURSOR_EMPTY;
      }
      this.onScoopComplete?.(result);
    }
  }

  private onTileEnter(tile: Tile): void {
    if (tile === this.heldTile) {
      return;
    }
    const neighbors = this.grid.model.getPoolNeighbors(tile.col, tile.row);
    const w = neighbors?.right ? TILE_SIZE : TILE_SIZE - 1;
    const h = neighbors?.bottom ? TILE_SIZE : TILE_SIZE - 1;
    if (this.heldTile !== null) {
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
    if (tile === this.heldTile) {
      return;
    }
    this.grid.refreshTileVisual(tile.col, tile.row);
  }

  private applyHeldTint(tile: Tile): void {
    tile.graphics.use(new Rectangle({
      width: TILE_SIZE - 1,
      height: TILE_SIZE - 1,
      color: Color.Yellow,
    }));
    tile.graphics.opacity = 0.6;
  }

  private clearHeldTint(tile: Tile): void {
    tile.graphics.opacity = 1.0;
    this.grid.refreshTileVisual(tile.col, tile.row);
  }
}
```

**Step 3: Refactor PlanningPhase to use SingleCellDigging**

Modify `src/view/planning-phase.ts`:

1. Remove: `CURSOR_EMPTY`, `CURSOR_FULL`, `heldTile`, `hoverListenerTiles`, `pointerHandler` fields
2. Remove: `handleClick`, `onTileEnter`, `onTileLeave`, `applyHeldTint`, `clearHeldTint`, `updateStateHUD` methods
3. Add: `private strategy: DiggingStrategy` field
4. In constructor: accept a `DiggingStrategy` parameter (or default to `SingleCellDigging`)
5. In `activate`: create the strategy options, set `strategy.onScoopComplete` callback, call `strategy.activate(scene, grid, opts)`
6. The `onScoopComplete` callback handles: decrementing `scoopsRemaining`, updating HUD, auto-sending wave when scoops hit 0
7. In `deactivate`: call `strategy.deactivate(scene)`

The updated `PlanningPhase` constructor signature:

```ts
constructor(
  private grid: GridView,
  private hud: PlanningHud,
  scoops: number,
  private waveReach: number,
  private waveHeight: number,
  private numWaves: number,
  private hasEnhancedShovel: boolean,
  private onComplete: () => void,
  private strategy?: DiggingStrategy,
)
```

Default to `SingleCellDigging` if not provided:

```ts
this.strategy = strategy ?? new SingleCellDigging();
```

The `activate` method wires up the callback:

```ts
activate(scene: Scene): void {
  this.active = true;
  this.completed = false;
  this.canvas = scene.engine.canvas;

  const delta = this.hasEnhancedShovel ? ENHANCED_SHOVEL_DELTA : 1;
  this.strategy.onScoopComplete = (result) => this.handleScoopComplete(result);
  this.strategy.activate(scene, this.grid, { delta });

  // ... rest of HUD setup, send wave button, reach line (unchanged)
}
```

New method on PlanningPhase:

```ts
private async handleScoopComplete(result: ScoopResult): Promise<void> {
  if (!this.active) {
    return;
  }
  if (Number.isFinite(this.scoopsRemaining)) {
    this.scoopsRemaining--;
    this.hud.updateScoops(this.scoopHudText());
    this.hud.updateState(this.strategy.getStateText());
    if (this.scoopsRemaining === 0 && !this.completed) {
      this.completed = true;
      this.active = false;
      this.hud.updateScoops('Scoops: 0 - sending wave...');
      await this.delay(600);
      this.onComplete();
    }
  } else {
    this.hud.updateScoops(this.scoopHudText());
  }
}
```

Add `getStateText()` to the `DiggingStrategy` interface:

```ts
export interface DiggingStrategy {
  onScoopComplete: ((result: ScoopResult) => void) | null;
  activate(scene: Scene, grid: GridView, opts: DiggingStrategyOptions): void;
  deactivate(scene: Scene): void;
  getStateText(): string;
}
```

**Step 4: Update callers**

`src/tide-session.ts` line 105 and `src/game-session.ts` (if it exists) -- no changes needed since `strategy` param is optional and defaults to `SingleCellDigging`.

**Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npm run test:unit`
Expected: PASS (existing tests still work)

Manual smoke test: open the game in browser, verify single-cell dig+dump works identically to before.

**Step 6: Commit**

```
refactor: extract SingleCellDigging from PlanningPhase
```

---

### Task 3: Implement DragDigging strategy

**Files:**
- Create: `src/view/drag-digging.ts`
- Create: `src/view/drag-digging.test.ts`

**Step 1: Write failing tests for adjacency and selection logic**

Create `src/view/drag-digging.test.ts`. Test the pure logic functions we'll extract:

```ts
import { describe, it, expect } from 'vitest';
import { isOrthogonallyAdjacent, canAddToSelection } from './drag-digging.ts';

describe('isOrthogonallyAdjacent', () => {
  it('returns true for cells sharing an edge', () => {
    expect(isOrthogonallyAdjacent({ col: 1, row: 1 }, { col: 2, row: 1 })).toBe(true);
    expect(isOrthogonallyAdjacent({ col: 1, row: 1 }, { col: 1, row: 2 })).toBe(true);
  });

  it('returns false for diagonal cells', () => {
    expect(isOrthogonallyAdjacent({ col: 1, row: 1 }, { col: 2, row: 2 })).toBe(false);
  });

  it('returns false for same cell', () => {
    expect(isOrthogonallyAdjacent({ col: 1, row: 1 }, { col: 1, row: 1 })).toBe(false);
  });
});

describe('canAddToSelection', () => {
  it('allows adding adjacent cell when under max', () => {
    const selected = [{ col: 1, row: 1 }];
    expect(canAddToSelection(selected, { col: 2, row: 1 }, 3)).toBe(true);
  });

  it('rejects when at max', () => {
    const selected = [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }];
    expect(canAddToSelection(selected, { col: 4, row: 1 }, 3)).toBe(false);
  });

  it('rejects non-adjacent cell', () => {
    const selected = [{ col: 1, row: 1 }];
    expect(canAddToSelection(selected, { col: 3, row: 1 }, 3)).toBe(false);
  });

  it('rejects already-selected cell', () => {
    const selected = [{ col: 1, row: 1 }];
    expect(canAddToSelection(selected, { col: 1, row: 1 }, 3)).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL (functions don't exist yet)

**Step 3: Implement the pure logic functions**

In `src/view/drag-digging.ts`, export the helper functions:

```ts
export interface Cell {
  col: number;
  row: number;
}

export function isOrthogonallyAdjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
}

export function canAddToSelection(selected: Cell[], candidate: Cell, max: number): boolean {
  if (selected.length >= max) {
    return false;
  }
  if (selected.some(c => c.col === candidate.col && c.row === candidate.row)) {
    return false;
  }
  const last = selected[selected.length - 1];
  return isOrthogonallyAdjacent(last, candidate);
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS

**Step 5: Commit**

```
feat: add drag-digging selection logic with tests
```

---

### Task 4: Implement the full DragDigging strategy class

**Files:**
- Modify: `src/view/drag-digging.ts`

**Step 1: Implement DragDigging**

Add the `DragDigging` class to `src/view/drag-digging.ts`. It implements `DiggingStrategy`:

**State:**
- `selectedCells: { col: number; row: number; tile: Tile }[]` -- current drag selection
- `isDragging: boolean` -- pointer is held down
- `waitingForDump: boolean` -- drag released, waiting for dump click

**Pointer handlers:**
- `pointerdown`: If not waiting for dump, start drag. Add first cell to selection, apply dig + yellow tint. If waiting for dump, handle dump click (raise target by `delta * selectedCells.length`).
- `pointermove`: If dragging, check if pointer entered a new cell. If `canAddToSelection` returns true and cell is not castle, add it, apply dig + tint.
- `pointerup`: If dragging and selection is non-empty, transition to waitingForDump. Change cursor to full.
- Right-click while waitingForDump: cancel -- raise all selected cells back, clear selection.

```ts
import { Scene, Color, Rectangle, PointerEvent, PointerButton } from 'excalibur';
import { Tile } from './tile.ts';
import { GridView } from './grid-view.ts';
import { GRID_WIDTH, GRID_HEIGHT, computeLayout } from '../config.ts';
import type { DiggingStrategy, DiggingStrategyOptions, ScoopResult } from './digging-strategy.ts';

const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

const MAX_DRAG_CELLS = 3;

// ... Cell, isOrthogonallyAdjacent, canAddToSelection already defined above ...

export class DragDigging implements DiggingStrategy {
  private static readonly CURSOR_EMPTY = (() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="20" y1="3" x2="13" y2="11" stroke="#8B4513" stroke-width="3" stroke-linecap="round"/><path d="M13 11 L7 11 L5 18 L10 21 L15 16 Z" fill="white" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 19, auto`;
  })();

  private static readonly CURSOR_FULL = (() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="20" y1="3" x2="13" y2="11" stroke="#8B4513" stroke-width="3" stroke-linecap="round"/><path d="M13 11 L7 11 L5 18 L10 21 L15 16 Z" fill="#A0522D" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 19, auto`;
  })();

  onScoopComplete: ((result: ScoopResult) => void) | null = null;

  private grid!: GridView;
  private delta = 1;
  private selectedCells: { col: number; row: number; tile: Tile }[] = [];
  private isDragging = false;
  private waitingForDump = false;
  private canvas: HTMLCanvasElement | null = null;
  private hoverListenerTiles: Tile[] = [];
  private pointerDownHandler: ((evt: PointerEvent) => void) | null = null;
  private pointerMoveHandler: ((evt: PointerEvent) => void) | null = null;
  private pointerUpHandler: ((evt: PointerEvent) => void) | null = null;

  activate(scene: Scene, grid: GridView, opts: DiggingStrategyOptions): void {
    this.grid = grid;
    this.delta = opts.delta;
    this.canvas = scene.engine.canvas;
    this.canvas.style.cursor = DragDigging.CURSOR_EMPTY;

    this.pointerDownHandler = (evt: PointerEvent) => this.onPointerDown(evt);
    this.pointerMoveHandler = (evt: PointerEvent) => this.onPointerMove(evt);
    this.pointerUpHandler = (evt: PointerEvent) => this.onPointerUp(evt);

    scene.input.pointers.primary.on('down', this.pointerDownHandler);
    scene.input.pointers.primary.on('move', this.pointerMoveHandler);
    scene.input.pointers.primary.on('up', this.pointerUpHandler);

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
    for (const entry of this.selectedCells) {
      this.grid.setElevation(entry.col, entry.row, +this.delta);
      this.clearTint(entry.tile);
    }
    this.selectedCells = [];
    this.isDragging = false;
    this.waitingForDump = false;

    if (this.canvas) {
      this.canvas.style.cursor = '';
      this.canvas = null;
    }
    for (const tile of this.hoverListenerTiles) {
      tile.off('pointerenter');
      tile.off('pointerleave');
    }
    this.hoverListenerTiles = [];
    if (this.pointerDownHandler) {
      scene.input.pointers.primary.off('down', this.pointerDownHandler);
      this.pointerDownHandler = null;
    }
    if (this.pointerMoveHandler) {
      scene.input.pointers.primary.off('move', this.pointerMoveHandler);
      this.pointerMoveHandler = null;
    }
    if (this.pointerUpHandler) {
      scene.input.pointers.primary.off('up', this.pointerUpHandler);
      this.pointerUpHandler = null;
    }
  }

  getStateText(): string {
    if (this.isDragging) {
      return `Drag to select tiles (${this.selectedCells.length}/${MAX_DRAG_CELLS})`;
    }
    if (this.waitingForDump) {
      return `Click a tile to dump ${this.selectedCells.length} scoop${this.selectedCells.length > 1 ? 's' : ''} | Right-click to cancel`;
    }
    return 'Click and drag to scoop tiles';
  }

  private worldToGrid(evt: PointerEvent): { col: number; row: number } | null {
    const col = Math.floor((evt.worldPos.x - GRID_LEFT) / TILE_SIZE);
    const row = Math.floor((evt.worldPos.y - GRID_TOP) / TILE_SIZE);
    if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_HEIGHT) {
      return null;
    }
    return { col, row };
  }

  private onPointerDown(evt: PointerEvent): void {
    const pos = this.worldToGrid(evt);
    if (!pos) {
      return;
    }
    const button = evt.button === PointerButton.Right ? 'right' : 'left';

    if (this.waitingForDump) {
      this.handleDumpClick(pos.col, pos.row, button);
      return;
    }

    if (button !== 'left') {
      return;
    }

    const tile = this.grid.getTile(pos.col, pos.row);
    if (!tile || tile.isCastle) {
      return;
    }

    this.isDragging = true;
    this.addToSelection(pos.col, pos.row, tile);
  }

  private onPointerMove(evt: PointerEvent): void {
    if (!this.isDragging) {
      return;
    }
    const pos = this.worldToGrid(evt);
    if (!pos) {
      return;
    }
    const tile = this.grid.getTile(pos.col, pos.row);
    if (!tile || tile.isCastle) {
      return;
    }
    const cells = this.selectedCells.map(c => ({ col: c.col, row: c.row }));
    if (canAddToSelection(cells, pos, MAX_DRAG_CELLS)) {
      this.addToSelection(pos.col, pos.row, tile);
    }
  }

  private onPointerUp(_evt: PointerEvent): void {
    if (!this.isDragging) {
      return;
    }
    this.isDragging = false;
    if (this.selectedCells.length > 0) {
      this.waitingForDump = true;
      if (this.canvas) {
        this.canvas.style.cursor = DragDigging.CURSOR_FULL;
      }
    }
  }

  private addToSelection(col: number, row: number, tile: Tile): void {
    this.grid.setElevation(col, row, -this.delta);
    this.applyTint(tile);
    this.selectedCells.push({ col, row, tile });
  }

  private handleDumpClick(col: number, row: number, button: 'left' | 'right'): void {
    if (button === 'right') {
      this.cancelSelection();
      return;
    }

    const tile = this.grid.getTile(col, row);
    if (!tile || tile.isCastle) {
      return;
    }

    const totalDelta = this.delta * this.selectedCells.length;
    this.grid.setElevation(col, row, +totalDelta);

    const dugCells = this.selectedCells.map(c => ({ col: c.col, row: c.row }));
    for (const entry of this.selectedCells) {
      this.clearTint(entry.tile);
    }

    const result: ScoopResult = {
      dugCells,
      dumpCell: { col, row },
      totalDelta,
    };
    this.selectedCells = [];
    this.waitingForDump = false;
    if (this.canvas) {
      this.canvas.style.cursor = DragDigging.CURSOR_EMPTY;
    }
    this.onScoopComplete?.(result);
  }

  private cancelSelection(): void {
    for (const entry of this.selectedCells) {
      this.grid.setElevation(entry.col, entry.row, +this.delta);
      this.clearTint(entry.tile);
    }
    this.selectedCells = [];
    this.waitingForDump = false;
    if (this.canvas) {
      this.canvas.style.cursor = DragDigging.CURSOR_EMPTY;
    }
  }

  private onTileEnter(tile: Tile): void {
    if (this.selectedCells.some(c => c.tile === tile)) {
      return;
    }
    const neighbors = this.grid.model.getPoolNeighbors(tile.col, tile.row);
    const w = neighbors?.right ? TILE_SIZE : TILE_SIZE - 1;
    const h = neighbors?.bottom ? TILE_SIZE : TILE_SIZE - 1;
    if (this.waitingForDump) {
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
    if (this.selectedCells.some(c => c.tile === tile)) {
      return;
    }
    this.grid.refreshTileVisual(tile.col, tile.row);
  }

  private applyTint(tile: Tile): void {
    tile.graphics.use(new Rectangle({
      width: TILE_SIZE - 1,
      height: TILE_SIZE - 1,
      color: Color.Yellow,
    }));
    tile.graphics.opacity = 0.6;
  }

  private clearTint(tile: Tile): void {
    tile.graphics.opacity = 1.0;
    this.grid.refreshTileVisual(tile.col, tile.row);
  }
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npm run test:unit`
Expected: PASS

**Step 3: Commit**

```
feat: implement DragDigging strategy
```

---

### Task 5: Wire DragDigging into TideSession

**Files:**
- Modify: `src/tide-session.ts`

**Step 1: Import and pass DragDigging to PlanningPhase**

In `src/tide-session.ts`, update `startPlanning()`:

```ts
import { DragDigging } from './view/drag-digging.ts';

// In startPlanning():
private startPlanning(): void {
  const waveParams = this.gameMode.nextWaveParams(this.state);
  this.planning = new PlanningPhase(
    this.grid,
    this.hud,
    Infinity,
    GRID_HEIGHT,
    waveParams.peakHeight,
    1,
    this.state.hasEnhancedShovel,
    () => {},
    new DragDigging(),
  );
  this.planning.activate(this);
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npm run test:unit`
Expected: PASS

Manual smoke test: open tide mode in browser. Verify:
- Click and drag selects up to 3 contiguous cells (yellow tint)
- Release transitions to dump mode (full cursor)
- Click dumps all scoops onto one cell
- Right-click cancels and undoes all digs
- Single click (no drag) still works for 1-cell scoop

**Step 3: Commit**

```
feat: wire DragDigging into tide mode
```

---

### Task 6: Final verification

**Step 1: Run full test suite**

Run: `npm run test:unit`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: PASS

**Step 2: Manual regression test**

- Verify title screen loads
- Verify tide mode: drag-to-dig works, waves still run on timer, erosion still applies
- Verify game-session mode (if accessible): single-cell digging still works with default strategy
