import { describe, expect, it, vi } from 'vitest';
import { WaveActorRuntime } from './wave-actor-runtime.ts';
import type { WaveEventApplyResult, WaveSegmentEvent, WaveSegmentGrid, WaveSegmentSpawn } from './wave-segment-types.ts';

vi.mock('./wave-segment.ts', () => {
  type Listener = (event: WaveSegmentEvent) => void;

  class WaveSegment {
    readonly listeners = new Set<Listener>();

    constructor(
      _spawn: WaveSegmentSpawn,
      public readonly grid: WaveSegmentGrid,
      public readonly terrainSlope: number,
    ) {}

    onWaveEvent(listener: Listener): () => void {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }

    emit(event: WaveSegmentEvent): void {
      for (const listener of this.listeners) {
        listener(event);
      }
    }
  }

  return { WaveSegment };
});

vi.mock('./static-water-actor.ts', () => {
  class StaticWaterActor {
    cleaned = false;

    constructor(public readonly config: unknown) {}

    cleanup(): void {
      this.cleaned = true;
    }
  }

  return { StaticWaterActor };
});

interface MockWaveSegment {
  grid: WaveSegmentGrid;
  terrainSlope: number;
  emit(event: WaveSegmentEvent): void;
}

interface MockStaticWaterActor {
  config: {
    col: number;
    row: number;
    x: number;
    y: number;
    tileSize: number;
    depth: number;
    owner: MockWaveSegment;
    image: unknown;
  };
  cleaned: boolean;
}

function spawn(input: Partial<WaveSegmentSpawn> = {}): WaveSegmentSpawn {
  return {
    col: 0,
    x: 8,
    y: -16,
    initialDepth: 2,
    speed: 90,
    recedeSpeed: -45,
    maxTravelDistance: 200,
    ...input,
  };
}

function grid(): WaveSegmentGrid & { gridLeft: number } {
  return {
    gridLeft: 4,
    gridTop: 0,
    tileSize: 16,
    height: 4,
    getElevation: () => 0,
    effectiveHoleDepth: () => 0,
    isCastle: () => false,
  };
}

function segment(actor: unknown): MockWaveSegment {
  return actor as MockWaveSegment;
}

function staticWater(actor: unknown): MockStaticWaterActor {
  return actor as MockStaticWaterActor;
}

describe('WaveActorRuntime', () => {
  it('adds one segment per spawn and resolves when all emit dissipated', async () => {
    const added: unknown[] = [];
    const scene = {
      add: vi.fn<(actor: unknown) => void>(actor => {
        added.push(actor);
      }),
      remove: vi.fn<(actor: unknown) => void>(),
    };
    const applier = {
      apply: vi.fn<(_: WaveSegmentEvent) => WaveEventApplyResult>(() => ({
        castleFlooded: false,
        erodedTile: null,
        sandRedistributed: false,
      })),
    };
    const runtimeGrid = grid();
    const runtime = new WaveActorRuntime(scene as never, runtimeGrid, applier as never, 0.5, {} as never);

    const firstSpawn = spawn({ col: 0, x: 8 });
    const secondSpawn = spawn({ col: 1, x: 24 });
    const promise = runtime.playWave([firstSpawn, secondSpawn]);

    expect(scene.add).toHaveBeenCalledTimes(2);
    expect(added).toHaveLength(2);
    expect(segment(added[0]).grid).toBe(runtimeGrid);
    expect(segment(added[0]).terrainSlope).toBe(0.5);

    const firstEvent: WaveSegmentEvent = { type: 'dissipated', col: 0, row: 1 };
    const secondEvent: WaveSegmentEvent = { type: 'dissipated', col: 1, row: 1 };
    segment(added[0]).emit(firstEvent);
    segment(added[1]).emit(secondEvent);

    await expect(promise).resolves.toEqual({
      castleFlooded: false,
      erodedTiles: [],
      sandRedistributed: false,
      events: [firstEvent, secondEvent],
    });
    expect(applier.apply).toHaveBeenCalledTimes(2);
  });

  it('aggregates castle flooding and cleanup removes active actors', async () => {
    const added: unknown[] = [];
    const erodedTile = {};
    const scene = {
      add: vi.fn<(actor: unknown) => void>(actor => {
        added.push(actor);
      }),
      remove: vi.fn<(actor: unknown) => void>(),
    };
    const applier = {
      apply: vi.fn<(_: WaveSegmentEvent) => WaveEventApplyResult>(event => ({
        castleFlooded: event.type === 'castleFlooded',
        erodedTile: event.type === 'blocked' ? (erodedTile as never) : null,
        sandRedistributed: event.type === 'blocked',
      })),
    };
    const runtime = new WaveActorRuntime(scene as never, grid(), applier as never, 0.5, {} as never);

    const promise = runtime.playWave([spawn()]);
    segment(added[0]).emit({ type: 'castleFlooded', col: 0, row: 2, depth: 2 });
    segment(added[0]).emit({ type: 'blocked', col: 0, row: 2, depth: 1 });
    segment(added[0]).emit({ type: 'dissipated', col: 0, row: 2 });

    await expect(promise).resolves.toMatchObject({
      castleFlooded: true,
      erodedTiles: [erodedTile],
      sandRedistributed: true,
    });

    runtime.cleanup();
    expect(scene.remove).not.toHaveBeenCalled();
  });

  it('cleanup resolves an active wave and ignores late events', async () => {
    const added: unknown[] = [];
    const scene = {
      add: vi.fn<(actor: unknown) => void>(actor => {
        added.push(actor);
      }),
      remove: vi.fn<(actor: unknown) => void>(),
    };
    const applier = {
      apply: vi.fn<(_: WaveSegmentEvent) => WaveEventApplyResult>(() => ({
        castleFlooded: false,
        erodedTile: null,
        sandRedistributed: false,
      })),
    };
    const runtime = new WaveActorRuntime(scene as never, grid(), applier as never, 0.5, {} as never);

    const promise = runtime.playWave([spawn()]);
    const tileEntered: WaveSegmentEvent = { type: 'tileEntered', col: 0, row: 0, depth: 2 };
    segment(added[0]).emit(tileEntered);

    let settled = false;
    promise.then(() => {
      settled = true;
    });
    runtime.cleanup();
    await Promise.resolve();

    expect(settled).toBe(true);
    const result = await promise;
    expect(result).toEqual({
      castleFlooded: false,
      erodedTiles: [],
      sandRedistributed: false,
      events: [tileEntered],
    });
    expect(scene.remove).toHaveBeenCalledTimes(1);
    expect(scene.remove).toHaveBeenCalledWith(added[0]);
    expect(applier.apply).toHaveBeenCalledTimes(1);

    segment(added[0]).emit({ type: 'castleFlooded', col: 0, row: 1, depth: 2 });
    expect(applier.apply).toHaveBeenCalledTimes(1);
    expect(result.events).toEqual([tileEntered]);
  });

  it('creates static water on tileCovered and cleans it on segment dissipated', async () => {
    const added: unknown[] = [];
    const scene = {
      add: vi.fn<(actor: unknown) => void>(actor => {
        added.push(actor);
      }),
      remove: vi.fn<(actor: unknown) => void>(),
    };
    const applier = {
      apply: vi.fn<(_: WaveSegmentEvent) => WaveEventApplyResult>(() => ({
        castleFlooded: false,
        erodedTile: null,
        sandRedistributed: false,
      })),
    };
    const image = {};
    const runtimeGrid = grid();
    const runtime = new WaveActorRuntime(scene as never, runtimeGrid, applier as never, 0.5, image as never);

    const promise = runtime.playWave([spawn({ col: 3, x: 8 })]);
    const movingSegment = segment(added[0]);
    movingSegment.emit({ type: 'tileCovered', col: 3, row: 2, depth: 1.5 });

    expect(scene.add).toHaveBeenCalledTimes(2);
    const water = staticWater(added[1]);
    expect(water.config).toMatchObject({
      col: 3,
      row: 2,
      x: runtimeGrid.gridLeft + 3 * runtimeGrid.tileSize + runtimeGrid.tileSize / 2,
      y: 40,
      tileSize: 16,
      depth: 1.5,
      owner: movingSegment,
      image,
    });

    movingSegment.emit({ type: 'dissipated', col: 3, row: 2 });
    await promise;
    expect(water.cleaned).toBe(true);
  });

  it('cleanup removes active static water actors', async () => {
    const added: unknown[] = [];
    const scene = {
      add: vi.fn<(actor: unknown) => void>(actor => {
        added.push(actor);
      }),
      remove: vi.fn<(actor: unknown) => void>(),
    };
    const applier = {
      apply: vi.fn<(_: WaveSegmentEvent) => WaveEventApplyResult>(() => ({
        castleFlooded: false,
        erodedTile: null,
        sandRedistributed: false,
      })),
    };
    const runtime = new WaveActorRuntime(scene as never, grid(), applier as never, 0.5, {} as never);

    const promise = runtime.playWave([spawn()]);
    segment(added[0]).emit({ type: 'tileCovered', col: 0, row: 1, depth: 2 });
    const water = staticWater(added[1]);

    runtime.cleanup();
    await promise;

    expect(water.cleaned).toBe(true);
  });
});
