import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal.tsx';

export class DeleteConfirmation {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;

  open(terrainLabel: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.mount(terrainLabel, resolve);
    });
  }

  deactivate(): void {
    this.unmount();
  }

  private mount(terrainLabel: string, resolve: (value: boolean) => void): void {
    this.unmount();
    this.container = document.createElement('div');
    document.getElementById('game-ui')!.appendChild(this.container);
    this.root = createRoot(this.container);
    this.root.render(
      createElement(ConfirmDeleteModal, {
        terrainType: terrainLabel,
        onConfirm: () => {
          this.unmount();
          resolve(true);
        },
        onCancel: () => {
          this.unmount();
          resolve(false);
        },
      })
    );
  }

  private unmount(): void {
    this.root?.unmount();
    this.root = null;
    this.container?.remove();
    this.container = null;
  }
}
