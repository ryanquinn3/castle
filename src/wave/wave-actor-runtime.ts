import type { ImageSource, Scene } from 'excalibur';
import { StaticWaterActor } from './static-water-actor.ts';
import type { WaveEventApplier } from './wave-event-applier.ts';
import { WaveSegment } from './wave-segment.ts';
import type { WaveActorRuntimeResult, WaveSegmentEvent, WaveSegmentGrid, WaveSegmentSpawn } from './wave-segment-types.ts';

interface ActiveWaveRun {
  castleFlooded: boolean;
  erodedTiles: WaveActorRuntimeResult['erodedTiles'];
  events: WaveSegmentEvent[];
  remaining: number;
  resolve(result: WaveActorRuntimeResult): void;
  sandRedistributed: boolean;
  settled: boolean;
  staticWaterBySegment: Map<WaveSegment, Set<StaticWaterActor>>;
  unsubscribes: Map<WaveSegment, () => void>;
  dissipatedSegments: Set<WaveSegment>;
}

export class WaveActorRuntime {
  private readonly actors = new Set<WaveSegment>();
  private activeRun: ActiveWaveRun | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly grid: WaveSegmentGrid,
    private readonly applier: WaveEventApplier,
    private readonly terrainSlope: number,
    private readonly waterImage: ImageSource,
  ) {}

  playWave(spawns: WaveSegmentSpawn[]): Promise<WaveActorRuntimeResult> {
    if (spawns.length === 0) {
      return Promise.resolve({ castleFlooded: false, erodedTiles: [], sandRedistributed: false, events: [] });
    }

    return new Promise(resolve => {
      const run: ActiveWaveRun = {
        castleFlooded: false,
        erodedTiles: [],
        events: [],
        remaining: spawns.length,
        resolve,
        sandRedistributed: false,
        settled: false,
        staticWaterBySegment: new Map(),
        unsubscribes: new Map(),
        dissipatedSegments: new Set(),
      };
      this.activeRun = run;

      const maybeResolve = () => {
        if (run.remaining === 0 && !run.settled) {
          run.settled = true;
          this.activeRun = null;
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

          run.events.push(event);

          if (event.type === 'tileCovered') {
            this.addStaticWater(run, segment, event);
          }

          const applied = this.applier.apply(event);
          run.castleFlooded ||= applied.castleFlooded;
          run.sandRedistributed ||= applied.sandRedistributed;
          if (applied.erodedTile) {
            run.erodedTiles.push(applied.erodedTile);
          }

          if (event.type === 'dissipated') {
            run.dissipatedSegments.add(segment);
            this.cleanupStaticWater(run, segment);
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

    if (run) {
      for (const segment of run.staticWaterBySegment.keys()) {
        this.cleanupStaticWater(run, segment);
      }
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
      events: run.events,
    };
  }

  private addStaticWater(
    run: ActiveWaveRun,
    segment: WaveSegment,
    event: Extract<WaveSegmentEvent, { type: 'tileCovered' }>,
  ): void {
    let waterForSegment = run.staticWaterBySegment.get(segment);
    if (!waterForSegment) {
      waterForSegment = new Set();
      run.staticWaterBySegment.set(segment, waterForSegment);
    }

    const addWater = (row: number, y: number): void => {
      const water = new StaticWaterActor({
        col: event.col,
        row,
        x: this.grid.gridLeft + event.col * this.grid.tileSize + this.grid.tileSize / 2,
        y,
        tileSize: this.grid.tileSize,
        depth: event.depth,
        alpha: event.alpha,
        owner: segment,
        image: this.waterImage,
      });
      waterForSegment.add(water);
      this.scene.add(water);
    };

    addWater(
      event.row,
      this.grid.gridTop + event.row * this.grid.tileSize + this.grid.tileSize / 2,
    );

    if (event.row === 0) {
      addWater(-1, this.grid.gridTop - this.grid.tileSize / 2);
    }
  }

  private cleanupStaticWater(run: ActiveWaveRun, segment: WaveSegment): void {
    const waterForSegment = run.staticWaterBySegment.get(segment);
    if (!waterForSegment) {
      return;
    }
    for (const water of waterForSegment) {
      water.cleanup();
    }
    waterForSegment.clear();
    run.staticWaterBySegment.delete(segment);
  }
}
