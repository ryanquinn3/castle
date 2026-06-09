import { Actor, CollisionType, Vector, type Engine, type Sprite } from "excalibur";
import type {
  WaveSegmentEvent,
  WaveSegmentGrid,
  WaveSegmentSpawn,
  WaveState,
} from "./wave-segment-types.ts";
import { beachSpriteSheet } from "../resources.ts";
import { progressionAlpha } from "./water-alpha.ts";

type WaveSegmentListener = (event: WaveSegmentEvent) => void;

interface PlannedWaveCell {
  row: number;
  depth: number;
  alpha: number;
}

const CRASH_PAUSE_MS = 250;
const MIN_DEPTH = 0.05;
const MIN_SPEED_FRACTION = 0.35;

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function easedSpeed(maxSpeed: number, progress: number): number {
  const clampedProgress = clamp01(progress);
  const slowdown = clampedProgress * clampedProgress;
  return maxSpeed * (1 - (1 - MIN_SPEED_FRACTION) * slowdown);
}

export class WaveSegment extends Actor {
  state: WaveState = "surging";
  currentDepth: number;
  currentAlpha: number;

  private readonly listeners = new Set<WaveSegmentListener>();
  private readonly spawnY: number;
  private readonly sprite: Sprite;
  private readonly plannedCells: PlannedWaveCell[];
  private crashElapsedMs = 0;
  private lastEnteredRow = -1;
  private recedeStartDistance = 0;

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
      name: "WaveSegment",
      collisionType: CollisionType.Passive,
      z: 7,
    });
    this.currentDepth = spawn.initialDepth;
    this.body.mass = this.width * this.height * this.currentDepth;
    this.plannedCells = this.planWaveCells();
    this.currentAlpha = this.plannedCells[0]?.alpha ?? progressionAlpha(0, 1);
    this.spawnY = spawn.y;
    this.updateGridVisibility();
    this.sprite = beachSpriteSheet.getSprite(0, 2).clone();
    this.sprite.width = grid.tileSize;
    this.sprite.height = grid.tileSize;
    this.graphics.use(this.sprite);
    this.updateVisualState();
  }

  onWaveEvent(listener: WaveSegmentListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private getTopWaterRowY(): number {
    return this.grid.gridTop - this.grid.tileSize;
  }

  override onPreUpdate(_engine: Engine, _delta: number): void {
    this.body.mass = this.width * this.height * this.currentDepth;
  }

  override onPostUpdate(_engine: Engine, _delta: number): void {
    this.updateGridVisibility();

    if (
      this.state === "receding" &&
      this.leadingEdgeY() <= this.getTopWaterRowY()
    ) {
      this.finishRecession();
      return;
    }

    if (this.state === "crashing") {
      this.crashElapsedMs += _delta;
      if (this.crashElapsedMs >= CRASH_PAUSE_MS) {
        this.state = "receding";
        this.updateRecedeVelocity();
      }
      return;
    }

    if (this.state !== "surging") {
      if (this.state === "receding") {
        this.updateRecedeVelocity();
      }
      return;
    }

    this.updateSurgeVelocity();

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
    const cell = this.plannedCells[row];
    if (!cell) {
      this.triggerRecession();
      return;
    }

    const col = this.spawn.col;
    this.currentDepth = cell.depth;
    this.currentAlpha = cell.alpha;
    this.updateVisualState();

    if (row - 1 >= 0) {
      const previousCell = this.plannedCells[row - 1];
      if (previousCell) {
        this.emitWaveEvent({
          type: "tileCovered",
          col,
          row: row - 1,
          depth: previousCell.depth,
          alpha: previousCell.alpha,
        });
      }
    }
    this.emitWaveEvent({
      type: "tileEntered",
      col,
      row,
      depth: this.currentDepth,
      alpha: this.currentAlpha,
    });

    if (this.grid.isCastle(col, row)) {
      this.emitWaveEvent({
        type: "castleFlooded",
        col,
        row,
        depth: this.currentDepth,
        alpha: this.currentAlpha,
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
          alpha: this.currentAlpha,
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
        alpha: this.currentAlpha,
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
          alpha: this.currentAlpha,
        });
      }
    } else {
      this.currentDepth -= this.terrainSlope;
    }

    const nextCell = this.plannedCells[row + 1];
    if (nextCell) {
      this.currentDepth = nextCell.depth;
    }

    if (!nextCell || this.currentDepth <= MIN_DEPTH) {
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
    this.sprite.opacity = this.currentAlpha;
  }

  private planWaveCells(): PlannedWaveCell[] {
    const maxRow = Math.min(this.maxReachableRowByTravel(), this.grid.height - 1);
    if (maxRow < 0) {
      return [];
    }

    const cells: Array<{ row: number; depth: number }> = [];
    let depth = this.spawn.initialDepth;

    for (let row = 0; row <= maxRow && row < this.grid.height && depth > MIN_DEPTH; row++) {
      cells.push({ row, depth });
      if (this.grid.isCastle(this.spawn.col, row)) {
        break;
      }

      const elevation = this.grid.getElevation(this.spawn.col, row);
      if (elevation > 0) {
        if (elevation >= depth) {
          break;
        }
        depth -= elevation;
      } else if (elevation < 0) {
        depth -= Math.min(depth, this.grid.effectiveHoleDepth(this.spawn.col, row));
      } else {
        depth -= this.terrainSlope;
      }
    }

    return cells.map((cell, index) => ({
      ...cell,
      alpha: progressionAlpha(index, cells.length),
    }));
  }

  private maxReachableRowByTravel(): number {
    const maxLeadY = this.spawn.y + this.spawn.maxTravelDistance + this.height / 2;
    return Math.floor((maxLeadY - this.grid.gridTop) / this.grid.tileSize);
  }

  private updateSurgeVelocity(): void {
    const traveled = Math.max(this.pos.y - this.spawnY, 0);
    const progress = this.spawn.maxTravelDistance <= 0
      ? 1
      : traveled / this.spawn.maxTravelDistance;
    this.vel = new Vector(0, easedSpeed(this.spawn.speed, progress));
  }

  private updateRecedeVelocity(): void {
    const remainingDistance = Math.max(
      this.leadingEdgeY() - this.getTopWaterRowY(),
      0,
    );
    const progress = this.recedeStartDistance <= 0
      ? 1
      : 1 - remainingDistance / this.recedeStartDistance;
    this.vel = new Vector(
      0,
      -easedSpeed(Math.abs(this.spawn.recedeSpeed), clamp01(1 - progress)),
    );
  }

  private updateGridVisibility(): void {
    this.graphics.isVisible =
      this.topEdgeY() >= this.grid.gridTop - this.grid.tileSize;
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
    this.crashElapsedMs = 0;
    this.recedeStartDistance = Math.max(
      this.leadingEdgeY() - this.getTopWaterRowY(),
      0,
    );
    this.vel = Vector.Zero;
  }

  private finishRecession(): void {
    this.state = "dead";
    this.vel = Vector.Zero;
    this.emitWaveEvent({
      type: "dissipated",
      col: this.spawn.col,
      row: Math.max(this.lastEnteredRow, 0),
    });
    this.kill();
  }

  private emitWaveEvent(event: WaveSegmentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
