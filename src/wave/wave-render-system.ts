import { System, SystemType, type Scene } from "excalibur";
import { WaterComponent } from "./water-component.ts";
import { buildFieldCoverageData } from "./water-field-coverage.ts";
import type { WaveOverlay } from "./wave-overlay.ts";

export interface WaveRenderSystemOptions {
  scene: Scene;
  overlay: WaveOverlay;
  gridWidth: number;
  gridHeight: number;
  tileSize: number;
}

/**
 * Reads WaterComponents (the sim/render contract), rebuilds a 2D depth grid,
 * rasterizes it, and pushes the buffer to the overlay. Runs after
 * WaveDynamicSystem (default priority 0 > flux's -1).
 */
export class WaveRenderSystem extends System {
  readonly systemType = SystemType.Update;

  private readonly query;
  private readonly overlay: WaveOverlay;
  private readonly gridWidth: number;
  private readonly gridHeight: number;
  private readonly tileSize: number;

  constructor(opts: WaveRenderSystemOptions) {
    super();
    this.overlay = opts.overlay;
    this.gridWidth = opts.gridWidth;
    this.gridHeight = opts.gridHeight;
    this.tileSize = opts.tileSize;
    this.query = opts.scene.world.query([WaterComponent]);
  }

  update(): void {
    const depths = Array.from({ length: this.gridHeight }, () =>
      Array.from<number>({ length: this.gridWidth }).fill(0),
    );
    for (const entity of this.query.entities) {
      const w = entity.get(WaterComponent)!;
      if (w.row >= 0 && w.row < this.gridHeight && w.col >= 0 && w.col < this.gridWidth) {
        depths[w.row][w.col] = w.depth;
      }
    }
    this.overlay.setCoverage(
      buildFieldCoverageData({
        depths,
        gridWidth: this.gridWidth,
        gridHeight: this.gridHeight,
        tileSize: this.tileSize,
      }),
    );
  }
}
