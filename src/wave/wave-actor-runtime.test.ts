import { describe, expect, it, vi } from 'vitest';
import { WaveActorRuntime } from './wave-actor-runtime.ts';
import type { WaveEventApplyResult, WaveSegmentEvent, WaveSegmentGrid, WaveSegmentSpawn } from './wave-segment-types.ts';

vi.mock('./wave-overlay.ts', () => {
  class WaveOverlay {
    constructor(public readonly params: unknown) {}
  }
  return { WaveOverlay };
});

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

interface MockWaveSegment {
  grid: WaveSegmentGrid;
  terrainSlope: number;
  emit(event: WaveSegmentEvent): void;
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
    const runtime = new WaveActorRuntime(scene as never, runtimeGrid, applier as never, 0.5);

    const firstSpawn = spawn({ col: 0, x: 8 });
    const secondSpawn = spawn({ col: 1, x: 24 });
    const promise = runtime.playWave([firstSpawn, secondSpawn]);

    expect(scene.add).toHaveBeenCalledTimes(3); // 1 overlay + 2 segments
    expect(added).toHaveLength(3);
    expect(segment(added[1]).grid).toBe(runtimeGrid);
    expect(segment(added[1]).terrainSlope).toBe(0.5);

    const firstEvent: WaveSegmentEvent = { type: 'dissipated', col: 0, row: 1 };
    const secondEvent: WaveSegmentEvent = { type: 'dissipated', col: 1, row: 1 };
    segment(added[1]).emit(firstEvent);
    segment(added[2]).emit(secondEvent);

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
    const runtime = new WaveActorRuntime(scene as never, grid(), applier as never, 0.5);

    const promise = runtime.playWave([spawn()]);
    segment(added[1]).emit({ type: 'castleFlooded', col: 0, row: 2, depth: 2, alpha: 0.85 });
    segment(added[1]).emit({ type: 'blocked', col: 0, row: 2, depth: 1, alpha: 0.5 });
    segment(added[1]).emit({ type: 'dissipated', col: 0, row: 2 });

    await expect(promise).resolves.toMatchObject({
      castleFlooded: true,
      erodedTiles: [erodedTile],
      sandRedistributed: true,
    });

    // overlay removed when wave resolved naturally
    expect(scene.remove).toHaveBeenCalledTimes(1);
    expect(scene.remove).toHaveBeenCalledWith(added[0]); // overlay

    runtime.cleanup();
    // no additional removes: overlay already gone, segment already dissipated
    expect(scene.remove).toHaveBeenCalledTimes(1);
  });

  it('creates WaveOverlay on wave start and removes on cleanup', async () => {
    const added: unknown[] = [];
    const removed: unknown[] = [];
    const scene = {
      add: vi.fn<(actor: unknown) => void>(actor => {
        added.push(actor);
      }),
      remove: vi.fn<(actor: unknown) => void>(actor => {
        removed.push(actor);
      }),
    };
    const applier = {
      apply: vi.fn<(_: WaveSegmentEvent) => WaveEventApplyResult>(() => ({
        castleFlooded: false,
        erodedTile: null,
        sandRedistributed: false,
      })),
    };
    const runtime = new WaveActorRuntime(scene as never, grid(), applier as never, 0.5);

    runtime.playWave([spawn({ col: 0 }), spawn({ col: 1 })]);

    // 2 segments + 1 overlay = 3 adds
    expect(scene.add).toHaveBeenCalledTimes(3);
    const overlayActor = added[0]; // overlay is added first, before segments
    expect(overlayActor).not.toBeNull();

    runtime.cleanup();
    expect(removed).toContain(overlayActor);
  });

  it('overlay is removed when wave finishes (all segments dissipated)', async () => {
    const added: unknown[] = [];
    const removed: unknown[] = [];
    const scene = {
      add: vi.fn<(actor: unknown) => void>(actor => {
        added.push(actor);
      }),
      remove: vi.fn<(actor: unknown) => void>(actor => {
        removed.push(actor);
      }),
    };
    const applier = {
      apply: vi.fn<(_: WaveSegmentEvent) => WaveEventApplyResult>(() => ({
        castleFlooded: false,
        erodedTile: null,
        sandRedistributed: false,
      })),
    };
    const runtime = new WaveActorRuntime(scene as never, grid(), applier as never, 0.5);

    const promise = runtime.playWave([spawn({ col: 0 })]);

    // overlay added first, then segment
    const overlayActor = added[0];
    const segmentActor = added[1];

    segment(segmentActor).emit({ type: 'dissipated', col: 0, row: 1 });

    await promise;
    expect(removed).toContain(overlayActor);
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
    const runtime = new WaveActorRuntime(scene as never, grid(), applier as never, 0.5);

    const promise = runtime.playWave([spawn()]);
    const tileEntered: WaveSegmentEvent = { type: 'tileEntered', col: 0, row: 0, depth: 2, alpha: 0.85 };
    segment(added[1]).emit(tileEntered);

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
    expect(scene.remove).toHaveBeenCalledTimes(2); // overlay + 1 segment
    expect(scene.remove).toHaveBeenCalledWith(added[0]); // overlay
    expect(scene.remove).toHaveBeenCalledWith(added[1]); // segment
    expect(applier.apply).toHaveBeenCalledTimes(1);

    segment(added[1]).emit({ type: 'castleFlooded', col: 0, row: 1, depth: 2, alpha: 0.85 });
    expect(applier.apply).toHaveBeenCalledTimes(1);
    expect(result.events).toEqual([tileEntered]);
  });

});
