import { Scene, Actor, Color, Rectangle, Text, Font } from 'excalibur';
import { GRID_HEIGHT, GRID_WIDTH, TILE_SIZE, STAGE_WIDTH, STAGE_HEIGHT } from '../config.ts';
import type { GridModel } from '../model/grid-model.ts';

const CANVAS_WIDTH = STAGE_WIDTH;
const CANVAS_HEIGHT = STAGE_HEIGHT;

export function showWaveBanner(scene: Scene, k: number, total: number): Actor {
  const actor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT * 0.45, z: 50 });
  actor.graphics.use(new Text({
    text: `Wave ${k} of ${total}`,
    color: Color.fromRGB(100, 180, 255),
    font: new Font({ size: 18 }),
  }));
  scene.add(actor);
  return actor;
}

export function showTextBanner(scene: Scene, text: string, color: Color): Actor {
  const actor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT * 0.4, z: 50 });
  actor.graphics.use(new Text({ text, color, font: new Font({ size: 18 }) }));
  scene.add(actor);
  return actor;
}

export function showLevelCompleteBanner(scene: Scene, level: number): Actor {
  const actor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, z: 50 });
  actor.graphics.use(new Text({
    text: `Level ${level} complete!`,
    color: Color.White,
    font: new Font({ size: 32 }),
  }));
  scene.add(actor);
  return actor;
}

export interface GameOverCallbacks {
  onRestart: () => void;
}

export function showGameOver(
  scene: Scene,
  scoreValue: number,
  callbacks: GameOverCallbacks,
  scoreLabel = 'Level reached',
): Actor {
  const bgActor = new Actor({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, z: 100 });
  bgActor.graphics.use(new Rectangle({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, color: Color.fromRGB(0, 0, 0, 0.75) }));

  const titleActor = new Actor({ x: 0, y: -40 });
  titleActor.graphics.use(new Text({ text: 'GAME OVER', color: Color.White, font: new Font({ size: 32 }) }));
  bgActor.addChild(titleActor);

  const subtitleActor = new Actor({ x: 0, y: 20 });
  subtitleActor.graphics.use(new Text({ text: `${scoreLabel}: ${scoreValue}`, color: Color.White, font: new Font({ size: 18 }) }));
  bgActor.addChild(subtitleActor);

  const restartActor = new Actor({ x: 0, y: 60 });
  restartActor.graphics.use(new Text({ text: 'Click anywhere to restart', color: Color.fromRGB(180, 180, 180), font: new Font({ size: 9 }) }));
  bgActor.addChild(restartActor);

  bgActor.on('pointerdown', () => {
    scene.remove(bgActor);
    callbacks.onRestart();
  });

  scene.add(bgActor);
  return bgActor;
}

export function showElevationLabels(scene: Scene, grid: GridModel): Actor[] {
  const actors: Actor[] = [];
  for (let row = 0; row < GRID_HEIGHT; row++) {
    for (let col = 0; col < GRID_WIDTH; col++) {
      if (grid.isCastle(col, row)) {
        continue;
      }
      const cell = grid.getCell(col, row);
      if (cell.elevation === 0) {
        continue;
      }
      const fontSize = Math.max(8, Math.floor(TILE_SIZE * 0.45));
      const label = new Actor({ x: cell.pos.x, y: cell.pos.y, z: 20 });
      label.graphics.use(new Text({
        text: String(cell.elevation),
        color: Color.White,
        font: new Font({ size: fontSize }),
      }));
      scene.add(label);
      actors.push(label);
      const puddleDepth = grid.getPuddleDepth(col, row);
      if (cell.elevation < 0 && puddleDepth > 0) {
        const smallFont = Math.max(6, Math.floor(fontSize * 0.7));
        const puddle = new Actor({ x: cell.pos.x, y: cell.pos.y + fontSize * 0.6, z: 20 });
        puddle.graphics.use(new Text({
          text: `(${Math.round(puddleDepth)})`,
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
