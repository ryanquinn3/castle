import { Actor, Color, Engine, FadeInOut, Font, Scene, Text } from "excalibur";
import { computeLayout } from "./config.ts";

const { canvasWidth, canvasHeight } = computeLayout(window);

export class TitleScene extends Scene {
  override onInitialize(engine: Engine): void {
    const titleActor = new Actor({
      x: canvasWidth / 2,
      y: canvasHeight * 0.37,
    });
    titleActor.graphics.use(
      new Text({
        text: "Castle",
        color: Color.White,
        font: new Font({ size: 64 }),
      }),
    );
    this.add(titleActor);

    const subtitleActor = new Actor({
      x: canvasWidth / 2,
      y: canvasHeight * 0.52,
    });
    subtitleActor.graphics.use(
      new Text({
        text: "Dig moats and build walls to protect your castle from the rising tide.",
        color: Color.fromRGB(200, 200, 200),
        font: new Font({ size: 16 }),
      }),
    );
    this.add(subtitleActor);

    const fadeTransitions = {
      destinationIn: new FadeInOut({
        duration: 500,
        direction: "in" as const,
        color: Color.Black,
      }),
      sourceOut: new FadeInOut({
        duration: 500,
        direction: "out" as const,
        color: Color.Black,
      }),
    };

    const tideBtn = new Actor({
      x: canvasWidth / 2,
      y: canvasHeight * 0.6,

      width: 200,
      height: 30,
    });
    tideBtn.graphics.use(
      new Text({
        text: "Tide Mode",
        color: Color.fromRGB(100, 180, 255),
        font: new Font({ size: 20 }),
      }),
    );
    tideBtn.on("pointerdown", () => {
      void engine.goToScene("tide", { ...fadeTransitions });
    });
    this.add(tideBtn);
    const classicBtn = new Actor({
      x: canvasWidth / 2,
      y: canvasHeight * 0.7,
      width: 200,
      height: 30,
    });
    classicBtn.graphics.use(
      new Text({
        text: "Classic Mode",
        color: Color.fromRGB(160, 200, 160),
        font: new Font({ size: 20 }),
      }),
    );
    classicBtn.on("pointerdown", () => {
      void engine.goToScene("game", { ...fadeTransitions });
    });
    this.add(classicBtn);
  }
}
