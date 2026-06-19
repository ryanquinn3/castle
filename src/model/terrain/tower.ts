import type { ImageSource } from 'excalibur';
import { MAX_ELEVATION, TOWER_COST, TOWER_HP } from '../../config.ts';
import { Resources } from '../../resources.ts';
import { Terrain, type CellInfo, type ErosionResult, type SerializedTerrain, type TileRenderInfo } from './terrain.ts';
import { Wall } from './wall.ts';
import { HealthComponent } from './health-component.ts';
import type { Repairable } from '../../action-type.ts';

export class Tower extends Terrain implements Repairable {
  private readonly fixedHeight: number;
  private readonly health: HealthComponent;

  constructor(height: number) {
    super();
    this.fixedHeight = Math.min(height, MAX_ELEVATION);
    this.health = new HealthComponent(TOWER_HP);
    this.addComponent(this.health);
  }

  get hp(): number {
    return this.health.current;
  }

  get repairCost(): number {
    return TOWER_COST;
  }

  get elevation(): number {
    return this.health.current > 0 ? this.fixedHeight : 0;
  }

  get sprite(): ImageSource | null {
    return Resources.TowerSprite;
  }

  applyHits(count: number): ErosionResult | null {
    this.health.current = Math.max(0, this.health.current - count);
    if (this.health.current <= 0) {
      return { newElevation: 0 };
    }
    return null;
  }

  applyDelta(_amount: number): Terrain {
    return this;
  }

  serialize(): SerializedTerrain {
    return { type: 'tower', height: this.fixedHeight, hp: this.health.current };
  }

  resetHits(): void {
    // no-op: tower HP persists across levels
  }

  describe(): CellInfo {
    return {
      title: "Tower",
      stats: [
        { label: "Height", value: String(this.fixedHeight) },
        { label: "HP", value: String(this.health.current) },
      ],
    };
  }

  override connectsTo(other: Terrain | null): boolean {
    return other instanceof Wall || other instanceof Tower;
  }

  getRenderInfo(): TileRenderInfo {
    return { sprite: Resources.TowerSprite.toSprite(), tint: null };
  }
}
