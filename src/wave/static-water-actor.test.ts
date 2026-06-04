import { describe, expect, it, vi } from 'vitest';
import { SpriteSheet } from 'excalibur';
import { StaticWaterActor } from './static-water-actor.ts';

vi.mock('excalibur', () => {
  class Vector {
    constructor(
      public x: number,
      public y: number,
    ) {}
  }

  class Actor {
    pos: Vector;
    width: number;
    height: number;
    z: number | undefined;
    name: string | undefined;
    body = { collisionType: undefined as unknown };
    graphics = { use: vi.fn<(graphic: unknown) => void>() };
    private handlers = new Map<string, (event: unknown) => void>();
    fadeCallback: (() => void) | undefined;
    actions = {
      fade: vi.fn<(opacity: number, duration: number) => { callMethod(callback: () => void): void }>(() => ({
        callMethod: (callback: () => void) => {
          this.fadeCallback = callback;
        },
      })),
    };

    constructor(options: { pos: Vector; width: number; height: number; z?: number; name?: string; collisionType?: unknown }) {
      this.pos = options.pos;
      this.width = options.width;
      this.height = options.height;
      this.z = options.z;
      this.name = options.name;
      this.body.collisionType = options.collisionType;
    }

    on(eventName: string, handler: (event: unknown) => void): void {
      this.handlers.set(eventName, handler);
    }

    emitEvent(eventName: string, otherOwner: unknown): void {
      this.handlers.get(eventName)?.({ other: { owner: otherOwner } });
    }

    emitCollision(otherOwner: unknown): void {
      this.emitEvent('collisionstart', otherOwner);
    }

    kill = vi.fn<() => void>();
  }

  return {
    Actor,
    CollisionType: { Passive: 'passive' },
    SpriteSheet: {
      fromImageSource: vi.fn<() => { getSprite: (col: number, row: number) => string }>(() => ({
        getSprite: vi.fn<(col: number, row: number) => string>((col, row) => `sprite-${col}-${row}`),
      })),
    },
    Vector,
  };
});

interface MockSegment {
  state: 'surging' | 'crashing' | 'receding' | 'dead';
}

type TestStaticWaterActor = StaticWaterActor & {
  body: { collisionType: unknown };
  emitEvent(eventName: string, otherOwner: unknown): void;
  emitCollision(otherOwner: unknown): void;
  fadeCallback: (() => void) | undefined;
  graphics: { use: ReturnType<typeof vi.fn<(graphic: unknown) => void>> };
  actions: { fade: ReturnType<typeof vi.fn<(opacity: number, duration: number) => { callMethod(callback: () => void): void }>> };
  kill: ReturnType<typeof vi.fn<() => void>>;
};

function actor(segment: MockSegment = { state: 'surging' }, input: Partial<ConstructorParameters<typeof StaticWaterActor>[0]> = {}) {
  return new StaticWaterActor({
    col: 2,
    row: 3,
    x: 40,
    y: 56,
    tileSize: 16,
    depth: 4,
    owner: segment as never,
    image: {} as never,
    ...input,
  }) as unknown as TestStaticWaterActor;
}

describe('StaticWaterActor', () => {
  it('uses a deterministic beach tileset water sprite', () => {
    const water = actor(undefined, { col: 5, row: 7 });

    expect(SpriteSheet.fromImageSource).toHaveBeenCalledWith({
      image: expect.any(Object),
      grid: {
        rows: 10,
        columns: 12,
        spriteWidth: 16,
        spriteHeight: 16,
      },
    });
    expect(water.graphics.use).toHaveBeenCalledWith('sprite-5-1');
    expect(water.col).toBe(5);
    expect(water.row).toBe(7);
    expect(water.depth).toBe(4);
    expect(water.body.collisionType).toBe('passive');
    expect(water.z).toBe(6);
  });

  it('creates separate sprite sheets for separate image sources', () => {
    const firstImage = { id: 'first' };
    const secondImage = { id: 'second' };
    const callsBefore = vi.mocked(SpriteSheet.fromImageSource).mock.calls.length;

    actor(undefined, { image: firstImage as never });
    actor(undefined, { image: secondImage as never });

    expect(SpriteSheet.fromImageSource).toHaveBeenCalledTimes(callsBefore + 2);
    expect(SpriteSheet.fromImageSource).toHaveBeenCalledWith(expect.objectContaining({ image: firstImage }));
    expect(SpriteSheet.fromImageSource).toHaveBeenCalledWith(expect.objectContaining({ image: secondImage }));
  });

  it('ignores its owner while the segment is still surging', () => {
    const segment: MockSegment = { state: 'surging' };
    const water = actor(segment);

    water.emitCollision(segment);

    expect(water.actions.fade).not.toHaveBeenCalled();
    expect(water.kill).not.toHaveBeenCalled();
  });

  it('removes itself by fade when its owning segment recedes into it', () => {
    const segment: MockSegment = { state: 'receding' };
    const water = actor(segment);

    water.emitCollision(segment);

    expect(water.actions.fade).toHaveBeenCalledWith(0, 120);
    water.fadeCallback?.();
    expect(water.kill).toHaveBeenCalledTimes(1);
  });

  it('removes itself on precollision when its owner starts receding while still overlapping', () => {
    const segment: MockSegment = { state: 'surging' };
    const water = actor(segment);

    water.emitCollision(segment);
    segment.state = 'receding';
    water.emitEvent('precollision', segment);

    expect(water.actions.fade).toHaveBeenCalledWith(0, 120);
    water.fadeCallback?.();
    expect(water.kill).toHaveBeenCalledTimes(1);
  });

  it('cleanup kills immediately when a recede fade is in progress', () => {
    const segment: MockSegment = { state: 'receding' };
    const water = actor(segment);

    water.emitCollision(segment);
    water.cleanup();

    expect(water.kill).toHaveBeenCalledTimes(1);

    water.fadeCallback?.();

    expect(water.kill).toHaveBeenCalledTimes(1);
  });

  it('ignores receding non-owner segments', () => {
    const owner: MockSegment = { state: 'receding' };
    const other: MockSegment = { state: 'receding' };
    const water = actor(owner);

    water.emitCollision(other);

    expect(water.actions.fade).not.toHaveBeenCalled();
    expect(water.kill).not.toHaveBeenCalled();
  });

  it('cleanup removes immediately and is idempotent', () => {
    const water = actor();

    water.cleanup();
    water.cleanup();

    expect(water.actions.fade).not.toHaveBeenCalled();
    expect(water.kill).toHaveBeenCalledTimes(1);
  });
});
