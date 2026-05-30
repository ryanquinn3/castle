import { Scene } from 'excalibur';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import HudComponent from '../ui/HudComponent.tsx';
import type { Layout } from '../config.ts';

export class Hud {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private level = 1;
  private sandCount = 0;
  private planning: { stateText: string; waveText: string } | null = null;
  private layout: Pick<Layout, 'gridLeft' | 'gridPixelWidth' | 'mapTop'> = {
    gridLeft: 0,
    gridPixelWidth: 0,
    mapTop: 0,
  };

  activate(_scene: Scene, level: number, layout: Pick<Layout, 'gridLeft' | 'gridPixelWidth' | 'mapTop'>): void {
    this.level = level;
    this.planning = null;
    this.layout = layout;
    this.container = document.createElement('div');
    document.getElementById('game-ui')!.appendChild(this.container);
    this.root = createRoot(this.container);
    this.render();
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
    this.planning = { stateText: '', waveText };
    this.render();
  }

  hidePlanning(_scene: Scene): void {
    this.planning = null;
    this.render();
  }

  updateState(text: string): void {
    if (this.planning) {
      this.planning = { ...this.planning, stateText: text };
      this.render();
    }
  }

  deactivate(_scene: Scene): void {
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
        planning: this.planning,
        layout: this.layout,
      })
    );
  }
}
