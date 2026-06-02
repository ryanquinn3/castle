// stub — will be replaced in a later task
import { Terrain, type CardinalDirection, type ErosionResult, type SerializedTerrain, type TileRenderInfo, type WallEvent } from './terrain.ts';
import { clamp, lerpChannel, elevationToColor } from './utils.ts';
import type { WaterColumn } from '../water-column.ts';

export class Wall extends Terrain {
  constructor(public height: number) { super(); this.height = clamp(height, 0, 100); }
  get elevation() { return this.height; }
  get sprite() { return null; }
  onWaterHit(_c: WaterColumn, _d: CardinalDirection): WallEvent { return null; }
  applyHits(_n: number): ErosionResult | null { return null; }
  applyDelta(_n: number): Terrain { return this; }
  resetHits() {}
  serialize(): SerializedTerrain { return { type: 'wall', height: this.height }; }
  getRenderInfo(): TileRenderInfo {
    const { r, g, b } = elevationToColor(lerpChannel(0, this.height, 1));
    return { sprite: null, tint: null, cacheKey: `wall-stub:${r}:${g}:${b}` };
  }
}
