import { Scene } from 'excalibur';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import TideHudComponent from '../ui/TideHudComponent.tsx';
import type { Layout } from '../config.ts';
import type { PlanningHud } from './planning-phase.ts';
import type { CellInfo } from '../model/terrain/terrain.ts';

export class TideHud implements PlanningHud {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private wavesCompleted = 0;
  private best = 0;
  private countdown = 0;
  private sandCount = 0;
  private selectedInfo: CellInfo | null = null;
  private layout: Pick<Layout, 'gridLeft' | 'gridPixelWidth' | 'mapTop'> = {
    gridLeft: 0,
    gridPixelWidth: 0,
    mapTop: 0,
  };

  activate(_scene: Scene, layout: Pick<Layout, 'gridLeft' | 'gridPixelWidth' | 'mapTop'>): void {
    this.layout = layout;
    this.container = document.createElement('div');
    document.getElementById('game-ui')!.appendChild(this.container);
    this.root = createRoot(this.container);
    this.render();
  }

  updateWaves(count: number): void {
    this.wavesCompleted = count;
    this.render();
  }

  updateBest(best: number): void {
    this.best = best;
    this.render();
  }

  updateCountdown(seconds: number): void {
    this.countdown = seconds;
    this.render();
  }

  updateSand(count: number): void {
    this.sandCount = count;
    this.render();
  }

  updateTideClock(_wavesCompleted: number): void {
    this.render();
  }

  showPlanning(_scene: Scene, _waveText: string): void {}
  hidePlanning(_scene: Scene): void {}

  updateSelection(info: CellInfo | null): void {
    this.selectedInfo = info;
    this.render();
  }

  deactivate(_scene: Scene): void {
    this.root?.unmount();
    this.root = null;
    this.container?.remove();
    this.container = null;
  }

  private render(): void {
    this.root?.render(
      createElement(TideHudComponent, {
        wavesCompleted: this.wavesCompleted,
        best: this.best,
        countdown: this.countdown,
        sandCount: this.sandCount,
        selectedInfo: this.selectedInfo,
        layout: this.layout,
      })
    );
  }
}
