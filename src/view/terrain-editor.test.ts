import { Keys } from 'excalibur';
import { describe, expect, it, vi } from 'vitest';
import { TOWER_COST, WALL_LEVEL_COST, computeLayout } from '../config.ts';
import { InventoryModel } from '../model/inventory-model.ts';
import { FlatGround } from '../model/terrain/flat-ground.ts';
import { Hole } from '../model/terrain/hole.ts';
import type { Terrain } from '../model/terrain/terrain.ts';
import { Tower } from '../model/terrain/tower.ts';
import { Wall } from '../model/terrain/wall.ts';
import { ToolType } from '../tool-type.ts';
import { TerrainEditor, defaultSelection, nextSelection, type TerrainEdit, validActionsFor } from './terrain-editor.ts';

type PointerEvt = { worldPos: { x: number; y: number } };
type KeyEvt = { key: Keys };

function makeToolbarStub() {
  return {
    setEnabledTools: vi.fn<(s: Set<unknown> | null) => void>(),
    onToolTriggered: null as unknown,
  };
}

function makeGridStub() {
  return {
    getCell: vi.fn<() => Terrain>(() => new FlatGround()),
    setElevation: vi.fn<(col: number, row: number, delta: number) => void>(),
    placeTower: vi.fn<(col: number, row: number) => boolean>(() => true),
    placeWall: vi.fn<(col: number, row: number, level: number) => boolean>(() => true),
    isCastle: () => false,
    width: 16,
    height: 16,
    castleCol: 10,
    castleRow: 15,
  };
}

function makeSceneStub() {
  const keyHandlers: Record<string, KeyEvt extends infer T ? (evt: T) => void : never> = {};
  const pointerHandlers: Record<string, PointerEvt extends infer T ? (evt: T) => void : never> = {};
  return {
    add: vi.fn<(actor: unknown) => void>(),
    remove: vi.fn<(actor: unknown) => void>(),
    engine: {
      input: {
        keyboard: {
          on: vi.fn<(name: string, fn: (evt: KeyEvt) => void) => void>((name: string, fn) => {
            keyHandlers[name] = fn;
          }),
          off: vi.fn<(name: string, fn: (evt: KeyEvt) => void) => void>(),
        },
      },
    },
    input: {
      pointers: {
        primary: {
          on: vi.fn<(name: string, fn: (evt: PointerEvt) => void) => void>((name: string, fn) => {
            pointerHandlers[name] = fn;
          }),
          off: vi.fn<(name: string, fn: (evt: PointerEvt) => void) => void>(),
        },
      },
    },
    keyHandlers,
    pointerHandlers,
  };
}

const layout = computeLayout(window);

function pointerEvt(col: number, row: number) {
  return {
    worldPos: {
      x: layout.gridLeft + col * layout.tileSize + 1,
      y: layout.gridTop + row * layout.tileSize + 1,
    },
  };
}

describe('validActionsFor', () => {
  it('flat ground with full sand offers shovel, wall1, tower', () => {
    const actions = validActionsFor({ cell: new FlatGround(), sand: TOWER_COST });
    expect(actions).toEqual(new Set([ToolType.Shovel, ToolType.Wall1, ToolType.Tower]));
  });

  it('flat ground with 1 sand offers shovel and wall1 only', () => {
    const actions = validActionsFor({ cell: new FlatGround(), sand: 1 });
    expect(actions).toEqual(new Set([ToolType.Shovel, ToolType.Wall1]));
  });

  it('flat ground with 0 sand offers shovel only', () => {
    const actions = validActionsFor({ cell: new FlatGround(), sand: 0 });
    expect(actions).toEqual(new Set([ToolType.Shovel]));
  });

  it('hole offers shovel and wall1 (no tower)', () => {
    const actions = validActionsFor({ cell: new Hole(2), sand: TOWER_COST });
    expect(actions).toEqual(new Set([ToolType.Shovel, ToolType.Wall1]));
  });

  it('level-1 wall offers only wall2 when affordable', () => {
    const actions = validActionsFor({ cell: new Wall(1), sand: 5 });
    expect(actions).toEqual(new Set([ToolType.Wall2]));
  });

  it('level-1 wall offers nothing when wall2 unaffordable', () => {
    const actions = validActionsFor({ cell: new Wall(1), sand: 4 });
    expect(actions).toEqual(new Set());
  });

  it('level-4 wall (maxed) offers nothing', () => {
    const actions = validActionsFor({ cell: new Wall(4), sand: 1000 });
    expect(actions).toEqual(new Set());
  });

  it('tower offers nothing', () => {
    const actions = validActionsFor({ cell: new Tower(15), sand: TOWER_COST });
    expect(actions).toEqual(new Set());
  });
});

describe('nextSelection', () => {
  const never = () => false;

  it('moves one cell in the given direction', () => {
    expect(nextSelection({ from: { col: 2, row: 2 }, dx: 1, dy: 0, width: 5, height: 5, isCastle: never }))
      .toEqual({ col: 3, row: 2 });
  });

  it('returns null when stepping out of bounds', () => {
    expect(nextSelection({ from: { col: 4, row: 2 }, dx: 1, dy: 0, width: 5, height: 5, isCastle: never }))
      .toBeNull();
  });

  it('skips over castle cells in the travel direction', () => {
    const isCastle = (c: number, r: number) => c === 3 && r === 2;
    expect(nextSelection({ from: { col: 2, row: 2 }, dx: 1, dy: 0, width: 5, height: 5, isCastle }))
      .toEqual({ col: 4, row: 2 });
  });

  it('returns null when only castle cells remain in the direction', () => {
    const isCastle = (c: number) => c >= 3;
    expect(nextSelection({ from: { col: 2, row: 2 }, dx: 1, dy: 0, width: 5, height: 5, isCastle }))
      .toBeNull();
  });

  it('returns null when there is no movement direction', { timeout: 100 }, () => {
    expect(nextSelection({ from: { col: 2, row: 2 }, dx: 0, dy: 0, width: 5, height: 5, isCastle: never }))
      .toBeNull();
  });
});

describe('defaultSelection', () => {
  it('selects the cell directly in front of (above) the castle', () => {
    const isCastle = (c: number, r: number) => c === 10 && r === 15;
    expect(defaultSelection({ castleCol: 10, castleRow: 15, width: 16, height: 16, isCastle }))
      .toEqual({ col: 10, row: 14 });
  });

  it('falls back to the first non-castle cell when the front cell is unavailable', () => {
    const isCastle = (_c: number, r: number) => r === 0;
    expect(defaultSelection({ castleCol: 3, castleRow: 0, width: 4, height: 4, isCastle }))
      .toEqual({ col: 0, row: 1 });
  });

  it('falls back to the origin when every cell is castle', () => {
    const isCastle = () => true;
    expect(defaultSelection({ castleCol: 3, castleRow: 0, width: 4, height: 4, isCastle }))
      .toEqual({ col: 0, row: 0 });
  });
});

describe('TerrainEditor selection', () => {
  const fixtureIt = it.extend<{
    scene: ReturnType<typeof makeSceneStub>;
    grid: ReturnType<typeof makeGridStub>;
    toolbar: ReturnType<typeof makeToolbarStub>;
    editor: TerrainEditor;
  }>({
    // eslint-disable-next-line no-empty-pattern
    scene: async ({}, use) => {
      await use(makeSceneStub());
    },
    // eslint-disable-next-line no-empty-pattern
    grid: async ({}, use) => {
      await use(makeGridStub());
    },
    // eslint-disable-next-line no-empty-pattern
    toolbar: async ({}, use) => {
      await use(makeToolbarStub());
    },
    editor: async ({ scene, grid, toolbar }, use) => {
      const editor = new TerrainEditor();
      editor.activate(scene as never, grid as never, {
        delta: 1,
        inventory: new InventoryModel(),
        toolbar: toolbar as never,
        onSandChanged: vi.fn<(count: number) => void>(),
        onStateChanged: vi.fn<() => void>(),
      });
      await use(editor);
    },
  });

  fixtureIt('starts with no selection and disables all tools', ({ editor, toolbar }) => {
    expect(editor.selected).toBeNull();
    expect(toolbar.setEnabledTools).toHaveBeenLastCalledWith(null);
  });

  fixtureIt('clicking a non-castle cell selects it and enables its valid tools', ({ scene, editor, toolbar }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    expect(editor.selected).toEqual({ col: 2, row: 2 });
    expect(toolbar.setEnabledTools).toHaveBeenLastCalledWith(expect.any(Set));
  });

  it('editor-level wall enablement respects sand', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    // no sand added — wall1 requires 1 sand which is the minimum cost
    const editor = new TerrainEditor();

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));

    expect(toolbar.setEnabledTools).toHaveBeenLastCalledWith(new Set([ToolType.Shovel]));
    expect(editor.getStateText()).toBe('Selected - dig');
  });

  fixtureIt('clicking a castle cell does not change selection', ({ scene, grid, editor }) => {
    grid.isCastle = () => true;
    scene.pointerHandlers.down(pointerEvt(10, 15));
    expect(editor.selected).toBeNull();
  });

  fixtureIt('clicking outside the live grid bounds does not change selection', ({ scene, grid, editor }) => {
    grid.width = 2;
    grid.height = 2;
    scene.pointerHandlers.down(pointerEvt(2, 2));
    expect(editor.selected).toBeNull();
  });

  fixtureIt('first arrow press selects the default cell in front of the castle', ({ scene, editor }) => {
    scene.keyHandlers.press({ key: Keys.Up });
    expect(editor.selected).toEqual({ col: 10, row: 14 });
  });

  fixtureIt('arrow keys move the existing selection by one cell', ({ scene, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    scene.keyHandlers.press({ key: Keys.Right });
    expect(editor.selected).toEqual({ col: 3, row: 2 });
    scene.keyHandlers.press({ key: Keys.Down });
    expect(editor.selected).toEqual({ col: 3, row: 3 });
  });

  fixtureIt('arrow into the grid edge is a no-op', ({ scene, grid, editor }) => {
    grid.width = 16;
    scene.pointerHandlers.down(pointerEvt(0, 0));
    scene.keyHandlers.press({ key: Keys.Left });
    expect(editor.selected).toEqual({ col: 0, row: 0 });
  });

  fixtureIt('non-arrow keys do not move selection', ({ scene, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    scene.keyHandlers.press({ key: Keys.Enter });
    expect(editor.selected).toEqual({ col: 2, row: 2 });
  });

  fixtureIt('lock makes apply and movement no-ops', ({ scene, grid, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.lock();
    editor.applyAction(ToolType.Shovel);
    scene.keyHandlers.press({ key: Keys.Right });
    expect(grid.setElevation).not.toHaveBeenCalled();
    expect(editor.selected).toEqual({ col: 2, row: 2 });
  });

  fixtureIt('unlock restores the selection highlight', ({ scene, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.lock();
    expect((editor as never as { highlight: { graphics: { visible: boolean } } }).highlight.graphics.visible).toBe(false);
    editor.unlock();
    expect((editor as never as { highlight: { graphics: { visible: boolean } } }).highlight.graphics.visible).toBe(true);
  });

  fixtureIt('moving the pointer over a selectable cell sets it as hovered', ({ scene, editor }) => {
    scene.pointerHandlers.move(pointerEvt(3, 4));
    expect(editor.hovered).toEqual({ col: 3, row: 4 });
  });

  fixtureIt('moving over a castle cell clears the hover', ({ scene, grid, editor }) => {
    scene.pointerHandlers.move(pointerEvt(2, 2));
    expect(editor.hovered).toEqual({ col: 2, row: 2 });
    grid.isCastle = () => true;
    scene.pointerHandlers.move(pointerEvt(10, 15));
    expect(editor.hovered).toBeNull();
  });

  fixtureIt('moving outside the live grid bounds clears the hover', ({ scene, grid, editor }) => {
    scene.pointerHandlers.move(pointerEvt(1, 1));
    expect(editor.hovered).toEqual({ col: 1, row: 1 });
    grid.width = 2;
    grid.height = 2;
    scene.pointerHandlers.move(pointerEvt(5, 5));
    expect(editor.hovered).toBeNull();
  });

  fixtureIt('hovering does not change the selection', ({ scene, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    scene.pointerHandlers.move(pointerEvt(4, 4));
    expect(editor.selected).toEqual({ col: 2, row: 2 });
  });

  fixtureIt('hovering is suppressed while a cell is selected', ({ scene, editor }) => {
    type HoverActor = { hoverHighlight: { graphics: { visible: boolean } } };
    scene.pointerHandlers.down(pointerEvt(2, 2));
    scene.pointerHandlers.move(pointerEvt(4, 4));
    expect(editor.hovered).toBeNull();
    expect((editor as never as HoverActor).hoverHighlight.graphics.visible).toBe(false);
  });

  fixtureIt('escape clears the selection', ({ scene, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    expect(editor.selected).toEqual({ col: 2, row: 2 });
    scene.keyHandlers.press({ key: Keys.Escape });
    expect(editor.selected).toBeNull();
  });

  fixtureIt('escape returns the hover effect at the current pointer cell', ({ scene, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    scene.pointerHandlers.move(pointerEvt(4, 4));
    expect(editor.hovered).toBeNull();
    scene.keyHandlers.press({ key: Keys.Escape });
    expect(editor.hovered).toEqual({ col: 4, row: 4 });
  });

  fixtureIt('lock hides the hover highlight and ignores further hovers', ({ scene, editor }) => {
    type HoverActor = { hoverHighlight: { graphics: { visible: boolean } } };
    scene.pointerHandlers.move(pointerEvt(3, 3));
    expect((editor as never as HoverActor).hoverHighlight.graphics.visible).toBe(true);
    editor.lock();
    expect((editor as never as HoverActor).hoverHighlight.graphics.visible).toBe(false);
    scene.pointerHandlers.move(pointerEvt(4, 4));
    expect(editor.hovered).toBeNull();
  });

  fixtureIt('getStateText prompts to select when nothing is selected', ({ editor }) => {
    expect(editor.getStateText()).toBe('Click a cell to start planning');
  });

  fixtureIt('getStateText describes actions once a cell is selected', ({ scene, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    expect(editor.getStateText()).toBe('Selected - dig');
  });

  fixtureIt('getStateText tells the player to move off a tower', ({ scene, grid, editor }) => {
    grid.getCell = vi.fn<() => Terrain>(() => new Tower(15));
    scene.pointerHandlers.down(pointerEvt(2, 2));
    expect(editor.getStateText()).toBe('Tower selected - move to another cell');
  });

  fixtureIt('getStateText tells the player to move off a maxed L4 wall', ({ scene, grid, editor }) => {
    grid.getCell = vi.fn<() => Terrain>(() => new Wall(4));
    scene.pointerHandlers.down(pointerEvt(2, 2));
    expect(editor.getStateText()).toBe('Wall maxed - move to another cell');
  });
});

describe('TerrainEditor apply', () => {
  it('dig lowers the selected cell, adds sand, and fires onEditApplied', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ToolType.Shovel);

    expect(grid.setElevation).toHaveBeenCalledWith(2, 2, -1);
    expect(inventory.sand).toBe(1);
    expect(edits).toEqual([{ tool: ToolType.Shovel, cell: { col: 2, row: 2 }, delta: 1 }]);
  });

  it('repeats digging in place', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ToolType.Shovel);
    editor.applyAction(ToolType.Shovel);
    editor.applyAction(ToolType.Shovel);

    expect(grid.setElevation).toHaveBeenCalledTimes(3);
    expect(edits).toEqual([
      { tool: ToolType.Shovel, cell: { col: 2, row: 2 }, delta: 1 },
      { tool: ToolType.Shovel, cell: { col: 2, row: 2 }, delta: 1 },
      { tool: ToolType.Shovel, cell: { col: 2, row: 2 }, delta: 1 },
    ]);
  });

  it('wall1 requires sand, calls placeWall, and removes sand', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);
    inventory.addSand(WALL_LEVEL_COST[0]);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ToolType.Wall1);

    expect(grid.placeWall).toHaveBeenCalledWith(2, 2, 1);
    expect(inventory.sand).toBe(0);
    expect(edits).toEqual([{ tool: ToolType.Wall1, cell: { col: 2, row: 2 }, delta: WALL_LEVEL_COST[0] }]);
  });

  it('wall1 with no sand is a no-op', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ToolType.Wall1);

    expect(grid.placeWall).not.toHaveBeenCalled();
    expect(edits).toEqual([]);
  });

  it('wall2 spends 5 sand and calls placeWall with level 2', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);
    // Simulate a level-1 wall already placed
    grid.getCell = vi.fn<() => Terrain>(() => new Wall(1));
    inventory.addSand(WALL_LEVEL_COST[1]);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ToolType.Wall2);

    expect(grid.placeWall).toHaveBeenCalledWith(2, 2, 2);
    expect(inventory.sand).toBe(0);
    expect(edits).toEqual([{ tool: ToolType.Wall2, cell: { col: 2, row: 2 }, delta: WALL_LEVEL_COST[1] }]);
  });

  it('placeWall failure refunds sand', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);
    grid.placeWall = vi.fn<(col: number, row: number, level: number) => boolean>(() => false);
    inventory.addSand(WALL_LEVEL_COST[0]);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ToolType.Wall1);

    expect(grid.placeWall).toHaveBeenCalledWith(2, 2, 1);
    expect(inventory.sand).toBe(WALL_LEVEL_COST[0]);
    expect(edits).toEqual([]);
  });

  it('tower placement refunds sand when placeTower fails', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);
    grid.placeTower = vi.fn<(col: number, row: number) => boolean>(() => false);
    inventory.addSand(TOWER_COST);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ToolType.Tower);

    expect(grid.placeTower).toHaveBeenCalledWith(2, 2);
    expect(inventory.sand).toBe(TOWER_COST);
    expect(edits).toEqual([]);
  });

  it('tower placement spends sand and emits an edit when it succeeds', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);
    inventory.addSand(TOWER_COST);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ToolType.Tower);

    expect(grid.placeTower).toHaveBeenCalledWith(2, 2);
    expect(inventory.sand).toBe(0);
    expect(edits).toEqual([{ tool: ToolType.Tower, cell: { col: 2, row: 2 }, delta: TOWER_COST }]);
  });

  it('does nothing when no cell is selected', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
    });

    editor.applyAction(ToolType.Shovel);

    expect(grid.setElevation).not.toHaveBeenCalled();
  });
});
