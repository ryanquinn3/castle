import { Actor, CollisionType, Color, Vector, type Engine } from "excalibur";
import type {
  WaveSegmentEvent,
  WaveSegmentGrid,
  WaveSegmentSpawn,
  WaveState,
} from "./wave-segment-types.ts";
import { beachSpriteSheet } from "../resources.ts";

type WaveSegmentListener = (event: WaveSegmentEvent) => void;

const CRASH_PAUSE_MS = 250;
const FADE_MS = 600;
const MIN_DEPTH = 0.05;

function depthColor(depth: number): Color {
  const t = Math.min(Math.max((depth - 1) / 8, 0), 1);
  const r = Math.round(180 * (1 - t));
  const g = Math.round(220 * (1 - t) + 10);
  const a = 0.35 + t * 0.55;
  return Color.fromRGB(r, g, 255, a);
}

export class WaveSegment extends Actor {
  state: WaveState = "surging";
  currentDepth: number;

  private readonly listeners = new Set<WaveSegmentListener>();
  private readonly spawnY: number;
  private lastEnteredRow = -1;

  constructor(
    private readonly spawn: WaveSegmentSpawn,
    private readonly grid: WaveSegmentGrid,
    private readonly terrainSlope: number,
  ) {
    super({
      pos: new Vector(spawn.x, spawn.y),
      width: Math.max(4, grid.tileSize - 2),
      height: 16 + spawn.initialDepth * 4,
      vel: new Vector(0, spawn.speed),
      color: depthColor(spawn.initialDepth),
      name: "WaveSegment",
      collisionType: CollisionType.Passive,
      z: 7,
    });
    this.currentDepth = spawn.initialDepth;
    this.spawnY = spawn.y;
    this.updateGridVisibility();
    const sprite = beachSpriteSheet.getSprite(0, 2);
    sprite.width = grid.tileSize;
    sprite.height = grid.tileSize;
    this.graphics.use(sprite);
  }

  onWaveEvent(listener: WaveSegmentListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  override onPostUpdate(_engine: Engine, _delta: number): void {
    this.updateGridVisibility();

    if (this.state !== "surging") {
      return;
    }

    this.handleTileEntries();
    if (this.state !== "surging") {
      return;
    }
    this.handleTravelDissipation();
    if (this.state !== "surging") {
      return;
    }
    this.updateVisualState();
  }

  private handleTileEntries(): void {
    const leadingEdgeY = this.leadingEdgeY();
    const enteredRow = Math.floor(
      (leadingEdgeY - this.grid.gridTop) / this.grid.tileSize,
    );
    if (enteredRow < 0 || enteredRow <= this.lastEnteredRow) {
      return;
    }

    for (let row = this.lastEnteredRow + 1; row <= enteredRow; row++) {
      if (row < 0) {
        continue;
      }
      if (row >= this.grid.height) {
        this.triggerRecession();
        return;
      }

      this.enterRow(row);
      this.lastEnteredRow = row;
      if (this.state !== "surging") {
        return;
      }
    }
  }

  private enterRow(row: number): void {
    const col = this.spawn.col;
    this.emitWaveEvent({
      type: "tileEntered",
      col,
      row,
      depth: this.currentDepth,
    });

    if (this.grid.isCastle(col, row)) {
      this.emitWaveEvent({
        type: "castleFlooded",
        col,
        row,
        depth: this.currentDepth,
      });
      this.triggerRecession();
      return;
    }

    const elevation = this.grid.getElevation(col, row);
    if (elevation > 0) {
      if (elevation >= this.currentDepth) {
        this.emitWaveEvent({
          type: "blocked",
          col,
          row,
          depth: this.currentDepth,
        });
        this.currentDepth = 0;
        this.triggerRecession();
        return;
      }
      this.currentDepth -= elevation;
      this.emitWaveEvent({
        type: "overtopped",
        col,
        row,
        depth: this.currentDepth,
      });
    } else if (elevation < 0) {
      const absorbedDepth = Math.min(
        this.currentDepth,
        this.grid.effectiveHoleDepth(col, row),
      );
      if (absorbedDepth > 0) {
        const depthBeforeAbsorption = this.currentDepth;
        this.currentDepth -= absorbedDepth;
        this.emitWaveEvent({
          type: "absorbed",
          col,
          row,
          depth: depthBeforeAbsorption,
          absorbedDepth,
        });
      }
    } else {
      this.currentDepth -= this.terrainSlope;
    }

    if (this.currentDepth <= MIN_DEPTH) {
      this.triggerRecession();
    }
  }

  private handleTravelDissipation(): void {
    const traveled = this.pos.y - this.spawnY;
    if (traveled >= this.spawn.maxTravelDistance) {
      this.triggerRecession();
    }
  }

  private updateVisualState(): void {
    this.color = depthColor(this.currentDepth);
  }

  private updateGridVisibility(): void {
    this.graphics.isVisible = this.topEdgeY() >= this.grid.gridTop;
  }

  private leadingEdgeY(): number {
    return this.pos.y + this.height / 2;
  }

  private topEdgeY(): number {
    return this.pos.y - this.height / 2;
  }

  private triggerRecession(): void {
    if (this.state !== "surging") {
      return;
    }

    this.state = "crashing";
    this.vel = Vector.Zero;
    this.color = Color.White;

    this.actions
      .delay(CRASH_PAUSE_MS)
      .callMethod(() => {
        this.state = "receding";
        this.vel = new Vector(0, this.spawn.recedeSpeed);
      })
      .fade(0, FADE_MS)
      .callMethod(() => {
        this.state = "dead";
        this.emitWaveEvent({
          type: "dissipated",
          col: this.spawn.col,
          row: Math.max(this.lastEnteredRow, 0),
        });
        this.kill();
      });
  }

  private emitWaveEvent(event: WaveSegmentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
