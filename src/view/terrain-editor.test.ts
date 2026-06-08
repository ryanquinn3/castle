import { Keys } from 'excalibur';
import { describe, expect, it, test as baseTest, vi } from 'vitest';
import { TOWER_COST, computeLayout } from '../config.ts';
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

describe('validActionsFor', () => {
  it('flat ground with plenty of sand allows dig, wall, tower', () => {
    const actions = validActionsFor({ cell: new FlatGround(), sand: TOWER_COST });
    expect(actions).toEqual(new Set([ToolType.Shovel, ToolType.Wall, ToolType.Tower]));
  });

  it('flat ground below tower cost drops tower but keeps wall', () => {
    const actions = validActionsFor({ cell: new FlatGround(), sand: 1 });
    expect(actions).toEqual(new Set([ToolType.Shovel, ToolType.Wall]));
  });

  it('flat ground with no sand allows only dig', () => {
    const actions = validActionsFor({ cell: new FlatGround(), sand: 0 });
    expect(actions).toEqual(new Set([ToolType.Shovel]));
  });

  it('hole allows dig and wall (never tower)', () => {
    const actions = validActionsFor({ cell: new Hole(2), sand: TOWER_COST });
    expect(actions).toEqual(new Set([ToolType.Shovel, ToolType.Wall]));
  });

  it('wall allows dig and wall (never tower)', () => {
    const actions = validActionsFor({ cell: new Wall(3), sand: TOWER_COST });
    expect(actions).toEqual(new Set([ToolType.Shovel, ToolType.Wall]));
  });

  it('tower allows nothing', () => {
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
  const layout = computeLayout(window);

  function makeToolbarStub() {
    return {
      setEnabledTools: vi.fn<(s: Set<unknown> | null) => void>(),
      onToolTriggered: null as unknown,
    };
  }

  function makeGridStub() {
    return {
      getCell: vi.fn<() => FlatGround>(() => new FlatGround()),
      getTile: vi.fn<() => { col: number; row: number; isCastle: boolean }>(() => ({ col: 0, row: 0, isCastle: false })),
      setElevation: vi.fn<(col: number, row: number, delta: number) => void>(),
      refreshTileVisual: vi.fn<(...args: unknown[]) => void>(),
      placeTower: vi.fn<(col: number, row: number) => boolean>(() => true),
      model: {
        getCell: vi.fn<() => Terrain>(() => new FlatGround()),
        isCastle: () => false,
        width: 16,
        height: 16,
        castleCol: 10,
        castleRow: 15,
      },
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

  function pointerEvt(col: number, row: number) {
    return {
      worldPos: {
        x: layout.gridLeft + col * layout.tileSize + 1,
        y: layout.gridTop + row * layout.tileSize + 1,
      },
    };
  }

  const test = baseTest.extend<{
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

  test('starts with no selection and disables all tools', ({ editor, toolbar }) => {
    expect(editor.selected).toBeNull();
    expect(toolbar.setEnabledTools).toHaveBeenLastCalledWith(null);
  });

  test('clicking a non-castle cell selects it and enables its valid tools', ({ scene, editor, toolbar }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    expect(editor.selected).toEqual({ col: 2, row: 2 });
    expect(toolbar.setEnabledTools).toHaveBeenLastCalledWith(expect.any(Set));
  });

  test('editor-level wall enablement respects delta cost', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    inventory.addSand(1);
    const editor = new TerrainEditor();

    editor.activate(scene as never, grid as never, {
      delta: 2,
      inventory,
      toolbar: toolbar as never,
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));

    expect(toolbar.setEnabledTools).toHaveBeenLastCalledWith(new Set([ToolType.Shovel]));
    expect(editor.getStateText()).toBe('Selected - dig');
  });

  test('clicking a castle cell does not change selection', ({ scene, grid, editor }) => {
    grid.model.isCastle = () => true;
    scene.pointerHandlers.down(pointerEvt(10, 15));
    expect(editor.selected).toBeNull();
  });

  test('clicking outside the live grid bounds does not change selection', ({ scene, grid, editor }) => {
    grid.model.width = 2;
    grid.model.height = 2;
    scene.pointerHandlers.down(pointerEvt(2, 2));
    expect(editor.selected).toBeNull();
  });

  test('first arrow press selects the default cell in front of the castle', ({ scene, editor }) => {
    scene.keyHandlers.press({ key: Keys.Up });
    expect(editor.selected).toEqual({ col: 10, row: 14 });
  });

  test('arrow keys move the existing selection by one cell', ({ scene, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    scene.keyHandlers.press({ key: Keys.Right });
    expect(editor.selected).toEqual({ col: 3, row: 2 });
    scene.keyHandlers.press({ key: Keys.Down });
    expect(editor.selected).toEqual({ col: 3, row: 3 });
  });

  test('arrow into the grid edge is a no-op', ({ scene, grid, editor }) => {
    grid.model.width = 16;
    scene.pointerHandlers.down(pointerEvt(0, 0));
    scene.keyHandlers.press({ key: Keys.Left });
    expect(editor.selected).toEqual({ col: 0, row: 0 });
  });

  test('non-arrow keys do not move selection', ({ scene, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    scene.keyHandlers.press({ key: Keys.Enter });
    expect(editor.selected).toEqual({ col: 2, row: 2 });
  });

  test('lock makes apply and movement no-ops', ({ scene, grid, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.lock();
    editor.applyAction(ToolType.Shovel);
    scene.keyHandlers.press({ key: Keys.Right });
    expect(grid.setElevation).not.toHaveBeenCalled();
    expect(editor.selected).toEqual({ col: 2, row: 2 });
  });

  test('unlock restores the selection highlight', ({ scene, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.lock();
    expect((editor as never as { highlight: { graphics: { visible: boolean } } }).highlight.graphics.visible).toBe(false);
    editor.unlock();
    expect((editor as never as { highlight: { graphics: { visible: boolean } } }).highlight.graphics.visible).toBe(true);
  });

  test('getStateText prompts to select when nothing is selected', ({ editor }) => {
    expect(editor.getStateText()).toBe('Click a cell to start planning');
  });

  test('getStateText describes actions once a cell is selected', ({ scene, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    expect(editor.getStateText()).toBe('Selected - dig');
  });

  test('getStateText tells the player to move off a tower', ({ scene, grid, editor }) => {
    grid.model.getCell = vi.fn<() => Terrain>(() => new Tower(15));
    scene.pointerHandlers.down(pointerEvt(2, 2));
    expect(editor.getStateText()).toBe('Tower selected - move to another cell');
  });
});

describe('TerrainEditor apply', () => {
  const layout = computeLayout(window);

  function makeToolbarStub() {
    return {
      setEnabledTools: vi.fn<(s: Set<unknown> | null) => void>(),
      onToolTriggered: null as unknown,
    };
  }

  function makeGridStub() {
    return {
      getCell: vi.fn<() => FlatGround>(() => new FlatGround()),
      getTile: vi.fn<() => { col: number; row: number; isCastle: boolean }>(() => ({ col: 0, row: 0, isCastle: false })),
      setElevation: vi.fn<(col: number, row: number, delta: number) => void>(),
      refreshTileVisual: vi.fn<(...args: unknown[]) => void>(),
      placeTower: vi.fn<(col: number, row: number) => boolean>(() => true),
      model: {
        getCell: vi.fn<() => Terrain>(() => new FlatGround()),
        isCastle: () => false,
        width: 16,
        height: 16,
        castleCol: 10,
        castleRow: 15,
      },
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

  function pointerEvt(col: number, row: number) {
    return {
      worldPos: {
        x: layout.gridLeft + col * layout.tileSize + 1,
        y: layout.gridTop + row * layout.tileSize + 1,
      },
    };
  }

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

  it('wall requires sand and removes it', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);
    inventory.addSand(2);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ToolType.Wall);

    expect(grid.setElevation).toHaveBeenCalledWith(2, 2, 1);
    expect(inventory.sand).toBe(1);
    expect(edits).toEqual([{ tool: ToolType.Wall, cell: { col: 2, row: 2 }, delta: 1 }]);
  });

  it('wall with no sand is a no-op', () => {
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
    editor.applyAction(ToolType.Wall);

    expect(grid.setElevation).not.toHaveBeenCalled();
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
