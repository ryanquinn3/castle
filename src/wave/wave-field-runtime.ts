import type { Scene } from "excalibur";
import { WaterComponent } from "./water-component.ts";
import { WaveDynamicSystem } from "./wave-dynamic-system.ts";
import { WaveRenderSystem } from "./wave-render-system.ts";
import { WaveOverlay } from "./wave-overlay.ts";
import type {
  WaveActorRuntimeResult,
  WaveSegmentGrid,
  WaveSegmentSpawn,
} from "./wave-segment-types.ts";

/**
 * Orchestrates the pressure-driven water path: builds the overlay, registers the
 * dynamic (sim) + render systems, opens the source for a surge window, and
 * resolves when no water remains. Mirrors WaveActorRuntime's playWave contract so
 * sessions swap it in behind a flag. M2 scope is flat ground: no erosion,
 * pooling, or castle flooding yet (M3/M4), so the result reports no terrain change.
 */
export class WaveFieldRuntime {
  private dynamicSystem: WaveDynamicSystem | null = null;
  private renderSystem: WaveRenderSystem | null = null;
  private overlay: WaveOverlay | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly grid: WaveSegmentGrid,
    private readonly terrainSlope: number,
    private readonly options: { surgeWindowMs?: number } = {},
  ) {}

  playWave(spawns: WaveSegmentSpawn[]): Promise<WaveActorRuntimeResult> {
    if (spawns.length === 0) {
      return Promise.resolve({ castleFlooded: false, erodedTiles: [], sandRedistributed: false });
    }

    const width = spawns.length;
    const sourceDepth = Math.max(...spawns.map((s) => s.initialDepth));

    this.overlay = new WaveOverlay({
      gridLeft: this.grid.gridLeft,
      gridTop: this.grid.gridTop,
      tileSize: this.grid.tileSize,
      width,
      height: this.grid.height,
    });
    this.scene.add(this.overlay);

    this.renderSystem = new WaveRenderSystem({
      scene: this.scene,
      overlay: this.overlay,
      gridWidth: width,
      gridHeight: this.grid.height,
      tileSize: this.grid.tileSize,
    });

    return new Promise((resolve) => {
      this.dynamicSystem = new WaveDynamicSystem({
        scene: this.scene,
        width,
        height: this.grid.height,
        sourceDepth,
        groundAt: (col, row) => this.terrainSlope * row + this.grid.getElevation(col, row),
        gridLeft: this.grid.gridLeft,
        gridTop: this.grid.gridTop,
        tileSize: this.grid.tileSize,
        surgeWindowMs: this.options.surgeWindowMs,
        onComplete: () => {
          resolve({ castleFlooded: false, erodedTiles: [], sandRedistributed: false });
          this.cleanup();
        },
      });

      // Dynamic (priority -1) registered before render so it runs first.
      this.scene.world.add(this.dynamicSystem);
      this.scene.world.add(this.renderSystem!);
    });
  }

  cleanup(): void {
    this.dynamicSystem?.clear();
    if (this.dynamicSystem) {
      this.scene.world.remove(this.dynamicSystem);
      this.dynamicSystem = null;
    }
    if (this.renderSystem) {
      this.scene.world.remove(this.renderSystem);
      this.renderSystem = null;
    }
    if (this.overlay) {
      this.scene.remove(this.overlay);
      this.overlay = null;
    }
    for (const entity of this.scene.world.query([WaterComponent]).entities) {
      entity.kill();
    }
  }
}
