// stub — will be replaced in a later task
import { Terrain, type CardinalDirection, type ErosionResult, type SerializedTerrain, type TileRenderInfo, type WallEvent } from './terrain.ts';
import type { WaterColumn } from '../water-column.ts';

export class Hole extends Terrain {
  constructor(public depth: number) { super(); }
  get elevation() { return -this.depth; }
  get sprite() { return null; }
  onWaterHit(_c: WaterColumn, _d: CardinalDirection): WallEvent { return null; }
  applyHits(_n: number): ErosionResult | null { return null; }
  applyDelta(_n: number): Terrain { return this; }
  resetHits() {}
  serialize(): SerializedTerrain { return { type: 'hole', height: this.elevation, puddleDepth: 0 }; }
  getRenderInfo(): TileRenderInfo { return { sprite: null, tint: null }; }
}
