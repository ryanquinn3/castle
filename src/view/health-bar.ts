import { Actor, Color, GraphicsGroup, Rectangle, vec } from "excalibur";
import {
  HEALTH_BAR_BORDER_COLOR,
  HEALTH_BAR_BORDER_WIDTH,
  HEALTH_BAR_COLOR_AMBER,
  HEALTH_BAR_COLOR_GREEN,
  HEALTH_BAR_COLOR_RED,
  HEALTH_BAR_HEIGHT,
  HEALTH_BAR_INSET,
  HEALTH_BAR_THRESHOLD,
  HEALTH_BAR_Z,
} from "../config.ts";
import { HealthComponent } from "../model/terrain/health-component.ts";

function colorForFraction(fraction: number): Color {
  if (fraction > 0.75) {
    return Color.fromHex(HEALTH_BAR_COLOR_GREEN);
  }
  if (fraction > 0.25) {
    return Color.fromHex(HEALTH_BAR_COLOR_AMBER);
  }
  return Color.fromHex(HEALTH_BAR_COLOR_RED);
}

/**
 * A damage bar shown above a terrain tile. Added as a child actor, it inherits
 * the parent's transform and derives its bounds from the parent in onInitialize;
 * only the bar-specific bits (height, z, anchor, inset, colors) live here. Each
 * frame it reflects the parent's HealthComponent and hides itself at or above
 * HEALTH_BAR_THRESHOLD, so a full-health tile shows nothing.
 *
 * The bar is composed as a GraphicsGroup: a solid-black frame (innerWidth +
 * 2*border wide, HEALTH_BAR_HEIGHT + 2*border tall) sits behind the fill
 * Rectangle so the empty portion reads as a black track.
 */
export class HealthBar extends Actor {
  private fill?: Rectangle;
  private innerWidth = 0;
  private lastFraction = -1;

  override onInitialize(): void {
    // Inherit width/position from the parent tile; only the bar-specific
    // height/z/anchor/inset are ours.
    this.innerWidth = this.width - 2 * HEALTH_BAR_INSET;
    this.z = HEALTH_BAR_Z;
    this.graphics.anchor = vec(0, 0);
    this.pos = vec(
      -this.width / 2 + HEALTH_BAR_INSET,
      this.height / 2 - HEALTH_BAR_INSET,
    );

    const frameWidth = this.innerWidth + 2 * HEALTH_BAR_BORDER_WIDTH;
    const frameHeight = HEALTH_BAR_HEIGHT + 2 * HEALTH_BAR_BORDER_WIDTH;

    const frame = new Rectangle({
      width: frameWidth,
      height: frameHeight,
      color: Color.fromHex(HEALTH_BAR_BORDER_COLOR),
    });

    this.fill = new Rectangle({
      width: this.innerWidth,
      height: HEALTH_BAR_HEIGHT,
      color: Color.Green,
    });

    const group = new GraphicsGroup({
      members: [
        {
          graphic: frame,
          offset: vec(-HEALTH_BAR_BORDER_WIDTH, -HEALTH_BAR_BORDER_WIDTH),
        },
        { graphic: this.fill, offset: vec(0, 0) },
      ],
    });

    this.graphics.use(group);
    this.graphics.isVisible = false;
  }

  override onPostUpdate(): void {
    const health = this.parent?.get(HealthComponent);
    if (!health || !this.fill) {
      return;
    }
    if (health.fraction === this.lastFraction) {
      return;
    }
    this.lastFraction = health.fraction;
    this.fill.width = Math.max(0.001, this.innerWidth * health.fraction);
    this.fill.color = colorForFraction(health.fraction);
    this.graphics.isVisible =
      health.fraction > 0 && health.fraction < HEALTH_BAR_THRESHOLD;
  }
}
