import { Actor, CollisionType } from "excalibur";
import { describe, expect, it } from "vitest";
import { Wall } from "./wall.ts";
import { FlatGround } from "./flat-ground.ts";
import { computeLayout } from "../../config.ts";

describe("Terrain as Actor", () => {
  it("is an Excalibur Actor", () => {
    expect(new FlatGround()).toBeInstanceOf(Actor);
  });

  it("positions itself from col/row on attach", () => {
    const wall = new Wall(1);
    wall.attach({ neighborsOf: () => ({ north: null, south: null, east: null, west: null }) }, 3, 2);
    const { tileSize, gridLeft, gridTop } = computeLayout(window);
    expect(wall.pos.x).toBe(gridLeft + (3 + 0.5) * tileSize);
    expect(wall.pos.y).toBe(gridTop + (2 + 0.5) * tileSize);
  });

  it("uses a passive collider", () => {
    expect(new FlatGround().body.collisionType).toBe(CollisionType.Passive);
  });
});
