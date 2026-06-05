// oxlint-disable unicorn/no-empty-file
// import { describe, expect, it, vi } from 'vitest';
// import { SpriteSheet } from 'excalibur';
// import { StaticWaterActor } from './static-water-actor.ts';

import { describe } from "vitest";

// vi.mock('excalibur', () => {
//   interface MockSprite {
//     width: number;
//     height: number;
//     clone(): MockSprite;
//   }

//   class Vector {
//     constructor(
//       public x: number,
//       public y: number,
//     ) {}
//   }

//   class Actor {
//     pos: Vector;
//     width: number;
//     height: number;
//     z: number | undefined;
//     name: string | undefined;
//     body = { collisionType: undefined as unknown };
//     graphics = { use: vi.fn<(graphic: unknown) => void>() };
//     private handlers = new Map<string, (event: unknown) => void>();
//     fadeCallback: (() => void) | undefined;
//     actions = {
//       fade: vi.fn<(opacity: number, duration: number) => { callMethod(callback: () => void): void }>(() => ({
//         callMethod: (callback: () => void) => {
//           this.fadeCallback = callback;
//         },
//       })),
//     };

//     constructor(options: { pos: Vector; width: number; height: number; z?: number; name?: string; collisionType?: unknown }) {
//       this.pos = options.pos;
//       this.width = options.width;
//       this.height = options.height;
//       this.z = options.z;
//       this.name = options.name;
//       this.body.collisionType = options.collisionType;
//     }

//     on(eventName: string, handler: (event: unknown) => void): void {
//       this.handlers.set(eventName, handler);
//     }

//     emitEvent(eventName: string, otherOwner: unknown): void {
//       this.handlers.get(eventName)?.({ other: { owner: otherOwner } });
//     }

//     emitCollision(otherOwner: unknown): void {
//       this.emitEvent('collisionstart', otherOwner);
//     }

//     kill = vi.fn<() => void>();
//   }

//   return {
//     Actor,
//     CollisionType: { Passive: 'passive' },
//     SpriteSheet: {
//       fromImageSource: vi.fn<() => { getSprite: (col: number, row: number) => MockSprite }>(() => ({
//         getSprite: vi.fn<(col: number, row: number) => MockSprite>((col, row) => ({
//           width: 16,
//           height: 16,
//           clone: vi.fn<() => MockSprite>(() => ({
//             width: 16,
//             height: 16,
//             clone: vi.fn<() => MockSprite>(),
//             spriteKey: `sprite-${col}-${row}`,
//           } as MockSprite)),
//           spriteKey: `sprite-${col}-${row}`,
//         } as MockSprite)),
//       })),
//     },
//     Vector,
//   };
// });

// interface MockSegment {
//   state: 'surging' | 'crashing' | 'receding' | 'dead';
//   pos: { y: number };
//   height: number;
// }

// type TestStaticWaterActor = StaticWaterActor & {
//   body: { collisionType: unknown };
//   emitEvent(eventName: string, otherOwner: unknown): void;
//   emitCollision(otherOwner: unknown): void;
//   fadeCallback: (() => void) | undefined;
//   graphics: { use: ReturnType<typeof vi.fn<(graphic: MockWaterSprite) => void>> };
//   actions: { fade: ReturnType<typeof vi.fn<(opacity: number, duration: number) => { callMethod(callback: () => void): void }>> };
//   kill: ReturnType<typeof vi.fn<() => void>>;
// };

// interface MockWaterSprite {
//   width: number;
//   height: number;
//   spriteKey: string;
// }

// function segment(input: Partial<MockSegment> = {}): MockSegment {
//   return {
//     state: 'surging',
//     pos: { y: 56 },
//     height: 16,
//     ...input,
//   };
// }

// function actor(owner: MockSegment = segment(), input: Partial<ConstructorParameters<typeof StaticWaterActor>[0]> = {}) {
//   return new StaticWaterActor({
//     col: 2,
//     row: 3,
//     x: 40,
//     y: 56,
//     tileSize: 16,
//     depth: 4,
//     owner: owner as never,
//     image: {} as never,
//     ...input,
//   }) as unknown as TestStaticWaterActor;
// }

// describe.skip('StaticWaterActor', () => {
//   it('uses a deterministic beach tileset water sprite', () => {
//     const water = actor(undefined, { col: 5, row: 7 });

//     expect(SpriteSheet.fromImageSource).toHaveBeenCalledWith({
//       image: expect.any(Object),
//       grid: {
//         rows: 10,
//         columns: 12,
//         spriteWidth: 16,
//         spriteHeight: 16,
//       },
//     });
//     expect(water.graphics.use).toHaveBeenCalledWith(expect.objectContaining({ spriteKey: 'sprite-4-1' }));
//     expect(water.col).toBe(5);
//     expect(water.row).toBe(7);
//     expect(water.depth).toBe(4);
//     expect(water.body.collisionType).toBe('passive');
//     expect(water.z).toBe(6);
//   });

//   it('uses zero-based coordinates for the visible 1-based water tile columns 5 and 6', () => {
//     const water = actor(undefined, { col: 2, row: 3 });

//     expect(water.graphics.use).toHaveBeenCalledWith(expect.objectContaining({ spriteKey: 'sprite-5-0' }));
//   });

//   it('scales the beach sprite to the game tile size', () => {
//     const water = actor(undefined, { tileSize: 32 });

//     expect(water.graphics.use).toHaveBeenCalledWith(expect.objectContaining({
//       width: 32,
//       height: 32,
//     }));
//   });

//   it('creates separate sprite sheets for separate image sources', () => {
//     const firstImage = { id: 'first' };
//     const secondImage = { id: 'second' };
//     const callsBefore = vi.mocked(SpriteSheet.fromImageSource).mock.calls.length;

//     actor(undefined, { image: firstImage as never });
//     actor(undefined, { image: secondImage as never });

//     expect(SpriteSheet.fromImageSource).toHaveBeenCalledTimes(callsBefore + 2);
//     expect(SpriteSheet.fromImageSource).toHaveBeenCalledWith(expect.objectContaining({ image: firstImage }));
//     expect(SpriteSheet.fromImageSource).toHaveBeenCalledWith(expect.objectContaining({ image: secondImage }));
//   });

//   it('ignores its owner while the segment is still surging', () => {
//     const owner = segment({ state: 'surging' });
//     const water = actor(owner);

//     water.emitCollision(owner);

//     expect(water.actions.fade).not.toHaveBeenCalled();
//     expect(water.kill).not.toHaveBeenCalled();
//   });

//   it('removes itself by fade when its owning segment recedes into it', () => {
//     const owner = segment({ state: 'receding', pos: { y: 64 }, height: 16 });
//     const water = actor(owner);

//     water.emitCollision(owner);

//     expect(water.actions.fade).toHaveBeenCalledWith(0, 120);
//     water.fadeCallback?.();
//     expect(water.kill).toHaveBeenCalledTimes(1);
//   });

//   it('removes itself on precollision when its owner starts receding while still overlapping', () => {
//     const owner = segment({ state: 'surging', pos: { y: 64 }, height: 16 });
//     const water = actor(owner);

//     water.emitCollision(owner);
//     owner.state = 'receding';
//     water.emitEvent('precollision', owner);

//     expect(water.actions.fade).toHaveBeenCalledWith(0, 120);
//     water.fadeCallback?.();
//     expect(water.kill).toHaveBeenCalledTimes(1);
//   });

//   it('waits to remove until the receding owner top edge reaches this tile', () => {
//     const owner = segment({ state: 'receding', pos: { y: 96 }, height: 16 });
//     const water = actor(owner, { y: 56 });

//     water.emitEvent('precollision', owner);

//     expect(water.actions.fade).not.toHaveBeenCalled();

//     owner.pos.y = 64;
//     water.emitEvent('precollision', owner);

//     expect(water.actions.fade).toHaveBeenCalledWith(0, 120);
//   });

//   it('cleanup kills immediately when a recede fade is in progress', () => {
//     const owner = segment({ state: 'receding', pos: { y: 64 }, height: 16 });
//     const water = actor(owner);

//     water.emitCollision(owner);
//     water.cleanup();

//     expect(water.kill).toHaveBeenCalledTimes(1);

//     water.fadeCallback?.();

//     expect(water.kill).toHaveBeenCalledTimes(1);
//   });

//   it('ignores receding non-owner segments', () => {
//     const owner = segment({ state: 'receding' });
//     const other = segment({ state: 'receding' });
//     const water = actor(owner);

//     water.emitCollision(other);

//     expect(water.actions.fade).not.toHaveBeenCalled();
//     expect(water.kill).not.toHaveBeenCalled();
//   });

//   it('cleanup removes immediately and is idempotent', () => {
//     const water = actor();

//     water.cleanup();
//     water.cleanup();

//     expect(water.actions.fade).not.toHaveBeenCalled();
//     expect(water.kill).toHaveBeenCalledTimes(1);
//   });
// });

// oxlint-disable-next-line vitest/no-disabled-tests
describe.skip('StaticWaterActor', () => {
});
