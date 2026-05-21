import { Scene, Actor, Color, Rectangle, Text, Font } from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_HEIGHT, GRID_WIDTH, TILE_SIZE } from '../config';
import type { GridView } from './grid-view';

export function showWaveBanner(scene: Scene, k: number, total: number): Actor {
  const actor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT * 0.45, z: 50 });
  actor.graphics.use(new Text({
    text: `Wave ${k} of ${total}`,
    color: Color.fromRGB(100, 180, 255),
    font: new Font({ size: 28 }),
  }));
  scene.add(actor);
  return actor;
}

export function showTextBanner(scene: Scene, text: string, color: Color): Actor {
  const actor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT * 0.4, z: 50 });
  actor.graphics.use(new Text({ text, color, font: new Font({ size: 28 }) }));
  scene.add(actor);
  return actor;
}

export function showLevelComplete(scene: Scene, level: number): Promise<void> {
  return new Promise(resolve => {
    const actor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, z: 50 });
    actor.graphics.use(new Text({
      text: `Level ${level} complete!`,
      color: Color.White,
      font: new Font({ size: 32 }),
    }));
    scene.add(actor);
    setTimeout(() => {
      scene.remove(actor);
      resolve();
    }, 1500);
  });
}

export interface GameOverCallbacks {
  onRestart: () => void;
}

export function showGameOver(
  scene: Scene,
  scoreValue: number,
  callbacks: GameOverCallbacks,
  scoreLabel = 'Level reached',
): void {
  const bgActor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, z: 100 });
  bgActor.graphics.use(new Rectangle({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, color: Color.fromRGB(0, 0, 0, 0.75) }));

  const titleActor = new Actor({ x: 0, y: -40 });
  titleActor.graphics.use(new Text({ text: 'GAME OVER', color: Color.White, font: new Font({ size: 48 }) }));
  bgActor.addChild(titleActor);

  const subtitleActor = new Actor({ x: 0, y: 20 });
  subtitleActor.graphics.use(new Text({ text: `${scoreLabel}: ${scoreValue}`, color: Color.White, font: new Font({ size: 24 }) }));
  bgActor.addChild(subtitleActor);

  const restartActor = new Actor({ x: 0, y: 60 });
  restartActor.graphics.use(new Text({ text: 'Click anywhere to restart', color: Color.fromRGB(180, 180, 180), font: new Font({ size: 18 }) }));
  bgActor.addChild(restartActor);

  bgActor.on('pointerdown', () => {
    scene.remove(bgActor);
    callbacks.onRestart();
  });

  scene.add(bgActor);
}

export function showElevationLabels(scene: Scene, grid: GridView): Actor[] {
  const actors: Actor[] = [];
  for (let row = 0; row < GRID_HEIGHT; row++) {
    for (let col = 0; col < GRID_WIDTH; col++) {
      const tile = grid.getTile(col, row);
      if (!tile || tile.isCastle || tile.elevation === 0) {
        continue;
      }
      const fontSize = Math.max(8, Math.floor(TILE_SIZE * 0.45));
      const label = new Actor({ x: tile.pos.x, y: tile.pos.y, z: 20 });
      label.graphics.use(new Text({
        text: String(tile.elevation),
        color: Color.White,
        font: new Font({ size: fontSize }),
      }));
      scene.add(label);
      actors.push(label);
      if (tile.elevation < 0 && tile.puddleDepth > 0) {
        const smallFont = Math.max(6, Math.floor(fontSize * 0.7));
        const puddle = new Actor({ x: tile.pos.x, y: tile.pos.y + fontSize * 0.6, z: 20 });
        puddle.graphics.use(new Text({
          text: `(${Math.round(tile.puddleDepth)})`,
          color: Color.fromHex('#87CEFA'),
          font: new Font({ size: smallFont }),
        }));
        scene.add(puddle);
        actors.push(puddle);
      }
    }
  }
  return actors;
}

export function hideElevationLabels(scene: Scene, actors: Actor[]): void {
  for (const actor of actors) {
    scene.remove(actor);
  }
}
