import type { ImageSource } from 'excalibur';
import { MAX_ELEVATION, TOWER_HITS_PER_EROSION } from '../../config.ts';
import { Resources } from '../../resources.ts';
import { Terrain, type ErosionResult, type SerializedTerrain, type TileRenderInfo } from './terrain.ts';
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
