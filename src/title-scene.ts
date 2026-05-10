import { Actor, Color, Engine, FadeInOut, Font, Scene, Text } from 'excalibur';
import type { SceneActivationContext } from 'excalibur';

export class TitleScene extends Scene {
  private startHandler: (() => void) | null = null;

  override onInitialize(_engine: Engine): void {
    const titleActor = new Actor({ x: 400, y: 220 });
    titleActor.graphics.use(new Text({
      text: 'Castle',
      color: Color.White,
      font: new Font({ size: 64 }),
    }));
    this.add(titleActor);

    const subtitleActor = new Actor({ x: 400, y: 310 });
    subtitleActor.graphics.use(new Text({
      text: 'Dig moats and build walls to protect your castle from the rising tide.',
      color: Color.fromRGB(200, 200, 200),
      font: new Font({ size: 16 }),
    }));
    this.add(subtitleActor);

    const promptActor = new Actor({ x: 400, y: 390 });
    promptActor.graphics.use(new Text({
      text: 'Click to start',
      color: Color.fromRGB(160, 200, 160),
      font: new Font({ size: 20 }),
    }));
    this.add(promptActor);
  }

  override onActivate(ctx: SceneActivationContext): void {
    this.startHandler = () => {
      void ctx.engine.goToScene('game', {
        destinationIn: new FadeInOut({ duration: 500, direction: 'in', color: Color.Black }),
        sourceOut: new FadeInOut({ duration: 500, direction: 'out', color: Color.Black }),
      });
    };
    ctx.engine.input.pointers.primary.on('down', this.startHandler);
  }

  override onDeactivate(ctx: SceneActivationContext): void {
    if (this.startHandler) {
      ctx.engine.input.pointers.primary.off('down', this.startHandler);
      this.startHandler = null;
    }
  }
}
