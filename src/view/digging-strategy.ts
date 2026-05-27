import { Scene } from 'excalibur';
import { GridView } from './grid-view.ts';
import type { ToolType } from './toolbar.ts';
import type { InventoryModel } from '../model/inventory-model.ts';
import type { Toolbar } from './toolbar.ts';

export interface ScoopResult {
  tool: ToolType;
  cell: { col: number; row: number };
  delta: number;
}

export interface DiggingStrategyOptions {
  delta: number;
  inventory: InventoryModel;
  toolbar: Toolbar;
}

export interface DiggingStrategy {
  onScoopComplete: ((result: ScoopResult) => void) | null;
  activate(scene: Scene, grid: GridView, opts: DiggingStrategyOptions): void;
  deactivate(scene: Scene): void;
  getStateText(): string;
  updateCursor?(): void;
  lock?(): void;
  unlock?(): void;
}
