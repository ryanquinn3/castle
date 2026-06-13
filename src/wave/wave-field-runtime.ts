import type { Scene } from "excalibur";
import { PRESSURE_CASTLE_FLOOD_DEPTH, PRESSURE_DRAIN_THRESHOLD } from "../config.ts";
import { WaterComponent } from "./water-component.ts";
import { WaveDynamicSystem, type WetCell } from "./wave-dynamic-system.ts";
import { WaveRenderSystem } from "./wave-render-system.ts";
import { WaveOverlay } from "./wave-overlay.ts";
import { applyTerrainFeedback } from "./wave-terrain-feedback.ts";
import type { WaveEventApplier } from "./wave-event-applier.ts";
import type {
  WaveActorRuntimeResult,
  WaveSegmentGrid,
  WaveSegmentSpawn,
} from "./wave-segment-types.ts";

/**
 * Orchestrates the pressure-driven water path: builds the overlay, registers the
 * dynamic (sim) + render systems, opens the source for a surge window, and
 * resolves when no water remains. Mirrors WaveActorRuntime's playWave contract so
 * sessions swap it in behind a flag. When an applier is supplied (M3), terrain
 * feedback runs each frame: holes absorb water into puddleDepth and a flooded
 * castle ends the wave. Erosion and sand redistribution remain M4, so the result
 * still reports no eroded tiles and no sand redistribution.
 */
export class WaveFieldRuntime {
  private dynamicSystem: WaveDynamicSystem | null = null;
  private renderSystem: WaveRenderSystem | null = null;
  private overlay: WaveOverlay | null = null;
  private castleFlooded = false;

  constructor(
    private readonly scene: Scene,
    private readonly grid: WaveSegmentGrid,
    private readonly terrainSlope: number,
    private readonly options: { surgeWindowMs?: number; applier?: WaveEventApplier } = {},
  ) {}

  playWave(spawns: WaveSegmentSpawn[]): Promise<WaveActorRuntimeResult> {
    if (spawns.length === 0) {
      return Promise.resolve({ castleFlooded: false, erodedTiles: [], sandRedistributed: false });
    }

    this.castleFlooded = false;

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
        groundAt: (col, row) => {
          const elev = this.grid.getElevation(col, row);
          // Holes (negative elevation) read as a pit only as deep as their
          // remaining capacity, so a full hole reads as flat ground.
          const offset = elev < 0 ? -this.grid.effectiveHoleDepth(col, row) : elev;
          return this.terrainSlope * row + offset;
        },
        gridLeft: this.grid.gridLeft,
        gridTop: this.grid.gridTop,
        tileSize: this.grid.tileSize,
        surgeWindowMs: this.options.surgeWindowMs,
        onResolveCells: this.options.applier
          ? (cells) => this.resolveTerrain(cells, this.options.applier!)
          : undefined,
        onComplete: () => {
          resolve({ castleFlooded: this.castleFlooded, erodedTiles: [], sandRedistributed: false });
          this.cleanup();
        },
      });

      // Dynamic (priority -1) registered before render so it runs first.
      this.scene.world.add(this.dynamicSystem);
      this.scene.world.add(this.renderSystem!);
    });
  }

  private resolveTerrain(
    cells: WetCell[],
    applier: WaveEventApplier,
  ): { cells: WetCell[]; done: boolean } {
    const feedback = applyTerrainFeedback({
      cells,
      probe: {
        isCastle: (col, row) => this.grid.isCastle(col, row),
        remainingHoleCapacity: (col, row) => this.grid.effectiveHoleDepth(col, row),
      },
      floodDepth: PRESSURE_CASTLE_FLOOD_DEPTH,
      drainThreshold: PRESSURE_DRAIN_THRESHOLD,
    });
    for (const delta of feedback.absorbed) {
      applier.apply({ type: "absorbed", col: delta.col, row: delta.row, absorbedDepth: delta.amount });
    }
    if (feedback.castleFlooded) {
      this.castleFlooded = true;
    }
    return { cells: feedback.cells, done: feedback.castleFlooded };
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
