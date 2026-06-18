import { Color, vec } from "excalibur";
import { page } from "vitest/browser";
import { test } from "../../test/excalibur-browser-shared-test.ts";

import { HealthComponent } from "./health-component.ts";
import { Terrain } from "../grid-model.ts";

class TestTerrain extends Terrain {
  elevation = 1;
  hp = 1;
  applyHits() {
    return null;
  }
  applyDelta() {
    return this;
  }
  describe() {
    return { title: "Test", stats: [] };
  }
  resetHits() {}
  serialize() {
    return { type: "test", height: 1 };
  }
  sprite = null;
  getRenderInfo() {
    return { sprite: null, tint: null };
  }
}

// Drive HP to current=1 (near zero) so visibility holds under any threshold tuning.
test("high health terrain health bar", async ({ scene, clock }) => {
  const canvasLocator = page.elementLocator(scene.engine.canvas);
  const wall = new TestTerrain({
    height: 100,
    width: 100,
    pos: vec(100, 100),
    color: Color.Gray,
  });
  const health = new HealthComponent(100);
  wall.addComponent(health);
  scene.camera.strategy.radiusAroundActor(wall, 1);
  scene.add(wall);
  clock.run(10, 16);
  health.current = 90;
  clock.run(10, 16);
  await canvasLocator.screenshot();
});

test("medium health terrain health bar", async ({ scene, clock }) => {
  const canvasLocator = page.elementLocator(scene.engine.canvas);
  const wall = new TestTerrain({
    height: 100,
    width: 100,
    pos: vec(100, 100),
    color: Color.Gray,
  });
  const health = new HealthComponent(100);
  wall.addComponent(health);
  scene.camera.strategy.radiusAroundActor(wall, 1);
  scene.add(wall);

  clock.run(10, 16);
  health.current = 50;
  clock.run(10, 16);

  await canvasLocator.screenshot();
});

test("low health terrain health bar", async ({ scene, clock }) => {
  const canvasLocator = page.elementLocator(scene.engine.canvas);
  const wall = new TestTerrain({
    height: 100,
    width: 100,
    pos: vec(100, 100),
    color: Color.Gray,
  });
  const health = new HealthComponent(100);
  wall.addComponent(health);
  scene.camera.strategy.radiusAroundActor(wall, 1);
  scene.add(wall);
  clock.run(10, 16);
  health.current = 10;
  clock.run(10, 16);
  await canvasLocator.screenshot();
});
