import { describe } from "vitest";
import { expect, test } from "../test/excalibur-browser-test.ts";
import type { ExcaliburBrowserTestContext } from "../test/excalibur-browser-test-utils.ts";
import { WaveSegment } from "./wave-segment.ts";
import type {
  WaveSegmentEvent,
  WaveSegmentGrid,
  WaveSegmentSpawn,
} from "./wave-segment-types.ts";

function opacityOf(segment: WaveSegment): number | undefined {
  return segment.graphics.current?.opacity;
}

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
  test("starts each wave segment fully opaque", async ({ ctx }) => {
    const { segment: shallow } = await makeSegment(ctx, { initialDepth: 0.25 });
    const { segment: deep } = await makeSegment(ctx, { initialDepth: 12 });

    expect(opacityOf(shallow)).toBeCloseTo(0.85);
    expect(opacityOf(deep)).toBeCloseTo(0.85);
  });

  test("moving farther inland lowers sprite opacity", async ({ ctx }) => {
    const { segment } = await makeSegment(
      ctx,
      { initialDepth: 5 },
      { getElevation: () => 2 },
    );

    expect(opacityOf(segment)).toBeCloseTo(0.85);

    segment.pos.y = -8;
    ctx.step(16);

    expect(segment.currentDepth).toBe(3);
    expect(opacityOf(segment)).toBeLessThanOrEqual(0.85);
  });

  test("surges through rows and emits gameplay events", async ({ ctx }) => {
    const { segment, events } = await makeSegment(ctx);

    segment.pos.y = -8;
    ctx.step(16);
    segment.pos.y = 8;
    ctx.step(16);

    expect(events).toEqual([
      { type: "tileEntered", col: 1, row: 0, depth: 4, alpha: 0.85 },
      { type: "tileCovered", col: 1, row: 0, depth: 4, alpha: 0.85 },
      {
        type: "tileEntered",
        col: 1,
        row: 1,
        depth: 3.5,
        alpha: 0.6333333333333333,
      },
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

    expect(events).toContainEqual({
      type: "blocked",
      col: 1,
      row: 0,
      depth: 2,
      alpha: 0.85,
    });
    expect(segment.state).toBe("crashing");

    ctx.step(250);
    expect(segment.state).toBe("receding");

    segment.pos.y = -40;
    ctx.step(16);

    expect(segment.state).toBe("dead");
    expect(events[events.length - 1]).toEqual({
      type: "dissipated",
      col: 1,
      row: 0,
    });
    expect(segment.active).toBe(false);
  });

  test("recede velocity magnitude increases as segment nears the top water row", async ({
    ctx,
  }) => {
    // Use a deep grid so the crash happens far from the top water row,
    // giving a large recedeStartDistance to exercise the easing curve.
    // gridTop = 0, tileSize = 16, so getTopWaterRowY() = -16.
    // Crash at pos.y = 200 => leadingEdgeY = 200 + 12 = 212 (height = 16 + 2*4 = 24)
    // recedeStartDistance = 212 - (-16) = 228
    const { segment } = await makeSegment(
      ctx,
      { initialDepth: 2, recedeSpeed: -120, maxTravelDistance: 600 },
      {
        getElevation: () => 2,
        gridTop: 0,
        tileSize: 16,
        height: 20,
      },
    );

    // Crash the segment deep in the grid
    segment.pos.y = 200;
    ctx.step(16);
    expect(segment.state).toBe("crashing");

    ctx.step(250);
    expect(segment.state).toBe("receding");

    // Sample speed when deep (large remainingDistance, low progress => 1-progress near 1 => fast... wait)
    // With the fix: progress = 1 - remaining/recedeStart; easing uses 1-progress = remaining/recedeStart
    // Deep position (pos.y=180): leadingEdgeY=192, remaining=192-(-16)=208, progress=1-208/228≈0.088
    // 1-progress ≈ 0.912 => easedSpeed(120, 0.912) ≈ slow (high easing input)
    // Near top (pos.y=10): leadingEdgeY=22, remaining=22-(-16)=38, progress=1-38/228≈0.833
    // 1-progress ≈ 0.167 => easedSpeed(120, 0.167) ≈ fast (low easing input)
    segment.pos.y = 180;
    ctx.step(16);
    const deepSpeed = Math.abs(segment.vel.y);

    segment.pos.y = 10;
    ctx.step(16);
    const nearTopSpeed = Math.abs(segment.vel.y);

    expect(nearTopSpeed).toBeGreaterThan(deepSpeed);
  });

  test("castle entry emits castleFlooded and begins recession", async ({
    ctx,
  }) => {
    const { segment, events } = await makeSegment(
      ctx,
      {},
      { isCastle: () => true },
    );

    segment.pos.y = 8;
    ctx.step(16);

    expect(events).toEqual([
      { type: "tileEntered", col: 1, row: 0, depth: 4, alpha: 0.85 },
      { type: "castleFlooded", col: 1, row: 0, depth: 4, alpha: 0.85 },
    ]);
    expect(segment.state).toBe("crashing");

    ctx.step(250);
    expect(segment.state).toBe("receding");
  });
});
