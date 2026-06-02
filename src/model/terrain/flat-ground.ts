import { Terrain, type CardinalDirection, type ErosionResult, type SerializedTerrain, type TileRenderInfo, type WallEvent } from './terrain.ts';
import type { WaterColumn } from '../water-column.ts';
import { Wall } from './wall.ts';
import { Hole } from './hole.ts';

export class FlatGround extends Terrain {
  get elevation(): number {
    return 0;
  }

  get sprite() {
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

  getRenderInfo(): TileRenderInfo {
    return { sprite: null, tint: null };
  }
}
