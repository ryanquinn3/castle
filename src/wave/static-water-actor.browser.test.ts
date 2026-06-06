import { describe } from "vitest";
import { expect, test } from "../test/excalibur-browser-test.ts";
import type { ExcaliburBrowserTestContext } from "../test/excalibur-browser-test-utils.ts";
import { Resources } from "../resources.ts";
import { StaticWaterActor } from "./static-water-actor.ts";
import { WaveSegment } from "./wave-segment.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave-segment-types.ts";

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

function grid(): WaveSegmentGrid {
  return {
    gridLeft: 0,
    gridTop: 0,
    tileSize: 16,
    height: 4,
    getElevation: () => 0,
    effectiveHoleDepth: () => 0,
    isCastle: () => false,
  };
}

function makeOwner(input: Partial<WaveSegmentSpawn> = {}): WaveSegment {
  return new WaveSegment(spawn(input), grid(), 0.5);
}

async function makeWater(
  ctx: ExcaliburBrowserTestContext,
  owner: WaveSegment,
): Promise<StaticWaterActor> {
  ctx.scene.add(owner);
  const water = new StaticWaterActor({
    col: 2,
    row: 3,
    x: 40,
    y: 56,
    tileSize: 16,
    depth: 4,
    owner,
    image: Resources.BeachTileset,
  });
  ctx.scene.add(water);
  ctx.step(16);
  return water;
}

function emitOwnerEvent(water: StaticWaterActor, owner: unknown): void {
  water.emit("precollision", { other: { owner } });
}

describe("StaticWaterActor browser behavior", () => {
  test("receding owner removes covered water", async ({ ctx }) => {
    const owner = makeOwner();
    const water = await makeWater(ctx, owner);

    owner.state = "receding";
    owner.pos.y = 64;

    emitOwnerEvent(water, owner);
    ctx.step(50);

    expect(water.active).toBe(false);
  });

  test("ignores non-owner and non-receding owner", async ({ ctx }) => {
    const owner = makeOwner();
    const water = await makeWater(ctx, owner);
    const other = makeOwner({ col: 3, x: 40 });
    ctx.scene.add(other);

    other.state = "receding";
    other.pos.y = 64;
    emitOwnerEvent(water, other);
    ctx.step(50);

    expect(water.active).toBe(true);

    owner.state = "surging";
    owner.pos.y = 64;
    emitOwnerEvent(water, owner);
    ctx.step(50);

    expect(water.active).toBe(true);
  });
});
