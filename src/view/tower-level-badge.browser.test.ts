import { Text } from "excalibur";
import { expect, test } from "../test/excalibur-browser-shared-test.ts";
import { Tower } from "../model/terrain/tower.ts";
import { TowerLevelBadge } from "./tower-level-badge.ts";

test("L2 tower has a TowerLevelBadge child with level text '2'", async ({ scene, clock }) => {
  const tower = new Tower(2);
  scene.add(tower);
  clock.run(5, 16);

  const badge = tower.children.find((c) => c instanceof TowerLevelBadge) as TowerLevelBadge | undefined;
  expect(badge).toBeDefined();
  const label = badge!.graphics.current as Text;
  expect(label).toBeInstanceOf(Text);
  expect(label.text).toBe("2");
});

test("L3 tower has a TowerLevelBadge child with level text '3'", async ({ scene, clock }) => {
  const tower = new Tower(3);
  scene.add(tower);
  clock.run(5, 16);

  const badge = tower.children.find((c) => c instanceof TowerLevelBadge) as TowerLevelBadge | undefined;
  expect(badge).toBeDefined();
  const label = badge!.graphics.current as Text;
  expect(label).toBeInstanceOf(Text);
  expect(label.text).toBe("3");
});

test("L1 tower has no TowerLevelBadge child", async ({ scene, clock }) => {
  const tower = new Tower(1);
  scene.add(tower);
  clock.run(5, 16);

  const badge = tower.children.find((c) => c instanceof TowerLevelBadge);
  expect(badge).toBeUndefined();
});
