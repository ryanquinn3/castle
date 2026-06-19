import { Actor } from "excalibur";
import { page } from "vitest/browser";
import { expect, test } from "../test/excalibur-browser-shared-test.ts";
import { HealthBar } from "./health-bar.ts";
import { HealthComponent } from "../model/terrain/health-component.ts";
import { TILE_SIZE } from "../config.ts";

function makeActorWithHealth(
  max: number,
  current: number,
): Actor {
  const actor = new Actor({ width: TILE_SIZE, height: TILE_SIZE });
  const health = new HealthComponent(max);
  health.current = current;
  actor.addComponent(health);
  return actor;
}

test("damaged actor shows bordered health bar", async ({ scene, clock }) => {
  const actor = makeActorWithHealth(100, 50);
  scene.add(actor);

  const bar = new HealthBar({ width: TILE_SIZE, height: TILE_SIZE });
  actor.addChild(bar);

  clock.step(16);

  expect(bar.graphics.isVisible).toBe(true);

  await page.screenshot();
});

test("full-health actor hides the health bar", async ({ scene, clock }) => {
  const actor = makeActorWithHealth(100, 100);
  scene.add(actor);

  const bar = new HealthBar({ width: TILE_SIZE, height: TILE_SIZE });
  actor.addChild(bar);

  clock.step(16);

  expect(bar.graphics.isVisible).toBe(false);
});

test("health bar hidden when fraction meets threshold", async ({
  scene,
  clock,
}) => {
  const actor = makeActorWithHealth(100, 99);
  scene.add(actor);

  const bar = new HealthBar({ width: TILE_SIZE, height: TILE_SIZE });
  actor.addChild(bar);

  clock.step(16);

  // fraction = 0.99 which equals HEALTH_BAR_THRESHOLD, so bar should be hidden
  expect(bar.graphics.isVisible).toBe(false);
});
