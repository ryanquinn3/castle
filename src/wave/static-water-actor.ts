import { Actor, CollisionType, SpriteSheet, Vector, type ImageSource } from 'excalibur';
import type { WaveSegment } from './wave-segment.ts';

const BEACH_TILE_SIZE = 16;
const BEACH_TILESET_COLS = 12;
const BEACH_TILESET_ROWS = 10;
const STATIC_WATER_Z = 6;
const FADE_MS = 120;
const WATER_SPRITES = [
  { col: 5, row: 0 },
  { col: 6, row: 0 },
  { col: 5, row: 1 },
  { col: 6, row: 1 },
] as const;

export interface StaticWaterActorConfig {
  col: number;
  row: number;
  x: number;
  y: number;
  tileSize: number;
  depth: number;
  owner: WaveSegment;
  image: ImageSource;
}

interface CollisionStartLike {
  other: { owner?: unknown };
}

const waterSpriteSheets = new WeakMap<ImageSource, SpriteSheet>();

function getWaterSpriteSheet(image: ImageSource): SpriteSheet {
  const cached = waterSpriteSheets.get(image);
  if (cached) {
    return cached;
  }

  const spriteSheet = SpriteSheet.fromImageSource({
    image,
    grid: {
      rows: BEACH_TILESET_ROWS,
      columns: BEACH_TILESET_COLS,
      spriteWidth: BEACH_TILE_SIZE,
      spriteHeight: BEACH_TILE_SIZE,
    },
  });
  waterSpriteSheets.set(image, spriteSheet);
  return spriteSheet;
}

function waterSpriteFor(col: number, row: number): (typeof WATER_SPRITES)[number] {
  return WATER_SPRITES[Math.abs(col * 31 + row * 17) % WATER_SPRITES.length];
}

export class StaticWaterActor extends Actor {
  readonly col: number;
  readonly row: number;
  readonly depth: number;

  private readonly ownerSegment: WaveSegment;
  private removing = false;
  private killed = false;

  constructor(config: StaticWaterActorConfig) {
    super({
      pos: new Vector(config.x, config.y),
      width: Math.max(4, config.tileSize - 1),
      height: Math.max(4, config.tileSize - 1),
      collisionType: CollisionType.Passive,
      z: STATIC_WATER_Z,
      name: 'StaticWater',
    });

    this.col = config.col;
    this.row = config.row;
    this.depth = config.depth;
    this.ownerSegment = config.owner;

    const sprite = waterSpriteFor(config.col, config.row);
    const graphic = getWaterSpriteSheet(config.image).getSprite(sprite.col, sprite.row);
    if (graphic) {
      this.graphics.use(graphic);
    }

    this.on('collisionstart', event => this.handleCollision(event as CollisionStartLike));
    this.on('precollision', event => this.handleCollision(event as CollisionStartLike));
  }

  cleanup(): void {
    this.removing = true;
    this.killOnce();
  }

  private handleCollision(event: CollisionStartLike): void {
    if (event.other.owner !== this.ownerSegment || this.ownerSegment.state !== 'receding') {
      return;
    }

    this.removeByRecede();
  }

  private removeByRecede(): void {
    if (this.removing) {
      return;
    }

    this.removing = true;
    this.actions.fade(0, FADE_MS).callMethod(() => this.killOnce());
  }

  private killOnce(): void {
    if (this.killed) {
      return;
    }

    this.killed = true;
    this.kill();
  }
}
