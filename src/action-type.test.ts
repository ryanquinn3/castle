import { describe, expect, test } from 'vitest';
import { ActionType, ACTION_META, applicableActions, actionCost } from './action-type.ts';
import { FlatGround } from './model/terrain/flat-ground.ts';
import { Hole } from './model/terrain/hole.ts';
import { Wall } from './model/terrain/wall.ts';
import { Tower } from './model/terrain/tower.ts';
import { WALL_LEVEL_COST, TOWER_COST, MAX_WALL_LEVEL } from './config.ts';

describe('ACTION_META', () => {
  test('all action types have meta entries', () => {
    for (const action of Object.values(ActionType)) {
      expect(ACTION_META[action]).toBeDefined();
    }
  });

  test('hotkeys are correct', () => {
    expect(ACTION_META[ActionType.Dig].hotkey).toBe('S');
    expect(ACTION_META[ActionType.BuildWall].hotkey).toBe('W');
    expect(ACTION_META[ActionType.BuildTower].hotkey).toBe('T');
    expect(ACTION_META[ActionType.Upgrade].hotkey).toBe('U');
    expect(ACTION_META[ActionType.Destroy].hotkey).toBe('X');
  });

  test('labels are correct', () => {
    expect(ACTION_META[ActionType.Dig].label).toBe('Dig');
    expect(ACTION_META[ActionType.BuildWall].label).toBe('Build Wall');
    expect(ACTION_META[ActionType.BuildTower].label).toBe('Build Tower');
    expect(ACTION_META[ActionType.Upgrade].label).toBe('Upgrade');
    expect(ACTION_META[ActionType.Destroy].label).toBe('Destroy');
  });
});

describe('applicableActions', () => {
  test('FlatGround returns [Dig, BuildWall, BuildTower]', () => {
    expect(applicableActions(new FlatGround())).toEqual([
      ActionType.Dig,
      ActionType.BuildWall,
      ActionType.BuildTower,
    ]);
  });

  test('Hole returns [Dig]', () => {
    expect(applicableActions(new Hole(2))).toEqual([ActionType.Dig]);
  });

  test('Wall below MAX_WALL_LEVEL returns [Upgrade, Destroy]', () => {
    for (let level = 1; level < MAX_WALL_LEVEL; level++) {
      expect(applicableActions(new Wall(level))).toEqual([
        ActionType.Upgrade,
        ActionType.Destroy,
      ]);
    }
  });

  test('Wall at MAX_WALL_LEVEL returns [Destroy] only', () => {
    expect(applicableActions(new Wall(MAX_WALL_LEVEL))).toEqual([
      ActionType.Destroy,
    ]);
  });

  test('Tower returns [Destroy]', () => {
    expect(applicableActions(new Tower(15))).toEqual([ActionType.Destroy]);
  });

  test('applicableActions is independent of sand (no inventory input)', () => {
    // Calling twice with same cell gives same result — no external state involved.
    const cell = new FlatGround();
    expect(applicableActions(cell)).toEqual(applicableActions(cell));
  });
});

describe('actionCost', () => {
  test('Dig costs 0', () => {
    expect(actionCost({ action: ActionType.Dig, cell: new FlatGround() })).toBe(0);
  });

  test('Destroy costs 0', () => {
    expect(actionCost({ action: ActionType.Destroy, cell: new Wall(2) })).toBe(0);
    expect(actionCost({ action: ActionType.Destroy, cell: new Tower(15) })).toBe(0);
  });

  test('BuildWall costs WALL_LEVEL_COST[0]', () => {
    expect(actionCost({ action: ActionType.BuildWall, cell: new FlatGround() })).toBe(WALL_LEVEL_COST[0]);
  });

  test('BuildTower costs TOWER_COST', () => {
    expect(actionCost({ action: ActionType.BuildTower, cell: new FlatGround() })).toBe(TOWER_COST);
  });

  test('Upgrade costs next wall level cost (WALL_LEVEL_COST[cell.level])', () => {
    // Wall level 1 -> upgrading to L2 costs WALL_LEVEL_COST[1]
    expect(actionCost({ action: ActionType.Upgrade, cell: new Wall(1) })).toBe(WALL_LEVEL_COST[1]);
    // Wall level 2 -> upgrading to L3 costs WALL_LEVEL_COST[2]
    expect(actionCost({ action: ActionType.Upgrade, cell: new Wall(2) })).toBe(WALL_LEVEL_COST[2]);
    // Wall level 3 -> upgrading to L4 costs WALL_LEVEL_COST[3]
    expect(actionCost({ action: ActionType.Upgrade, cell: new Wall(3) })).toBe(WALL_LEVEL_COST[3]);
  });
});
