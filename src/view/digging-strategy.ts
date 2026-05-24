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
  getStateText(): string;
  lock?(): void;
  unlock?(): void;
}
