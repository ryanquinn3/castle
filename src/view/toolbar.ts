import { Scene } from 'excalibur';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ActionType } from '../action-type.ts';
import ToolbarComponent from '../ui/ToolbarComponent.tsx';

export interface ActionView {
  type: ActionType;
  hotkey: string;
  label: string;
  sandEffect?: { amount: number; variant: 'earn' | 'spend' };
  disabled: boolean;
}

export class Toolbar {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private _disabled = true;
  private _actions: ActionView[] | null = null;

  onActionTriggered: ((action: ActionType) => void) | null = null;

  get disabled(): boolean {
    return this._disabled;
  }

  activate(_scene: Scene): void {
    this.container = document.createElement('div');
    document.getElementById('game-ui')!.appendChild(this.container);
    this.root = createRoot(this.container);
    this.render();
    this.setDisabled(true);
  }

  setDisabled(disabled: boolean): void {
    this._disabled = disabled;
    this.render();
  }

  setSandCount(_count: number): void {
    // Sand affordability is reflected per-action in ActionView.disabled; no re-render needed here.
  }

  setActions(actions: ActionView[] | null): void {
    this._actions = actions;
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
      createElement(ToolbarComponent, {
        actions: this._actions,
        disabled: this._disabled,
        onActionTriggered: (action: ActionType) => this.onActionTriggered?.(action),
      })
    );
  }
}
