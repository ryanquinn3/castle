import type { ImageSource } from 'excalibur';
import { MAX_ELEVATION, MIN_ELEVATION, TOWER_HITS_PER_EROSION } from '../config.ts';
import { Resources } from '../resources.ts';
import type { WaterColumn } from './water-column.ts';

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';
export type WallEvent = 'overtopped' | 'blocked' | null;

export interface SerializedTerrain {
  type: string;
  height: number;
  [key: string]: unknown;
}

export interface ErosionResult {
  newElevation: number;
}

export abstract class Terrain {
  abstract get elevation(): number;
  abstract get sprite(): ImageSource | null;

  abstract onWaterHit(
    column: WaterColumn,
    direction: CardinalDirection,
  ): WallEvent;
  abstract applyHits(count: number): ErosionResult | null;
  abstract applyDelta(amount: number): Terrain;
  abstract resetHits(): void;
  abstract serialize(): SerializedTerrain;
}

export class FlatGround extends Terrain {
  get elevation(): number {
    return 0;
  }

  get sprite(): ImageSource | null {
    return null;
  }

  onWaterHit(
    _column: WaterColumn,
    _direction: CardinalDirection,
  ): WallEvent {
    return null;
  }

  applyHits(_count: number): ErosionResult | null {
    return null;
  }

  applyDelta(amount: number): Terrain {
    if (amount > 0) {
      return new Wall(amount);
    }
    if (amount < 0) {
      return new Hole(-amount);
    }
    return new FlatGround();
  }

  resetHits(): void {}

  serialize(): SerializedTerrain {
    return { type: 'flat', height: 0 };
  }
}

export class Wall extends Terrain {
  height: number;
  hitCount: number = 0;

  constructor(height: number) {
    super();
    this.height = Math.min(height, MAX_ELEVATION);
  }

  get elevation(): number {
    return this.height;
  }

  get sprite(): ImageSource | null {
    if (this.height <= 5) {
      return Resources.WallLevel1;
    }
    if (this.height <= 10) {
      return Resources.WallLevel2;
    }
    if (this.height <= 15) {
      return Resources.WallLevel3;
    }
    return Resources.WallLevel4;
  }

  onWaterHit(
    column: WaterColumn,
    _direction: CardinalDirection,
  ): WallEvent {
    if (column.isEmpty()) {
      return null;
    }

    let event: WallEvent = null;

    if (this.height >= column.surfaceLevel) {
      column.surfaceLevel = column.floorLevel;
      event = 'blocked';
    } else if (this.height > column.floorLevel) {
      column.floorLevel = this.height;
      event = 'overtopped';
    }

    if (column.surfaceLevel - this.height >= 2) {
      this.hitCount += 1;
      if (this.hitCount >= 3) {
        this.hitCount -= 3;
        this.height -= 1;
      }
    }

    return event;
  }

  applyHits(count: number): ErosionResult | null {
    this.hitCount += count;
    let eroded = false;
    while (this.hitCount >= 3 && this.height > 0) {
      this.hitCount -= 3;
      this.height -= 1;
      eroded = true;
    }
    return eroded ? { newElevation: this.height } : null;
  }

  applyDelta(amount: number): Terrain {
    const newHeight = this.height + amount;
    if (newHeight <= 0) {
      if (newHeight < 0) {
        return new Hole(Math.min(-newHeight, -MIN_ELEVATION));
      }
      return new FlatGround();
    }
    this.height = Math.min(newHeight, MAX_ELEVATION);
    return this;
  }

  serialize(): SerializedTerrain {
    return { type: 'wall', height: this.height };
  }

  resetHits(): void {
    this.hitCount = 0;
  }
}

export class Hole extends Terrain {
  depth: number;
  puddleDepth: number = 0;
  hitCount: number = 0;

  constructor(depth: number) {
    super();
    this.depth = Math.min(depth, -MIN_ELEVATION);
  }

  get elevation(): number {
    return -this.depth;
  }

  get effectiveDepth(): number {
    return Math.max(0, this.depth - this.puddleDepth);
  }

  get sprite(): ImageSource | null {
    return null;
  }

  addPuddle(amount: number): void {
    this.puddleDepth = Math.min(this.depth, this.puddleDepth + amount);
  }

  onWaterHit(
    _column: WaterColumn,
    _direction: CardinalDirection,
  ): WallEvent {
    return null;
  }

  applyHits(count: number): ErosionResult | null {
    this.hitCount += count;
    let eroded = false;
    while (this.hitCount >= 3 && this.depth > 0) {
      this.hitCount -= 3;
      this.depth -= 1;
      eroded = true;
    }
    this.puddleDepth = Math.min(this.puddleDepth, this.depth);
    return eroded ? { newElevation: this.elevation } : null;
  }

  applyDelta(amount: number): Terrain {
    const newElevation = this.elevation + amount;
    if (newElevation >= 0) {
      if (newElevation > 0) {
        return new Wall(Math.min(newElevation, MAX_ELEVATION));
      }
      return new FlatGround();
    }
    this.depth = Math.min(-newElevation, -MIN_ELEVATION);
    this.puddleDepth = Math.min(this.puddleDepth, this.depth);
    return this;
  }

  serialize(): SerializedTerrain {
    return { type: 'hole', height: this.elevation, puddleDepth: this.puddleDepth };
  }

  resetHits(): void {
    this.hitCount = 0;
  }
}

export class Tower extends Terrain {
  height: number;
  hitCount: number = 0;

  constructor(height: number) {
    super();
    this.height = Math.min(height, MAX_ELEVATION);
  }

  get elevation(): number {
    return this.height;
  }

  get sprite(): ImageSource | null {
    return Resources.TowerSprite;
  }

  onWaterHit(
    column: WaterColumn,
    _direction: CardinalDirection,
  ): WallEvent {
    if (column.isEmpty()) {
      return null;
    }

    let event: WallEvent = null;

    if (this.height >= column.surfaceLevel) {
      column.surfaceLevel = column.floorLevel;
      event = 'blocked';
    } else if (this.height > column.floorLevel) {
      column.floorLevel = this.height;
      event = 'overtopped';
    }

    if (column.surfaceLevel - this.height >= 2) {
      this.hitCount += 1;
      if (this.hitCount >= TOWER_HITS_PER_EROSION) {
        this.hitCount -= TOWER_HITS_PER_EROSION;
        this.height -= 1;
      }
    }

    return event;
  }

  applyHits(count: number): ErosionResult | null {
    this.hitCount += count;
    let eroded = false;
    while (this.hitCount >= TOWER_HITS_PER_EROSION && this.height > 0) {
      this.hitCount -= TOWER_HITS_PER_EROSION;
      this.height -= 1;
      eroded = true;
    }
    return eroded ? { newElevation: this.height } : null;
  }

  applyDelta(_amount: number): Terrain {
    return this;
  }

  serialize(): SerializedTerrain {
    return { type: 'tower', height: this.height };
  }

  resetHits(): void {
    this.hitCount = 0;
  }
}
