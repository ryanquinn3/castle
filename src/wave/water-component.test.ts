import { describe, expect, it } from "vitest";
import { Vector } from "excalibur";
import { WaterComponent } from "./water-component.ts";

describe("WaterComponent", () => {
  it("stores depth and velocity", () => {
    const c = new WaterComponent(4, new Vector(0, 90));
    expect(c.depth).toBe(4);
    expect(c.velocity.x).toBe(0);
    expect(c.velocity.y).toBe(90);
  });

  it("defaults velocity to a zero vector", () => {
    const c = new WaterComponent(2);
    expect(c.velocity.x).toBe(0);
    expect(c.velocity.y).toBe(0);
  });

  it("depth is mutable", () => {
    const c = new WaterComponent(4);
    c.depth = 1.5;
    expect(c.depth).toBe(1.5);
  });
});
