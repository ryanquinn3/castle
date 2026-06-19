import { WALL_LEVEL_COST, TOWER_COST, MAX_WALL_LEVEL } from './config.ts';
import { FlatGround } from './model/terrain/flat-ground.ts';
import { Hole } from './model/terrain/hole.ts';
import { Wall } from './model/terrain/wall.ts';
import { Tower } from './model/terrain/tower.ts';
import type { Terrain } from './model/terrain/terrain.ts';

export enum ActionType {
  Dig = 'Dig',
  BuildWall = 'BuildWall',
  BuildTower = 'BuildTower',
  Upgrade = 'Upgrade',
  Destroy = 'Destroy',
}

export interface ActionMeta {
  hotkey: string;
  label: string;
}

export const ACTION_META: Record<ActionType, ActionMeta> = {
  [ActionType.Dig]: {
    hotkey: 'S',
    label: 'Dig',
  },
  [ActionType.BuildWall]: {
    hotkey: 'W',
    label: 'Build Wall',
  },
  [ActionType.BuildTower]: {
    hotkey: 'T',
    label: 'Build Tower',
  },
  [ActionType.Upgrade]: {
    hotkey: 'U',
    label: 'Upgrade',
  },
  [ActionType.Destroy]: {
    hotkey: 'X',
    label: 'Destroy',
  },
};

/**
 * Returns the ordered context-valid actions for a cell, ignoring sand inventory.
 */
export function applicableActions(cell: Terrain): ActionType[] {
  if (cell instanceof FlatGround) {
    return [ActionType.Dig, ActionType.BuildWall, ActionType.BuildTower];
  }
  if (cell instanceof Hole) {
    return [ActionType.Dig];
  }
  if (cell instanceof Wall) {
    if (cell.level < MAX_WALL_LEVEL) {
      return [ActionType.Upgrade, ActionType.Destroy];
    }
    return [ActionType.Destroy];
  }
  if (cell instanceof Tower) {
    return [ActionType.Destroy];
  }
  return [];
}

export interface ActionCostInput {
  action: ActionType;
  cell: Terrain;
}

/**
 * Returns the sand cost for an action on a cell.
 * Dig and Destroy are free. BuildWall costs the L1 cost. BuildTower costs TOWER_COST.
 * Upgrade costs the next wall level's cost (cell.level is current level, so next = cell.level).
 */
export function actionCost({ action, cell }: ActionCostInput): number {
  switch (action) {
    case ActionType.Dig:
      return 0;
    case ActionType.Destroy:
      return 0;
    case ActionType.BuildWall:
      return WALL_LEVEL_COST[0];
    case ActionType.BuildTower:
      return TOWER_COST;
    case ActionType.Upgrade: {
      const wall = cell as Wall;
      return WALL_LEVEL_COST[wall.level];
    }
  }
}
