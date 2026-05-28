import { Color, FadeInOut, Scene } from 'excalibur';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import TitleMenuComponent from './ui/TitleMenuComponent.tsx';

export class TitleScene extends Scene {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;

  override onActivate(): void {
    this.container = document.createElement('div');
    document.getElementById('game-ui')!.appendChild(this.container);
    this.root = createRoot(this.container);

    const fadeTransitions = {
      destinationIn: new FadeInOut({
        duration: 500,
        direction: 'in' as const,
        color: Color.Black,
      }),
      sourceOut: new FadeInOut({
        duration: 500,
        direction: 'out' as const,
        color: Color.Black,
      }),
    };

    this.root.render(
      createElement(TitleMenuComponent, {
        onSelectTide: () => {
          void this.engine.goToScene('tide', { ...fadeTransitions });
        },
        onSelectClassic: () => {
          void this.engine.goToScene('game', { ...fadeTransitions });
        },
      })
    );
  }

  override onDeactivate(): void {
    this.root?.unmount();
    this.root = null;
    this.container?.remove();
    this.container = null;
  }
}
