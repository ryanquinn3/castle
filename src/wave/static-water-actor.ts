import {
  Actor,
  CollisionType,
  Vector,
  type Engine,
  type ImageSource,
  type Sprite,
} from "excalibur";
import type { WaveSegment } from "./wave-segment.ts";
import { beachSpriteSheet } from "../resources.ts";

const STATIC_WATER_Z = 6;
const FADE_MS = 50;
const WATER_SPRITES = [
  { col: 4, row: 0 },
  { col: 5, row: 0 },
  { col: 4, row: 1 },
  { col: 5, row: 1 },
] as const;

export interface StaticWaterActorConfig {
  col: number;
  row: number;
  x: number;
  y: number;
  tileSize: number;
  depth: number;
  alpha: number;
  owner: WaveSegment;
  image: ImageSource;
}

interface CollisionStartLike {
  other: { owner?: unknown };
}

function waterSpriteFor(
  col: number,
  row: number,
): (typeof WATER_SPRITES)[number] {
  return WATER_SPRITES[Math.abs(col * 31 + row * 17) % WATER_SPRITES.length];
}

export class StaticWaterActor extends Actor {
  readonly col: number;
  readonly row: number;
  readonly depth: number;

  private readonly ownerSegment: WaveSegment;
  private readonly sprite: Sprite;
  private removing = false;
  private killed = false;
  private fadeKillRemainingMs: number | null = null;

  constructor(config: StaticWaterActorConfig) {
    super({
      pos: new Vector(config.x, config.y),
      width: config.tileSize,
      height: config.tileSize,
      collisionType: CollisionType.Passive,
      z: STATIC_WATER_Z,
      name: "StaticWater",
    });

    this.col = config.col;
    this.row = config.row;
    this.depth = config.depth;
    this.ownerSegment = config.owner;

    const { col, row } = waterSpriteFor(config.col, config.row);
    this.sprite = beachSpriteSheet.getSprite(col, row).clone();
    this.sprite.width = config.tileSize;
    this.sprite.height = config.tileSize;
    this.sprite.opacity = config.alpha;
    this.graphics.use(this.sprite);

    this.on("collisionstart", (event) =>
      this.handleCollision(event as CollisionStartLike),
    );
    this.on("precollision", (event) =>
      this.handleCollision(event as CollisionStartLike),
    );
  }

  cleanup(): void {
    this.removing = true;
    this.fadeKillRemainingMs = null;
    this.killOnce();
  }

  override onPostUpdate(_engine: Engine, delta: number): void {
    if (this.fadeKillRemainingMs === null) {
      return;
    }

    this.fadeKillRemainingMs -= delta;
    if (this.fadeKillRemainingMs <= 0) {
      this.fadeKillRemainingMs = null;
      this.killOnce();
    }
  }

  private handleCollision(event: CollisionStartLike): void {
    if (
      event.other.owner !== this.ownerSegment ||
      this.ownerSegment.state !== "receding" ||
      !this.ownerTopEdgeReachedTile()
    ) {
      return;
    }

    this.removeByRecede();
  }

  private removeByRecede(): void {
    if (this.removing) {
      return;
    }

    this.removing = true;
    this.fadeKillRemainingMs = FADE_MS;
    this.actions.scaleBy(
      new Vector(1, 0),
      this.sprite.height / (FADE_MS * 1000),
    );
  }

  private ownerTopEdgeReachedTile(): boolean {
    return this.ownerSegment.pos.y - this.ownerSegment.height / 2 <= this.pos.y;
  }

  private killOnce(): void {
    if (this.killed) {
      return;
    }

    this.killed = true;
    this.kill();
  }
}
