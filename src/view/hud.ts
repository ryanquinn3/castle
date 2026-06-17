import { Scene } from 'excalibur';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import HudComponent from '../ui/HudComponent.tsx';
import { GRID_LEFT, GRID_PIXEL_WIDTH, MAP_TOP } from '../config.ts';
import { observeStageScale } from './ui-stage.ts';
import type { CellInfo } from '../model/terrain/terrain.ts';

export class Hud {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private level = 1;
  private sandCount = 0;
  private planning: { selectedInfo: CellInfo | null; waveText: string } | null = null;
  private scale = 1;
  private stopObserver: (() => void) | null = null;

  activate(_scene: Scene, level: number): void {
    this.level = level;
    this.planning = null;
    this.container = document.createElement('div');
    document.getElementById('game-ui')!.appendChild(this.container);
    this.root = createRoot(this.container);

    const canvas = document.querySelector('canvas');
    if (canvas) {
      this.stopObserver = observeStageScale(canvas as HTMLCanvasElement, (s) => {
        this.scale = s;
        this.render();
      });
    } else {
      this.render();
    }
  }

  updateLevel(level: number): void {
    this.level = level;
    this.render();
  }

  updateSand(count: number): void {
    this.sandCount = count;
    this.render();
  }

  showPlanning(_scene: Scene, waveText: string): void {
    this.planning = { selectedInfo: null, waveText };
    this.render();
  }

  hidePlanning(_scene: Scene): void {
    this.planning = null;
    this.render();
  }

  updateSelection(info: CellInfo | null): void {
    if (this.planning) {
      this.planning = { ...this.planning, selectedInfo: info };
      this.render();
    }
  }

  deactivate(_scene: Scene): void {
    this.stopObserver?.();
    this.stopObserver = null;
    this.root?.unmount();
    this.root = null;
    this.container?.remove();
    this.container = null;
  }

  private render(): void {
    this.root?.render(
      createElement(HudComponent, {
        level: this.level,
        sandCount: this.sandCount,
        planning: this.planning ?? null,
        scale: this.scale,
        gridLeft: GRID_LEFT,
        gridPixelWidth: GRID_PIXEL_WIDTH,
        mapTop: MAP_TOP,
      })
    );
  }
}
