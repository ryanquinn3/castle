import type { ImageSource } from 'excalibur';
import { MAX_ELEVATION, TOWER_HITS_PER_EROSION } from '../../config.ts';
import { Resources } from '../../resources.ts';
import type { WaterColumn } from '../water-column.ts';
import { Terrain, type CardinalDirection, type ErosionResult, type SerializedTerrain, type TileRenderInfo, type WallEvent } from './terrain.ts';
import { Wall } from './wall.ts';

export class Tower extends Terrain {
  towerHeight: number;
  hitCount: number = 0;

  constructor(height: number) {
    super();
    this.towerHeight = Math.min(height, MAX_ELEVATION);
  }

  get elevation(): number {
    return this.towerHeight;
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

    if (this.towerHeight >= column.surfaceLevel) {
      column.surfaceLevel = column.floorLevel;
      event = 'blocked';
    } else if (this.towerHeight > column.floorLevel) {
      column.floorLevel = this.towerHeight;
      event = 'overtopped';
    }

    if (column.surfaceLevel - this.towerHeight >= 2) {
      this.hitCount += 1;
      if (this.hitCount >= TOWER_HITS_PER_EROSION) {
        this.hitCount -= TOWER_HITS_PER_EROSION;
        this.towerHeight -= 1;
      }
    }

    return event;
  }

  applyHits(count: number): ErosionResult | null {
    this.hitCount += count;
    let eroded = false;
    while (this.hitCount >= TOWER_HITS_PER_EROSION && this.towerHeight > 0) {
      this.hitCount -= TOWER_HITS_PER_EROSION;
      this.towerHeight -= 1;
      eroded = true;
    }
    return eroded ? { newElevation: this.towerHeight } : null;
  }

  applyDelta(_amount: number): Terrain {
    return this;
  }

  serialize(): SerializedTerrain {
    return { type: 'tower', height: this.towerHeight };
  }

  resetHits(): void {
    this.hitCount = 0;
  }

  override connectsTo(other: Terrain | null): boolean {
    return other instanceof Wall || other instanceof Tower;
  }

  getRenderInfo(): TileRenderInfo {
    return { sprite: Resources.TowerSprite.toSprite(), tint: null };
  }
}
