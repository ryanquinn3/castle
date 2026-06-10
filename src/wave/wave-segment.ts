import {
  Actor,
  type CollisionContact,
  type Collider,
  CollisionType,
  type Side,
  Vector,
  type Engine,
  type Sprite,
  Shape,
  CircleCollider,
} from "excalibur";
import type {
  WaveSegmentEvent,
  WaveSegmentGrid,
  WaveSegmentSpawn,
  WaveState,
} from "./wave-segment-types.ts";
import { beachSpriteSheet } from "../resources.ts";
import { depthAlpha, progressionAlpha } from "./water-alpha.ts";

const WATER_SPRITES = [
  { col: 4, row: 0 },
  { col: 5, row: 0 },
  { col: 4, row: 1 },
  { col: 5, row: 1 },
] as const;

function waterSpriteFor(
  col: number,
  row: number,
): (typeof WATER_SPRITES)[number] {
  return WATER_SPRITES[Math.abs(col * 31 + row * 17) % WATER_SPRITES.length];
}

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
  private readonly waveSprite: Sprite;
  private readonly puddleSprite: Sprite;
  private plannedCells: PlannedWaveCell[];
  private crashElapsedMs = 0;
  private lastEnteredRow = -1;
  protected agedMs = 0;
  private maxLifetimeMs = 7_000;
  private gridLoc: Vector;

  constructor(
    private readonly spawn: WaveSegmentSpawn,
    private readonly grid: WaveSegmentGrid,
    private readonly terrainSlope: number,
  ) {
    super({
      pos: new Vector(spawn.x, spawn.y),
      width: grid.tileSize,
      height: grid.tileSize,
      vel: new Vector(0, spawn.speed),
      name: "WaveSegment",
      collisionType: CollisionType.Active,
      z: 7,
    });
    this.collider.set(Shape.Box(this.width, 1));
    this.currentDepth = spawn.initialDepth;
    this.body.mass = this.width * this.height * this.currentDepth;
    this.plannedCells = this.planWaveCells();
    this.currentAlpha = this.plannedCells[0]?.alpha ?? progressionAlpha(0, 1);
    this.spawnY = spawn.y;
    this.updateGridVisibility();
    this.gridLoc = this.getGridLoc();
    this.waveSprite = beachSpriteSheet.getSprite(0, 2).clone();
    this.waveSprite.width = grid.tileSize;
    this.waveSprite.height = grid.tileSize;
    const puddle = waterSpriteFor(spawn.col, 0);
    this.puddleSprite = beachSpriteSheet
      .getSprite(puddle.col, puddle.row)
      .clone();
    this.puddleSprite.width = grid.tileSize;
    this.puddleSprite.height = grid.tileSize;
    this.graphics.use(this.waveSprite);
    this.updateVisualState();
  }
  private getGridLoc(): Vector {
    const row = Math.floor(
      (this.pos.y - this.grid.gridTop) / this.grid.tileSize,
    );
    const col = Math.floor(
      (this.pos.x - this.grid.gridLeft) / this.grid.tileSize,
    );
    return new Vector(col, row);
  }

  get derivedState(): WaveState {
    if (this.state === "crashing" || this.state === "dead") {
      return this.state;
    }
    if (this.vel.y === 0 && this.vel.x === 0) {
      return "still";
    }
    return this.vel.y > 0 ? "surging" : "receding";
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
  override onPostUpdate(engine: Engine, delta: number): void {
    this.updateGridVisibility();
    this.agedMs += delta;
    const newGridLoc = this.getGridLoc();
    if (this.state === "surging" && !newGridLoc.equals(this.gridLoc)) {
      this.spawnStillClone(engine);
      this.gridLoc = newGridLoc;
    }

    if (this.agedMs >= this.maxLifetimeMs && this.vel.y === 0) {
      this.beginRecession();
      return;
    }
    if (this.spawn.speed === 0) {
      this.updateVisualState();
      return;
    }

    if (
      this.state === "receding" &&
      this.topEdgeY() < this.grid.gridTop - this.grid.tileSize
    ) {
      this.finishRecession();
      return;
    }

    if (this.state === "crashing") {
      this.crashElapsedMs += delta;
      if (this.crashElapsedMs >= CRASH_PAUSE_MS) {
        this.beginRecession();
      }
      this.updateVisualState();
      return;
    }

    if (this.state !== "surging") {
      this.updateVisualState();
      return;
    }

    this.updateSurgeVelocity();

    this.handleTileEntries();
    if (this.state !== "surging") {
      this.updateVisualState();
      return;
    }
    this.handleTravelDissipation();
    this.updateVisualState();
  }

  override onCollisionStart(
    _self: Collider,
    other: Collider,
    _side: Side,
    _contact: CollisionContact,
  ): void {
    const otherActor = other.owner;
    if (
      !(otherActor instanceof WaveSegment) ||
      this.state === "dead" ||
      otherActor.state === "dead"
    ) {
      return;
    }
    if (otherActor instanceof WaveSegment && this.id < otherActor.id) {
      this.mergeWith(otherActor);
    }
  }

  private mergeWith(other: WaveSegment): void {
    const absorbed = other;

    const m1 = this.body.mass;
    const m2 = absorbed.body.mass;
    const totalMass = m1 + m2;

    if (totalMass > 0 && this.state !== "receding") {
      this.vel = new Vector(
        (m1 * this.vel.x + m2 * absorbed.vel.x) / totalMass,
        (m1 * this.vel.y + m2 * absorbed.vel.y) / totalMass,
      );
    }

    this.currentDepth += absorbed.currentDepth;
    this.currentAlpha = depthAlpha(this.currentDepth);
    this.body.mass = totalMass;
    this.replanFromRow(this.lastEnteredRow + 1, this.currentDepth);
    this.updateVisualState();

    absorbed.state = "dead";
    absorbed.vel = Vector.Zero;
    absorbed.kill();
  }

  private beginRecession(): void {
    this.state = "receding";
    this.acc = new Vector(0, -2 * this.grid.tileSize);
    this.vel.y = -this.grid.tileSize;
  }

  private replanFromRow(startRow: number, startDepth: number): void {
    const maxRow = Math.min(
      this.maxReachableRowByTravel(),
      this.grid.height - 1,
    );
    if (maxRow < startRow) {
      this.plannedCells = [];
      return;
    }

    const cells: Array<{ row: number; depth: number }> = [];
    let depth = startDepth;

    for (
      let row = startRow;
      row <= maxRow && row < this.grid.height && depth > MIN_DEPTH;
      row++
    ) {
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
        depth -= Math.min(
          depth,
          this.grid.effectiveHoleDepth(this.spawn.col, row),
        );
      } else {
        depth -= this.terrainSlope;
      }
    }

    this.plannedCells = cells.map((cell, index) => ({
      ...cell,
      alpha: progressionAlpha(index, cells.length),
    }));
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
    const isStill = this.derivedState === "still";
    const activeSprite = isStill ? this.puddleSprite : this.waveSprite;
    activeSprite.opacity = this.currentAlpha;
    this.graphics.use(activeSprite);
  }

  private planWaveCells(): PlannedWaveCell[] {
    const maxRow = Math.min(
      this.maxReachableRowByTravel(),
      this.grid.height - 1,
    );
    if (maxRow < 0) {
      return [];
    }

    const cells: Array<{ row: number; depth: number }> = [];
    let depth = this.spawn.initialDepth;

    for (
      let row = 0;
      row <= maxRow && row < this.grid.height && depth > MIN_DEPTH;
      row++
    ) {
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
        depth -= Math.min(
          depth,
          this.grid.effectiveHoleDepth(this.spawn.col, row),
        );
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
    const maxLeadY =
      this.spawn.y + this.spawn.maxTravelDistance + this.height / 2;
    return Math.floor((maxLeadY - this.grid.gridTop) / this.grid.tileSize);
  }

  private updateSurgeVelocity(): void {
    const traveled = Math.max(this.pos.y - this.spawnY, 0);
    const progress =
      this.spawn.maxTravelDistance <= 0
        ? 1
        : traveled / this.spawn.maxTravelDistance;
    this.vel = new Vector(0, easedSpeed(this.spawn.speed, progress));
  }

  private updateGridVisibility(): void {
    this.graphics.isVisible = this.topEdgeY() >= this.getTopWaterRowY();
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

    this.vel = Vector.Zero;
  }

  private finishRecession(): void {
    this.state = "dead";

    this.emitWaveEvent({
      type: "dissipated",
      col: this.spawn.col,
      row: Math.max(this.lastEnteredRow, 0),
    });
    this.vel = Vector.Zero;
    this.actions.fade(0, 100).die();
  }

  private spawnStillClone(engine: Engine): void {
    const y =
      this.grid.gridTop +
      this.gridLoc.y * this.grid.tileSize +
      this.grid.tileSize / 2;
    const x =
      this.grid.gridLeft +
      this.gridLoc.x * this.grid.tileSize +
      this.grid.tileSize / 2;
    const clone = new WaveSegment(
      {
        col: this.gridLoc.x,
        y,
        x,
        initialDepth: this.currentDepth,
        speed: 0,
        recedeSpeed: 0,
        maxTravelDistance: 0,
      },
      this.grid,
      this.terrainSlope,
    );
    clone.currentAlpha = this.currentAlpha;
    clone.vel = Vector.Zero;
    clone.agedMs = this.agedMs;
    clone.body.collisionType = CollisionType.Passive;
    clone.collider.clear();
    clone.collider.set(
      new CircleCollider({
        radius: this.grid.tileSize / 4,
      }),
    );
    clone.graphics.opacity = 0;
    clone.actions.fade(this.currentAlpha, 100);
    this.events.emit("")
    engine.clock.schedule(() => {
      this.scene?.add(clone);
    }, 50);
  }

  private emitWaveEvent(event: WaveSegmentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
