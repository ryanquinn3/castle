// stub — will be replaced in a later task
import { Terrain, type CardinalDirection, type ErosionResult, type SerializedTerrain, type TileRenderInfo, type WallEvent } from './terrain.ts';
import type { WaterColumn } from '../water-column.ts';

export class Tower extends Terrain {
  constructor(public height: number) { super(); }
  get elevation() { return this.height; }
  get sprite() { return null; }
  onWaterHit(_c: WaterColumn, _d: CardinalDirection): WallEvent { return null; }
  applyHits(_n: number): ErosionResult | null { return null; }
  applyDelta(_n: number): Terrain { return this; }
  resetHits() {}
  serialize(): SerializedTerrain { return { type: 'tower', height: this.height }; }
  getRenderInfo(): TileRenderInfo { return { sprite: null, tint: null }; }
}
