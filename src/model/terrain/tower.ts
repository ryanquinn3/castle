import type { ImageSource } from "excalibur";
import {
  MAX_ELEVATION,
  TOWER_LEVEL_HEIGHT,
  TOWER_LEVEL_HP,
  TOWER_LEVEL_COST,
  MAX_TOWER_LEVEL,
} from "../../config.ts";
import { Resources } from "../../resources.ts";
import {
  Terrain,
  type CellInfo,
  type ErosionResult,
  type SerializedTerrain,
  type TileRenderInfo,
} from "./terrain.ts";
import { Wall } from "./wall.ts";
import { HealthComponent } from "./health-component.ts";
import type { Repairable } from "../../action-type.ts";

export class Tower extends Terrain implements Repairable {
  readonly level: number;
  private readonly fixedHeight: number;
  private readonly health: HealthComponent;

  constructor(level: number) {
    super();
    this.level = Math.max(1, Math.min(level, MAX_TOWER_LEVEL));
    this.fixedHeight = Math.min(
      TOWER_LEVEL_HEIGHT[this.level - 1],
      MAX_ELEVATION,
    );
    this.health = new HealthComponent(TOWER_LEVEL_HP[this.level - 1]);
    this.addComponent(this.health);
  }

  get hp(): number {
    return this.health.current;
  }

  get repairCost(): number {
    return TOWER_LEVEL_COST[this.level - 1];
  }

  get elevation(): number {
    return this.health.current > 0 ? this.fixedHeight : 0;
  }

  private get levelSprite(): ImageSource {
    const sprites = [Resources.TowerLevel1, Resources.TowerLevel2, Resources.TowerLevel3];
    return sprites[this.level - 1];
  }

  get sprite(): ImageSource | null {
    return this.levelSprite;
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
    return {
      type: "tower",
      height: this.fixedHeight,
      level: this.level,
      hp: this.health.current,
    };
  }

  resetHits(): void {
    // no-op: tower HP persists across levels
  }

  describe(): CellInfo {
    return {
      title: "Tower",
      stats: [
        { label: "Level", value: String(this.level) },
        { label: "Height", value: String(this.fixedHeight) },
        { label: "HP", value: String(this.health.current) },
      ],
    };
  }

  override connectsTo(other: Terrain | null): boolean {
    return other instanceof Wall || other instanceof Tower;
  }

  getRenderInfo(): TileRenderInfo {
    return { sprite: this.levelSprite.toSprite(), tint: null };
  }
}
