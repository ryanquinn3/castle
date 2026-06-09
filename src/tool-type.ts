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
export const WALL_TOOL_FOR_LEVEL: Record<1 | 2 | 3 | 4, ToolType> = {
  1: ToolType.Wall1,
  2: ToolType.Wall2,
  3: ToolType.Wall3,
  4: ToolType.Wall4,
};
