import { Keys } from 'excalibur';
import { describe, expect, it, vi } from 'vitest';
import { TOWER_COST, WALL_LEVEL_COST, TILE_SIZE, GRID_LEFT, GRID_TOP } from '../config.ts';
import { InventoryModel } from '../model/inventory-model.ts';
import { FlatGround } from '../model/terrain/flat-ground.ts';
import { Hole } from '../model/terrain/hole.ts';
import type { Terrain } from '../model/terrain/terrain.ts';
import { Tower } from '../model/terrain/tower.ts';
import { Wall } from '../model/terrain/wall.ts';
import { ActionType } from '../action-type.ts';
import { TerrainEditor, defaultSelection, nextSelection, type TerrainEdit } from './terrain-editor.ts';
import type { ActionView } from './toolbar.ts';
import type { DeleteConfirmation } from './delete-confirmation.ts';

type PointerEvt = { worldPos: { x: number; y: number } };
type KeyEvt = { key: Keys };

function makeToolbarStub() {
  return {
    setActions: vi.fn<(actions: ActionView[] | null) => void>(),
    onActionTriggered: null as unknown,
  };
}

function makeGridStub() {
  return {
    getCell: vi.fn<() => Terrain>(() => new FlatGround()),
    setElevation: vi.fn<(col: number, row: number, delta: number) => void>(),
    placeTower: vi.fn<(col: number, row: number) => boolean>(() => true),
    placeWall: vi.fn<(col: number, row: number, level: number) => boolean>(() => true),
    clearCell: vi.fn<(col: number, row: number) => void>(),
    isCastle: () => false,
    width: 16,
    height: 16,
    castleCol: 10,
    castleRow: 15,
  };
}

function makeDeleteConfirmationStub(resolveWith = false): DeleteConfirmation {
  return {
    open: vi.fn<(label: string) => Promise<boolean>>().mockResolvedValue(resolveWith),
    deactivate: vi.fn<() => void>(),
  } as unknown as DeleteConfirmation;
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
      x: GRID_LEFT + col * TILE_SIZE + 1,
      y: GRID_TOP + row * TILE_SIZE + 1,
    },
  };
}

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
        deleteConfirmation: makeDeleteConfirmationStub(),
        onSandChanged: vi.fn<(count: number) => void>(),
        onStateChanged: vi.fn<() => void>(),
        onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
      });
      await use(editor);
    },
  });

  fixtureIt('starts with no selection and calls setActions(null)', ({ editor, toolbar }) => {
    expect(editor.selected).toBeNull();
    expect(toolbar.setActions).toHaveBeenLastCalledWith(null);
  });

  fixtureIt('clicking a non-castle cell selects it and sets action views', ({ scene, editor, toolbar }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    expect(editor.selected).toEqual({ col: 2, row: 2 });
    expect(toolbar.setActions).toHaveBeenLastCalledWith(expect.any(Array));
  });

  it('flat ground with full sand shows Dig, BuildWall, BuildTower actions', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    inventory.addSand(TOWER_COST);
    const editor = new TerrainEditor();

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: number) => void>() as never,
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));

    const calls = toolbar.setActions.mock.calls;
    const lastCall = calls.at(-1)?.[0] as ActionView[] | null;
    expect(lastCall).not.toBeNull();
    const types = (lastCall as ActionView[]).map((a) => a.type);
    expect(types).toEqual([ActionType.Dig, ActionType.BuildWall, ActionType.BuildTower]);
  });

  it('flat ground with 0 sand shows Dig enabled, BuildWall and BuildTower disabled', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    // no sand added
    const editor = new TerrainEditor();

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));

    const lastCall = toolbar.setActions.mock.calls.at(-1)?.[0] as ActionView[] | null;
    expect(lastCall).not.toBeNull();
    const digAction = (lastCall as ActionView[]).find((a) => a.type === ActionType.Dig);
    const wallAction = (lastCall as ActionView[]).find((a) => a.type === ActionType.BuildWall);
    expect(digAction?.disabled).toBe(false);
    expect(wallAction?.disabled).toBe(true);
    expect(editor.getSelectedInfo()).not.toBeNull();
  });

  it('hole shows only Dig action', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    grid.getCell = vi.fn<() => Terrain>(() => new Hole(2));
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    inventory.addSand(TOWER_COST);
    const editor = new TerrainEditor();

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));

    const lastCall = toolbar.setActions.mock.calls.at(-1)?.[0] as ActionView[] | null;
    expect(lastCall).not.toBeNull();
    const types = (lastCall as ActionView[]).map((a) => a.type);
    expect(types).toEqual([ActionType.Dig]);
  });

  it('wall L1-L3 shows Upgrade + Destroy', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    grid.getCell = vi.fn<() => Terrain>(() => new Wall(1));
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    inventory.addSand(WALL_LEVEL_COST[1]);
    const editor = new TerrainEditor();

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));

    const lastCall = toolbar.setActions.mock.calls.at(-1)?.[0] as ActionView[] | null;
    expect(lastCall).not.toBeNull();
    const types = (lastCall as ActionView[]).map((a) => a.type);
    expect(types).toEqual([ActionType.Upgrade, ActionType.Destroy]);
  });

  it('wall L4 and tower show only Destroy', () => {
    for (const cell of [new Wall(4), new Tower(15)]) {
      const scene = makeSceneStub();
      const grid = makeGridStub();
      grid.getCell = vi.fn<() => Terrain>(() => cell);
      const toolbar = makeToolbarStub();
      const inventory = new InventoryModel();
      const editor = new TerrainEditor();

      editor.activate(scene as never, grid as never, {
        delta: 1,
        inventory,
        toolbar: toolbar as never,
        deleteConfirmation: makeDeleteConfirmationStub(),
        onSandChanged: vi.fn<(count: number) => void>(),
        onStateChanged: vi.fn<() => void>(),
        onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
      });

      scene.pointerHandlers.down(pointerEvt(2, 2));

      const lastCall = toolbar.setActions.mock.calls.at(-1)?.[0] as ActionView[] | null;
      expect(lastCall).not.toBeNull();
      const types = (lastCall as ActionView[]).map((a) => a.type);
      expect(types).toEqual([ActionType.Destroy]);
    }
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
    editor.applyAction(ActionType.Dig);
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

  fixtureIt('getSelectedInfo returns null when nothing is selected', ({ editor }) => {
    expect(editor.getSelectedInfo()).toBeNull();
  });

  fixtureIt('getSelectedInfo returns CellInfo once a cell is selected', ({ scene, editor }) => {
    scene.pointerHandlers.down(pointerEvt(2, 2));
    const info = editor.getSelectedInfo();
    expect(info).not.toBeNull();
    expect(info).toHaveProperty('title');
    expect(info).toHaveProperty('stats');
  });

  fixtureIt('getSelectedInfo returns CellInfo for a tower cell', ({ scene, grid, editor }) => {
    grid.getCell = vi.fn<() => Terrain>(() => new Tower(15));
    scene.pointerHandlers.down(pointerEvt(2, 2));
    const info = editor.getSelectedInfo();
    expect(info).not.toBeNull();
    expect(info?.title).toBe('Tower');
  });

  fixtureIt('getSelectedInfo returns CellInfo for a maxed wall cell', ({ scene, grid, editor }) => {
    grid.getCell = vi.fn<() => Terrain>(() => new Wall(4));
    scene.pointerHandlers.down(pointerEvt(2, 2));
    const info = editor.getSelectedInfo();
    expect(info).not.toBeNull();
    expect(info?.title).toBe('Wall L4');
  });
});

describe('TerrainEditor apply', () => {
  it('Dig lowers the selected cell, adds sand, and fires onEditApplied', () => {
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
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ActionType.Dig);

    expect(grid.setElevation).toHaveBeenCalledWith(2, 2, -1);
    expect(inventory.sand).toBe(1);
    expect(edits).toEqual([{ action: ActionType.Dig, cell: { col: 2, row: 2 }, delta: 1 }]);
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
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ActionType.Dig);
    editor.applyAction(ActionType.Dig);
    editor.applyAction(ActionType.Dig);

    expect(grid.setElevation).toHaveBeenCalledTimes(3);
    expect(edits).toEqual([
      { action: ActionType.Dig, cell: { col: 2, row: 2 }, delta: 1 },
      { action: ActionType.Dig, cell: { col: 2, row: 2 }, delta: 1 },
      { action: ActionType.Dig, cell: { col: 2, row: 2 }, delta: 1 },
    ]);
  });

  it('BuildWall requires sand, calls placeWall at level 1, and removes sand', () => {
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
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ActionType.BuildWall);

    expect(grid.placeWall).toHaveBeenCalledWith(2, 2, 1);
    expect(inventory.sand).toBe(0);
    expect(edits).toEqual([{ action: ActionType.BuildWall, cell: { col: 2, row: 2 }, delta: WALL_LEVEL_COST[0] }]);
  });

  it('BuildWall with no sand is a no-op', () => {
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
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ActionType.BuildWall);

    expect(grid.placeWall).not.toHaveBeenCalled();
    expect(edits).toEqual([]);
  });

  it('Upgrade on level-1 wall spends level-2 cost and calls placeWall with level 2', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);
    grid.getCell = vi.fn<() => Terrain>(() => new Wall(1));
    inventory.addSand(WALL_LEVEL_COST[1]);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ActionType.Upgrade);

    expect(grid.placeWall).toHaveBeenCalledWith(2, 2, 2);
    expect(inventory.sand).toBe(0);
    expect(edits).toEqual([{ action: ActionType.Upgrade, cell: { col: 2, row: 2 }, delta: WALL_LEVEL_COST[1] }]);
  });

  it('Upgrade on level-2 wall spends level-3 cost and calls placeWall with level 3', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);
    grid.getCell = vi.fn<() => Terrain>(() => new Wall(2));
    inventory.addSand(WALL_LEVEL_COST[2]);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ActionType.Upgrade);

    expect(grid.placeWall).toHaveBeenCalledWith(2, 2, 3);
    expect(inventory.sand).toBe(0);
    expect(edits).toEqual([{ action: ActionType.Upgrade, cell: { col: 2, row: 2 }, delta: WALL_LEVEL_COST[2] }]);
  });

  it('Upgrade on level-3 wall spends level-4 cost and calls placeWall with level 4', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);
    grid.getCell = vi.fn<() => Terrain>(() => new Wall(3));
    inventory.addSand(WALL_LEVEL_COST[3]);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ActionType.Upgrade);

    expect(grid.placeWall).toHaveBeenCalledWith(2, 2, 4);
    expect(inventory.sand).toBe(0);
    expect(edits).toEqual([{ action: ActionType.Upgrade, cell: { col: 2, row: 2 }, delta: WALL_LEVEL_COST[3] }]);
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
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ActionType.BuildWall);

    expect(grid.placeWall).toHaveBeenCalledWith(2, 2, 1);
    expect(inventory.sand).toBe(WALL_LEVEL_COST[0]);
    expect(edits).toEqual([]);
  });

  it('Upgrade failure refunds sand', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    const editor = new TerrainEditor();
    const edits: TerrainEdit[] = [];
    editor.onEditApplied = (edit) => edits.push(edit);
    grid.getCell = vi.fn<() => Terrain>(() => new Wall(1));
    grid.placeWall = vi.fn<(col: number, row: number, level: number) => boolean>(() => false);
    inventory.addSand(WALL_LEVEL_COST[1]);

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ActionType.Upgrade);

    expect(grid.placeWall).toHaveBeenCalledWith(2, 2, 2);
    expect(inventory.sand).toBe(WALL_LEVEL_COST[1]);
    expect(edits).toEqual([]);
  });

  it('BuildTower placement refunds sand when placeTower fails', () => {
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
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ActionType.BuildTower);

    expect(grid.placeTower).toHaveBeenCalledWith(2, 2);
    expect(inventory.sand).toBe(TOWER_COST);
    expect(edits).toEqual([]);
  });

  it('BuildTower placement spends sand and emits an edit when it succeeds', () => {
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
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    editor.applyAction(ActionType.BuildTower);

    expect(grid.placeTower).toHaveBeenCalledWith(2, 2);
    expect(inventory.sand).toBe(0);
    expect(edits).toEqual([{ action: ActionType.BuildTower, cell: { col: 2, row: 2 }, delta: TOWER_COST }]);
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
      deleteConfirmation: makeDeleteConfirmationStub(),
      onSandChanged: vi.fn<(count: number) => void>(),
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange: vi.fn<(open: boolean) => void>(),
    });

    editor.applyAction(ActionType.Dig);

    expect(grid.setElevation).not.toHaveBeenCalled();
  });
});

describe('TerrainEditor delete key', () => {
  function makeEditorWithCell(cell: Terrain, confirmResult: boolean) {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    grid.getCell = vi.fn<() => Terrain>(() => cell);
    const toolbar = makeToolbarStub();
    const inventory = new InventoryModel();
    inventory.addSand(10);
    const deleteConfirmation = makeDeleteConfirmationStub(confirmResult);
    const onDeleteDialogOpenChange = vi.fn<(open: boolean) => void>();
    const onSandChanged = vi.fn<(count: number) => void>();
    const editor = new TerrainEditor();

    editor.activate(scene as never, grid as never, {
      delta: 1,
      inventory,
      toolbar: toolbar as never,
      deleteConfirmation,
      onSandChanged,
      onStateChanged: vi.fn<() => void>(),
      onDeleteDialogOpenChange,
    });

    scene.pointerHandlers.down(pointerEvt(2, 2));
    return { scene, grid, editor, deleteConfirmation, onDeleteDialogOpenChange, onSandChanged, inventory };
  }

  it('Delete on FlatGround is a no-op (no modal, no clearCell)', async () => {
    const { scene, grid, deleteConfirmation } = makeEditorWithCell(new FlatGround(), false);
    scene.keyHandlers.press({ key: Keys.Delete });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(deleteConfirmation.open).not.toHaveBeenCalled();
    expect(grid.clearCell).not.toHaveBeenCalled();
  });

  it('Backspace on FlatGround is a no-op', async () => {
    const { scene, grid, deleteConfirmation } = makeEditorWithCell(new FlatGround(), false);
    scene.keyHandlers.press({ key: Keys.Backspace });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(deleteConfirmation.open).not.toHaveBeenCalled();
    expect(grid.clearCell).not.toHaveBeenCalled();
  });

  it('Delete on Wall opens confirmation modal', async () => {
    const { scene, deleteConfirmation } = makeEditorWithCell(new Wall(1), false);
    scene.keyHandlers.press({ key: Keys.Delete });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(deleteConfirmation.open).toHaveBeenCalledWith('Wall L1');
  });

  it('Delete on Hole opens confirmation modal', async () => {
    const { scene, deleteConfirmation } = makeEditorWithCell(new Hole(2), false);
    scene.keyHandlers.press({ key: Keys.Delete });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(deleteConfirmation.open).toHaveBeenCalledWith('Hole');
  });

  it('Delete on Tower opens confirmation modal', async () => {
    const { scene, deleteConfirmation } = makeEditorWithCell(new Tower(15), false);
    scene.keyHandlers.press({ key: Keys.Delete });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(deleteConfirmation.open).toHaveBeenCalledWith('Tower');
  });

  it('onDeleteDialogOpenChange fires true on open and false on close', async () => {
    const { scene, onDeleteDialogOpenChange } = makeEditorWithCell(new Wall(1), false);
    scene.keyHandlers.press({ key: Keys.Delete });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onDeleteDialogOpenChange).toHaveBeenCalledWith(true);
    expect(onDeleteDialogOpenChange).toHaveBeenCalledWith(false);
  });

  it('confirmed deletion calls clearCell and does not add sand', async () => {
    const { scene, grid, inventory } = makeEditorWithCell(new Wall(2), true);
    const sandBefore = inventory.sand;
    scene.keyHandlers.press({ key: Keys.Delete });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(grid.clearCell).toHaveBeenCalledWith(2, 2);
    expect(inventory.sand).toBe(sandBefore);
  });

  it('cancelled deletion does not call clearCell', async () => {
    const { scene, grid } = makeEditorWithCell(new Tower(15), false);
    scene.keyHandlers.press({ key: Keys.Delete });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(grid.clearCell).not.toHaveBeenCalled();
  });

  it('no sand refund on confirmed deletion', async () => {
    const { scene, inventory } = makeEditorWithCell(new Hole(3), true);
    const sandBefore = inventory.sand;
    scene.keyHandlers.press({ key: Keys.Delete });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(inventory.sand).toBe(sandBefore);
  });

  it('Destroy action uses the same requestDestroy path: opens confirmation and clears cell', async () => {
    const { grid, editor, deleteConfirmation } = makeEditorWithCell(new Wall(1), true);
    void editor.applyAction(ActionType.Destroy);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(deleteConfirmation.open).toHaveBeenCalledWith('Wall L1');
    expect(grid.clearCell).toHaveBeenCalledWith(2, 2);
  });

  it('Delete key opens same confirmation dialog as Destroy action', async () => {
    const { scene, grid, deleteConfirmation } = makeEditorWithCell(new Wall(1), true);
    scene.keyHandlers.press({ key: Keys.Delete });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(deleteConfirmation.open).toHaveBeenCalledWith('Wall L1');
    expect(grid.clearCell).toHaveBeenCalledWith(2, 2);
  });
});
