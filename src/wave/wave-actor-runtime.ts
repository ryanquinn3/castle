import type { Scene } from 'excalibur';
import type { WaveEventApplier } from './wave-event-applier.ts';
import { WaveOverlay } from './wave-overlay.ts';
import { WaveSegment } from './wave-segment.ts';
import type { WaveActorRuntimeResult, WaveSegmentGrid, WaveSegmentSpawn } from './wave-segment-types.ts';

interface ActiveWaveRun {
  castleFlooded: boolean;
  erodedTiles: WaveActorRuntimeResult['erodedTiles'];
  remaining: number;
  resolve(result: WaveActorRuntimeResult): void;
  sandRedistributed: boolean;
  settled: boolean;
  unsubscribes: Map<WaveSegment, () => void>;
  dissipatedSegments: Set<WaveSegment>;
}

export class WaveActorRuntime {
  private readonly actors = new Set<WaveSegment>();
  private activeRun: ActiveWaveRun | null = null;
  private overlay: WaveOverlay | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly grid: WaveSegmentGrid,
    private readonly applier: WaveEventApplier,
    private readonly terrainSlope: number,
  ) {}

  playWave(spawns: WaveSegmentSpawn[]): Promise<WaveActorRuntimeResult> {
    if (spawns.length === 0) {
      return Promise.resolve({ castleFlooded: false, erodedTiles: [], sandRedistributed: false });
    }

    return new Promise(resolve => {
      const run: ActiveWaveRun = {
        castleFlooded: false,
        erodedTiles: [],
        remaining: spawns.length,
        resolve,
        sandRedistributed: false,
        settled: false,
        unsubscribes: new Map(),
        dissipatedSegments: new Set(),
      };
      this.activeRun = run;

      const gridWidth = spawns.reduce((max, s) => Math.max(max, s.col + 1), 0);
      this.overlay = new WaveOverlay({
        gridLeft: this.grid.gridLeft,
        gridTop: this.grid.gridTop,
        tileSize: this.grid.tileSize,
        width: gridWidth,
        height: this.grid.height,
      });
      this.scene.add(this.overlay);

      const maybeResolve = () => {
        if (run.remaining === 0 && !run.settled) {
          run.settled = true;
          this.activeRun = null;
          if (this.overlay) {
            this.scene.remove(this.overlay);
            this.overlay = null;
          }
          run.resolve(this.resultFor(run));
        }
      };

      for (const spawn of spawns) {
        const segment = new WaveSegment(spawn, this.grid, this.terrainSlope);
        this.actors.add(segment);
        const unsubscribe = segment.onWaveEvent(event => {
          if (run.settled || (event.type === 'dissipated' && run.dissipatedSegments.has(segment))) {
            return;
          }

          const applied = this.applier.apply(event);
          run.castleFlooded ||= applied.castleFlooded;
          run.sandRedistributed ||= applied.sandRedistributed;
          if (applied.erodedTile) {
            run.erodedTiles.push(applied.erodedTile);
          }

          if (event.type === 'dissipated') {
            run.dissipatedSegments.add(segment);
            run.unsubscribes.get(segment)?.();
            run.unsubscribes.delete(segment);
            this.actors.delete(segment);
            run.remaining--;
            maybeResolve();
          }
        });
        run.unsubscribes.set(segment, unsubscribe);
        this.scene.add(segment);
      }
    });
  }

  cleanup(): void {
    const run = this.activeRun;
    if (run && !run.settled) {
      run.settled = true;
      run.resolve(this.resultFor(run));
      this.activeRun = null;
    }

    if (run) {
      for (const unsubscribe of run.unsubscribes.values()) {
        unsubscribe();
      }
      run.unsubscribes.clear();
    }

    if (this.overlay) {
      this.scene.remove(this.overlay);
      this.overlay = null;
    }

    for (const actor of this.actors) {
      this.scene.remove(actor);
    }
    this.actors.clear();
  }

  private resultFor(run: ActiveWaveRun): WaveActorRuntimeResult {
    return {
      castleFlooded: run.castleFlooded,
      erodedTiles: run.erodedTiles,
      sandRedistributed: run.sandRedistributed,
    };
  }

}
