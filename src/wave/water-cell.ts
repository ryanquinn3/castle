import { Actor, Vector } from "excalibur";
import { WaterComponent } from "./water-component.ts";

export interface WaterCellInit {
  col: number;
  row: number;
  depth: number;
  vel: Vector;
  gridLeft: number;
  gridTop: number;
  tileSize: number;
}

/**
 * A single grid cell of pressure-driven water: a positioned scene Actor that
 * carries a WaterComponent and nothing else (no collider, no scripted motion).
 * WaveDynamicSystem spawns one per wet cell and kills it when the cell drains.
 * Rendering is done by the overlay (M2b), so the actor has no graphics of its own.
 */
export class WaterCell extends Actor {
  readonly water: WaterComponent;

  constructor(init: WaterCellInit) {
    super({
      pos: new Vector(
        init.gridLeft + init.col * init.tileSize + init.tileSize / 2,
        init.gridTop + init.row * init.tileSize + init.tileSize / 2,
      ),
      width: init.tileSize,
      height: init.tileSize,
      name: `WaterCell-${init.col}:${init.row}`,
      z: 7,
    });
    this.graphics.isVisible = false;
    this.water = new WaterComponent({ depth: init.depth, vel: init.vel, col: init.col, row: init.row });
    this.addComponent(this.water);
  }
}
