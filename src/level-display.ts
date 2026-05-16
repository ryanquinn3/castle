import { Scene, Actor, Color, Text, Font, Rectangle } from 'excalibur';
import { GRID_LEFT, GRID_PIXEL_WIDTH, GRID_TOP } from './config';

export class LevelDisplay {
  private actor: Actor | null = null;
  private labelActor: Actor | null = null;
  private labelText: Text | null = null;

  activate(scene: Scene, level: number): void {
    // Background panel, top-right, 8px from right edge
    const bgActor = new Actor({ x: GRID_LEFT + GRID_PIXEL_WIDTH - 70, y: GRID_TOP - 40, z: 10 });
    bgActor.graphics.use(new Rectangle({
      width: 140,
      height: 28,
      color: Color.fromRGB(0, 0, 0, 0.55),
    }));
    scene.add(bgActor);
    this.actor = bgActor;

    this.labelText = new Text({
      text: `Level: ${level}`,
      color: Color.White,
      font: new Font({ size: 16 }),
    });
    this.labelActor = new Actor({ x: GRID_LEFT + GRID_PIXEL_WIDTH - 70, y: GRID_TOP - 40, z: 11 });
    this.labelActor.graphics.use(this.labelText);
    scene.add(this.labelActor);
  }

  update(level: number): void {
    if (this.labelText && this.labelActor) {
      this.labelText.text = `Level: ${level}`;
      this.labelActor.graphics.use(this.labelText);
    }
  }

  deactivate(scene: Scene): void {
    if (this.actor) { scene.remove(this.actor); this.actor = null; }
    if (this.labelActor) { scene.remove(this.labelActor); this.labelActor = null; }
  }
}
