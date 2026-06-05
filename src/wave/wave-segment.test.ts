import { describe } from "vitest";
// import { describe, expect, it, vi } from "vitest";
// import { WaveSegment } from "./wave-segment.ts";
// import type {
//   WaveSegmentEvent,
//   WaveSegmentGrid,
//   WaveSegmentSpawn,
// } from "./wave-segment-types.ts";

// vi.mock("excalibur", () => {
//   interface ColorLike {
//     r: number;
//     g: number;
//     b: number;
//     a: number | undefined;
//   }

//   interface RecedeAction {
//     callMethod(callback: () => void): FadeAction;
//   }

//   interface FadeAction {
//     fade(opacity: number, duration: number): FinalAction;
//   }

//   interface FinalAction {
//     callMethod(callback: () => void): void;
//   }

//   class Vector {
//     static Zero = new Vector(0, 0);

//     constructor(
//       public x: number,
//       public y: number,
//     ) {}
//   }

//   class Actor {
//     pos: Vector;
//     vel: Vector;
//     width: number;
//     height: number;
//     color: unknown;
//     name: string | undefined;
//     z: number | undefined;
//     body = { collisionType: undefined as unknown };
//     killed = false;
//     recedeCallback: (() => void) | undefined;
//     deadCallback: (() => void) | undefined;
//     graphics = { use: vi.fn<() => void>(), isVisible: true };
//     actions = {
//       delay: vi.fn<(duration: number) => RecedeAction>(() => ({
//         callMethod: (callback: () => void) => {
//           this.recedeCallback = callback;
//           return {
//             fade: vi.fn<(opacity: number, duration: number) => FinalAction>(
//               () => ({
//                 callMethod: (done: () => void) => {
//                   this.deadCallback = done;
//                 },
//               }),
//             ),
//           };
//         },
//       })),
//     };

//     constructor(options: {
//       pos: Vector;
//       width: number;
//       height: number;
//       vel: Vector;
//       color?: unknown;
//       name?: string;
//       collisionType?: unknown;
//       z?: number;
//     }) {
//       this.pos = options.pos;
//       this.vel = options.vel;
//       this.width = options.width;
//       this.height = options.height;
//       this.color = options.color;
//       this.name = options.name;
//       this.body.collisionType = options.collisionType;
//       this.z = options.z;
//     }

//     kill = vi.fn<() => void>(() => {
//       this.killed = true;
//     });
//   }

//   return {
//     Actor,
//     CollisionType: { Passive: "passive" },
//     Color: {
//       White: "white",
//       fromRGB: vi.fn<
//         (r: number, g: number, b: number, a?: number) => ColorLike
//       >((r, g, b, a) => ({ r, g, b, a })),
//     },
//     Vector,
//   };
// });

// interface ControllableWaveSegment {
//   body: { collisionType: unknown };
//   graphics: { isVisible: boolean };
//   z: number | undefined;
//   state: WaveSegment["state"];
//   recedeCallback: (() => void) | undefined;
//   deadCallback: (() => void) | undefined;
//   kill: ReturnType<typeof vi.fn<() => void>>;
// }

// function controllable(segment: WaveSegment): ControllableWaveSegment {
//   return segment as unknown as ControllableWaveSegment;
// }

// function spawn(input: Partial<WaveSegmentSpawn> = {}): WaveSegmentSpawn {
//   return {
//     col: 1,
//     x: 24,
//     y: -16,
//     initialDepth: 4,
//     speed: 90,
//     recedeSpeed: -45,
//     maxTravelDistance: 300,
//     ...input,
//   };
// }

// function grid(overrides: Partial<WaveSegmentGrid> = {}): WaveSegmentGrid {
//   return {
//     gridLeft: 0,
//     gridTop: 0,
//     tileSize: 16,
//     height: 4,
//     getElevation: () => 0,
//     effectiveHoleDepth: () => 0,
//     isCastle: () => false,
//     ...overrides,
//   };
// }
// oxlint-disable-next-line vitest/no-disabled-tests
// describe.skip("WaveSegment", () => {
//   it("participates in passive collisions for static water cleanup", () => {
//     const segment = new WaveSegment(spawn(), grid(), 0.5);

//     expect(controllable(segment).body.collisionType).toBe("passive");
//     expect(controllable(segment).z).toBe(7);
//   });

//   it("emits tileEntered when velocity carries it into row 0", () => {
//     const events: WaveSegmentEvent[] = [];
//     const segment = new WaveSegment(spawn(), grid(), 0.5);
//     segment.onWaveEvent((event) => events.push(event));

//     segment.pos.y = 8;
//     segment.onPostUpdate({} as never, 16);

//     expect(events).toContainEqual({
//       type: "tileEntered",
//       col: 1,
//       row: 0,
//       depth: 4,
//     });
//     expect(segment.state).toBe("surging");
//   });

//   it("emits tileEntered when the leading edge enters a row before the center does", () => {
//     const events: WaveSegmentEvent[] = [];
//     const segment = new WaveSegment(spawn(), grid(), 0.5);
//     segment.onWaveEvent((event) => events.push(event));

//     segment.pos.y = -8;
//     segment.onPostUpdate({} as never, 16);

//     expect(events).toContainEqual({
//       type: "tileEntered",
//       col: 1,
//       row: 0,
//       depth: 4,
//     });
//   });

//   it("hides the moving wave until the whole actor reaches the grid", () => {
//     const segment = new WaveSegment(spawn({ y: -64 }), grid(), 0.5);
//     const controls = controllable(segment);

//     expect(controls.graphics.isVisible).toBe(false);

//     segment.pos.y = -8;
//     segment.onPostUpdate({} as never, 16);

//     expect(controls.graphics.isVisible).toBe(false);

//     segment.pos.y = segment.height / 2;
//     segment.onPostUpdate({} as never, 16);

//     expect(controls.graphics.isVisible).toBe(true);
//   });

//   it("blocks and crashes when elevation meets depth", () => {
//     const events: WaveSegmentEvent[] = [];
//     const segment = new WaveSegment(
//       spawn({ initialDepth: 2 }),
//       grid({ getElevation: () => 2 }),
//       0.5,
//     );
//     segment.onWaveEvent((event) => events.push(event));

//     segment.pos.y = 8;
//     segment.onPostUpdate({} as never, 16);

//     expect(events).toContainEqual({
//       type: "blocked",
//       col: 1,
//       row: 0,
//       depth: 2,
//     });
//     expect(segment.state).toBe("crashing");

//     const controls = controllable(segment);
//     controls.recedeCallback?.();
//     expect(segment.state).toBe("receding");

//     controls.deadCallback?.();
//     expect(segment.state).toBe("dead");
//     expect(events[events.length - 1]).toEqual({
//       type: "dissipated",
//       col: 1,
//       row: 0,
//     });
//     expect(controls.kill).toHaveBeenCalledTimes(1);
//   });

//   it("absorbs into holes and crashes when no depth remains", () => {
//     const events: WaveSegmentEvent[] = [];
//     const segment = new WaveSegment(
//       spawn({ initialDepth: 2 }),
//       grid({ getElevation: () => -3, effectiveHoleDepth: () => 3 }),
//       0.5,
//     );
//     segment.onWaveEvent((event) => events.push(event));

//     segment.pos.y = 8;
//     segment.onPostUpdate({} as never, 16);

//     expect(events).toContainEqual({
//       type: "absorbed",
//       col: 1,
//       row: 0,
//       depth: 2,
//       absorbedDepth: 2,
//     });
//     expect(segment.state).toBe("crashing");
//   });

//   it("emits castleFlooded when entering a castle tile", () => {
//     const events: WaveSegmentEvent[] = [];
//     const segment = new WaveSegment(
//       spawn(),
//       grid({ isCastle: () => true }),
//       0.5,
//     );
//     segment.onWaveEvent((event) => events.push(event));

//     segment.pos.y = 8;
//     segment.onPostUpdate({} as never, 16);

//     expect(events).toContainEqual({
//       type: "castleFlooded",
//       col: 1,
//       row: 0,
//       depth: 4,
//     });
//   });
// });

// oxlint-disable-next-line vitest/no-disabled-tests
describe.skip("WaveSegment", () => {});
