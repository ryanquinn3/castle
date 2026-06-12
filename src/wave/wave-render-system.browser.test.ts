import { expect, test } from "../test/excalibur-browser-test.ts";
import { Entity, Vector } from "excalibur";
import { WaterComponent } from "./water-component.ts";
import { WaveOverlay } from "./wave-overlay.ts";
import { WaveRenderSystem } from "./wave-render-system.ts";

test("rasterizes WaterComponents into the overlay each tick", async ({ ctx }) => {
  const overlay = new WaveOverlay({ gridLeft: 0, gridTop: 32, tileSize: 16, width: 3, height: 6 });
  ctx.scene.add(overlay);

  ctx.scene.world.add(
    new WaveRenderSystem({ scene: ctx.scene, overlay, gridWidth: 3, gridHeight: 6, tileSize: 16 }),
  );
  ctx.scene.world.add(
    new Entity({ components: [new WaterComponent({ depth: 5, vel: new Vector(0, 1), col: 1, row: 2 })] }),
  );

  ctx.step(16);

  const data = overlay.debugImageData();
  expect(data).not.toBeNull();
  let maxAlpha = 0;
  for (let i = 3; i < data!.data.length; i += 4) {
    maxAlpha = Math.max(maxAlpha, data!.data[i]);
  }
  expect(maxAlpha).toBeGreaterThan(0);
});
