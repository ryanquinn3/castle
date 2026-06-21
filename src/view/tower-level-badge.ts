import {
  Actor,
  Color,
  Font,
  FontUnit,
  Text,
  vec,
  type ActorArgs,
} from "excalibur";
import {
  TOWER_BADGE_FONT_SIZE,
  TOWER_BADGE_INSET,
  TOWER_BADGE_Z,
} from "../config.ts";

/**
 * A small level-number badge shown at the bottom-right corner of an upgraded
 * tower tile. Added as a child actor (following the HealthBar pattern), so it
 * inherits the parent's transform. The level is fixed at construction time and
 * the text is set once in onInitialize — no per-frame update needed.
 *
 * Only attached for level >= 2; L1 towers show no badge.
 */
export class TowerLevelBadge extends Actor {
  private readonly level: number;

  constructor(args: ActorArgs & { level: number }) {
    super(args);
    this.level = args.level;
  }

  override onInitialize(): void {
    this.z = TOWER_BADGE_Z;
    this.pos = vec(
      this.width / 4 - TOWER_BADGE_INSET,
      this.height / 4 - TOWER_BADGE_INSET,
    );

    const label = new Text({
      text: String(this.level),
      font: new Font({
        size: TOWER_BADGE_FONT_SIZE,
        unit: FontUnit.Px,
        family: "monospace",
        color: Color.White,
        shadow: {
          offset: vec(1, 1),
          color: Color.Black,
        },
      }),
    });

    this.graphics.anchor = vec(0, 0);
    this.graphics.offset = vec(-TOWER_BADGE_INSET, -TOWER_BADGE_INSET);
    this.graphics.use(label);
  }
}
