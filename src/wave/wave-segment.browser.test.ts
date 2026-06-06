import { describe } from "vitest";
import { expect, test } from "../test/excalibur-browser-test.ts";
import type { ExcaliburBrowserTestContext } from "../test/excalibur-browser-test-utils.ts";
import { WaveSegment } from "./wave-segment.ts";
import type {
  WaveSegmentEvent,
  WaveSegmentGrid,
  WaveSegmentSpawn,
} from "./wave-segment-types.ts";

function spawn(input: Partial<WaveSegmentSpawn> = {}): WaveSegmentSpawn {
  return {
    col: 1,
    x: 24,
    y: -16,
    initialDepth: 4,
    speed: 90,
    recedeSpeed: -45,
    maxTravelDistance: 300,
    ...input,
  };
}

function grid(overrides: Partial<WaveSegmentGrid> = {}): WaveSegmentGrid {
  return {
    gridLeft: 0,
    gridTop: 0,
    tileSize: 16,
    height: 4,
    getElevation: () => 0,
    effectiveHoleDepth: () => 0,
    isCastle: () => false,
    ...overrides,
  };
}

async function makeSegment(
  ctx: ExcaliburBrowserTestContext,
  spawnInput: Partial<WaveSegmentSpawn> = {},
  gridInput: Partial<WaveSegmentGrid> = {},
): Promise<{ segment: WaveSegment; events: WaveSegmentEvent[] }> {
  const events: WaveSegmentEvent[] = [];
  const segment = new WaveSegment(spawn(spawnInput), grid(gridInput), 0.5);
  segment.onWaveEvent((event) => events.push(event));
  ctx.scene.add(segment);
  return { segment, events };
}

describe("WaveSegment browser behavior", () => {
  test("surges through rows and emits gameplay events", async ({ ctx }) => {
    const { segment, events } = await makeSegment(ctx);

    segment.pos.y = -8;
    ctx.step(16);
    segment.pos.y = 8;
    ctx.step(16);

    expect(events).toEqual([
      { type: "tileEntered", col: 1, row: 0, depth: 4 },
      { type: "tileCovered", col: 1, row: 0, depth: 3.5 },
      { type: "tileEntered", col: 1, row: 1, depth: 3.5 },
    ]);
    expect(segment.state).toBe("surging");
  });

  test("blocked wave crashes, recedes, and dissipates", async ({ ctx }) => {
    const { segment, events } = await makeSegment(
      ctx,
      { initialDepth: 2, recedeSpeed: -45 },
      { getElevation: () => 2 },
    );

    segment.pos.y = 8;
    ctx.step(16);

    expect(events).toContainEqual({ type: "blocked", col: 1, row: 0, depth: 2 });
    expect(segment.state).toBe("crashing");

    ctx.step(250);
    expect(segment.state).toBe("receding");

    segment.pos.y = -40;
    ctx.step(16);

    expect(segment.state).toBe("dead");
    expect(events[events.length - 1]).toEqual({ type: "dissipated", col: 1, row: 0 });
    expect(segment.active).toBe(false);
  });

  test("castle entry emits castleFlooded and begins recession", async ({ ctx }) => {
    const { segment, events } = await makeSegment(ctx, {}, { isCastle: () => true });

    segment.pos.y = 8;
    ctx.step(16);

    expect(events).toEqual([
      { type: "tileEntered", col: 1, row: 0, depth: 4 },
      { type: "castleFlooded", col: 1, row: 0, depth: 4 },
    ]);
    expect(segment.state).toBe("crashing");

    ctx.step(250);
    expect(segment.state).toBe("receding");
  });
});
