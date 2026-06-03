import type { Scene } from 'excalibur';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import GameplayControlsComponent from '../ui/GameplayControlsComponent.tsx';

interface GameplayControlsOptions {
  onExitConfirmed: () => void;
  onExitDialogOpenChange?: (open: boolean) => void;
}

export class GameplayControls {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private isExitDialogOpen = false;
  private onExitConfirmed: (() => void) | null = null;
  private onExitDialogOpenChange: ((open: boolean) => void) | null = null;

  activate(_scene: Scene, options: GameplayControlsOptions): void {
    this.onExitConfirmed = options.onExitConfirmed;
    this.onExitDialogOpenChange = options.onExitDialogOpenChange ?? null;
    this.isExitDialogOpen = false;
    this.container = document.createElement('div');
    document.getElementById('game-ui')!.appendChild(this.container);
    this.root = createRoot(this.container);
    this.render();
  }

  openExitDialog(): void {
    this.setExitDialogOpen(true);
  }

  closeExitDialog(): void {
    this.setExitDialogOpen(false);
  }

  deactivate(_scene: Scene): void {
    if (this.isExitDialogOpen) {
      this.onExitDialogOpenChange?.(false);
    }
    this.root?.unmount();
    this.root = null;
    this.container?.remove();
    this.container = null;
    this.onExitConfirmed = null;
    this.onExitDialogOpenChange = null;
    this.isExitDialogOpen = false;
  }

  private setExitDialogOpen(open: boolean): void {
    if (this.isExitDialogOpen === open) {
      return;
    }
    this.isExitDialogOpen = open;
    this.onExitDialogOpenChange?.(open);
    this.render();
  }

  private render(): void {
    this.root?.render(
      createElement(GameplayControlsComponent, {
        isExitDialogOpen: this.isExitDialogOpen,
        onExitRequested: () => this.openExitDialog(),
        onExitCancelled: () => this.closeExitDialog(),
        onExitConfirmed: this.onExitConfirmed!,
      })
    );
  }
}
