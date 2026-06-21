import { describe, expect, it, vi } from 'vitest';
import { GRID_HEIGHT, TILE_SIZE, GRID_LEFT, GRID_TOP } from '../config.ts';
import { InventoryModel } from '../model/inventory-model.ts';
import { FlatGround } from '../model/terrain/flat-ground.ts';
import { Wall } from '../model/terrain/wall.ts';
import type { Terrain } from '../model/terrain/terrain.ts';
import type { ActionView } from './toolbar.ts';
import type { DeleteConfirmation } from './delete-confirmation.ts';
import { PlanningPhase } from './planning-phase.ts';
import type { CellInfo } from '../model/terrain/terrain.ts';
import type { Scene } from 'excalibur';

type KeyEvt = { key: string };
type PointerEvt = { worldPos: { x: number; y: number } };

function makeSceneStub() {
  const keyHandlers: Record<string, (evt: KeyEvt) => void> = {};
  const pointerHandlers: Record<string, (evt: PointerEvt) => void> = {};
  return {
    add: vi.fn<(actor: unknown) => void>(),
    remove: vi.fn<(actor: unknown) => void>(),
    engine: {
      input: {
        keyboard: {
          on: vi.fn<(name: string, fn: (evt: KeyEvt) => void) => void>((name, fn) => {
            keyHandlers[name] = fn;
          }),
          off: vi.fn<(name: string, fn: (evt: KeyEvt) => void) => void>(),
        },
      },
    },
    input: {
      pointers: {
        primary: {
          on: vi.fn<(name: string, fn: (evt: PointerEvt) => void) => void>((name, fn) => {
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

function makeGridStub() {
  return {
    getCell: vi.fn<() => Terrain>(() => new FlatGround()),
    setElevation: vi.fn<(col: number, row: number, delta: number) => void>(),
    placeTower: vi.fn<(col: number, row: number, level?: number) => boolean>(() => true),
    placeWall: vi.fn<(col: number, row: number, level: number) => boolean>(() => true),
    clearCell: vi.fn<(col: number, row: number) => void>(),
    isCastle: () => false,
    width: 16,
    height: 16,
    castleCol: 10,
    castleRow: 15,
  };
}

function makeToolbarStub() {
  return {
    setActions: vi.fn<(actions: ActionView[] | null) => void>(),
    setDisabled: vi.fn<(disabled: boolean) => void>(),
    setSandCount: vi.fn<(count: number) => void>(),
    onActionTriggered: null as unknown,
  };
}

function makeHudStub() {
  return {
    showPlanning: vi.fn<(scene: Scene, waveText: string) => void>(),
    hidePlanning: vi.fn<(scene: Scene) => void>(),
    updateSelection: vi.fn<(info: CellInfo | null) => void>(),
    updateSand: vi.fn<(count: number) => void>(),
  };
}

function makeDeleteConfirmationStub(): DeleteConfirmation {
  return {
    open: vi.fn<(label: string) => Promise<boolean>>().mockResolvedValue(false),
    deactivate: vi.fn<() => void>(),
  } as unknown as DeleteConfirmation;
}

function pointerEvt(col: number, row: number): PointerEvt {
  return {
    worldPos: {
      x: GRID_LEFT + col * TILE_SIZE + 1,
      y: GRID_TOP + row * TILE_SIZE + 1,
    },
  };
}

describe('PlanningPhase.refreshSelection()', () => {
  it('pushes the live cell HP to the HUD after erosion mutates the wall', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const hud = makeHudStub();
    const toolbar = makeToolbarStub();

    // Use GRID_HEIGHT as waveReach so no Excalibur Actors are created for the
    // reach-line indicator (the `if (waveReach < GRID_HEIGHT)` branch is skipped).
    const phase = new PlanningPhase(
      grid as never,
      hud,
      Infinity,
      GRID_HEIGHT,
      10,
      1,
      new InventoryModel(),
      toolbar as never,
      () => {},
      makeDeleteConfirmationStub(),
    );
    phase.activate(scene as never);

    // Simulate selecting a wall cell via pointer click.
    const wall = new Wall(1);
    grid.getCell.mockReturnValue(wall);
    scene.pointerHandlers['down'](pointerEvt(2, 2));

    // Record how many times updateSelection was called up to this point.
    const callsBefore = hud.updateSelection.mock.calls.length;

    // Simulate wave erosion: reduce the wall's HP.
    wall.applyHits(30);
    const damagedHp = wall.hp;

    // refreshSelection should re-read the live cell and push the new HP.
    phase.refreshSelection();

    const callsAfter = hud.updateSelection.mock.calls.length;
    expect(callsAfter).toBe(callsBefore + 1);

    const received = hud.updateSelection.mock.calls.at(-1)?.[0] as CellInfo | null;
    expect(received).not.toBeNull();
    const hpStat = (received as CellInfo).stats.find(s => s.label === 'HP');
    expect(hpStat?.value).toBe(String(damagedHp));
  });

  it('passes null to the HUD when no cell is selected', () => {
    const scene = makeSceneStub();
    const grid = makeGridStub();
    const hud = makeHudStub();
    const toolbar = makeToolbarStub();

    const phase = new PlanningPhase(
      grid as never,
      hud,
      Infinity,
      GRID_HEIGHT,
      10,
      1,
      new InventoryModel(),
      toolbar as never,
      () => {},
      makeDeleteConfirmationStub(),
    );
    phase.activate(scene as never);
    // No pointer click — selection is null.

    phase.refreshSelection();

    const received = hud.updateSelection.mock.calls.at(-1)?.[0];
    expect(received).toBeNull();
  });
});
