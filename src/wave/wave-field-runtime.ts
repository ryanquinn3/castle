import type { Scene } from "excalibur";
import {
  PRESSURE_CASTLE_FLOOD_DEPTH,
  PRESSURE_DRAIN_THRESHOLD,
  PRESSURE_EROSION_FRONTAL_COEFF,
  PRESSURE_EROSION_SHEAR_COEFF,
} from "../config.ts";
import { WaterComponent } from "./water-component.ts";
import { WaveDynamicSystem, type WetCell } from "./wave-dynamic-system.ts";
import { WaveRenderSystem } from "./wave-render-system.ts";
import { WaveOverlay } from "./wave-overlay.ts";
import { applyTerrainFeedback } from "./wave-terrain-feedback.ts";
import { computeErosionHits } from "./wave-erosion.ts";
import type { WaveEventApplier } from "./wave-event-applier.ts";
import type { Terrain } from "../model/terrain/terrain.ts";
import type {
  WaveActorRuntimeResult,
  WaveSegmentGrid,
  WaveSegmentSpawn,
} from "./wave-segment-types.ts";

/**
 * Orchestrates the pressure-driven water path: builds the overlay, registers the
 * dynamic (sim) + render systems, opens the source for a surge window, and
 * resolves when no water remains. Mirrors WaveActorRuntime's playWave contract so
 * sessions swap it in behind a flag. When an applier is supplied, terrain feedback
 * runs each frame: holes absorb water into puddleDepth (M3), a flooded castle ends
 * the wave (M3), and walls/towers erode from the projected flux vector (M4). Sand
 * redistribution (blocked/overtopped sloughing) is not ported, so the result still
 * reports sandRedistributed: false.
 */
export class WaveFieldRuntime {
  private dynamicSystem: WaveDynamicSystem | null = null;
  private renderSystem: WaveRenderSystem | null = null;
  private overlay: WaveOverlay | null = null;
  private castleFlooded = false;
  private erosionAcc = new Map<string, number>();
  private readonly erodedTiles = new Set<Terrain>();

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
    this.erosionAcc = new Map();
    this.erodedTiles.clear();

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
          resolve({
            castleFlooded: this.castleFlooded,
            erodedTiles: [...this.erodedTiles],
            sandRedistributed: false,
          });
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
    const erosion = computeErosionHits({
      cells,
      isErodible: (col, row) => this.grid.getElevation(col, row) > 0 && !this.grid.isCastle(col, row),
      acc: this.erosionAcc,
      frontalCoeff: PRESSURE_EROSION_FRONTAL_COEFF,
      shearCoeff: PRESSURE_EROSION_SHEAR_COEFF,
    });
    this.erosionAcc = erosion.acc;
    for (const hit of erosion.hits) {
      const applied = applier.apply({ type: "eroded", col: hit.col, row: hit.row, hits: hit.hits });
      if (applied.erodedTile) {
        this.erodedTiles.add(applied.erodedTile);
      }
    }

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
