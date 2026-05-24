import type { WallEvent } from './flow-field.ts';

export class WaterColumn {
  floorLevel: number;
  surfaceLevel: number;

  constructor(floorLevel: number, surfaceLevel: number) {
    this.floorLevel = floorLevel;
    this.surfaceLevel = surfaceLevel;
  }

  get depth(): number {
    return this.surfaceLevel - this.floorLevel;
  }

  applyTerrain(elevation: number): WallEvent {
    if (elevation >= this.surfaceLevel) {
      this.surfaceLevel = this.floorLevel;
      return 'blocked';
    }

    if (elevation > this.floorLevel) {
      this.floorLevel = elevation;
      return 'overtopped';
    }

    this.floorLevel = Math.max(elevation, 0);
    return null;
  }

  advanceRow(terrainSlope: number): void {
    this.floorLevel += terrainSlope;
    if (this.floorLevel >= this.surfaceLevel) {
      this.surfaceLevel = this.floorLevel;
    }
  }

  isEmpty(): boolean {
    return this.depth <= 0;
  }
}
