import {
  Scene,
  Actor,
  Color,
  Text,
  Font,
  Rectangle,
  Vector,
  Sprite,
  Keys,
} from 'excalibur';
import { Resources } from '../resources.ts';
import { computeLayout } from '../config.ts';

export enum ToolType {
  Shovel = 'shovel',
  Wall = 'wall',
}

interface ToolSlot {
  type: ToolType;
  hotkey: Keys;
  hotkeyLabel: string;
  sprite: Sprite;
}

const SLOT_SIZE = 48;
const SLOT_GAP = 4;
const SLOT_BORDER = 2;
const TOOLBAR_PADDING = 8;
const LABEL_HEIGHT = 16;
const TOTAL_SLOTS = 8;
const TOOLBAR_Z = 20;

export class Toolbar {
  private actors: Actor[] = [];
  private slotActors: Map<ToolType, Actor> = new Map();
  private borderActors: Map<ToolType, Actor> = new Map();
  private sandCountText: Text | null = null;
  private sandCountActor: Actor | null = null;
  private activeTool: ToolType = ToolType.Shovel;
  private _disabled = true;

  onToolSelected: ((tool: ToolType) => void) | null = null;

  private readonly tools: ToolSlot[] = [
    {
      type: ToolType.Shovel,
      hotkey: Keys.Digit1,
      hotkeyLabel: '1',
      sprite: Resources.Shovel.toSprite(),
    },
    {
      type: ToolType.Wall,
      hotkey: Keys.Digit2,
      hotkeyLabel: '2',
      sprite: Resources.WallTool.toSprite(),
    },
  ];

  get active(): ToolType {
    return this.activeTool;
  }

  get disabled(): boolean {
    return this._disabled;
  }

  activate(scene: Scene): void {
    const { canvasWidth, canvasHeight } = computeLayout(window);

    const toolbarWidth =
      TOOLBAR_PADDING +
      TOTAL_SLOTS * (SLOT_SIZE + SLOT_GAP) -
      SLOT_GAP +
      TOOLBAR_PADDING;
    const toolbarHeight = TOOLBAR_PADDING + SLOT_SIZE + TOOLBAR_PADDING;
    const toolbarX = (canvasWidth - toolbarWidth) / 2;
    const toolbarY = canvasHeight - toolbarHeight - LABEL_HEIGHT - 4;

    // "Build Tools" label
    const label = new Actor({
      x: canvasWidth / 2,
      y: toolbarY - 2,
      z: TOOLBAR_Z + 1,
      anchor: new Vector(0.5, 1),
    });
    label.graphics.use(
      new Text({
        text: 'Build Tools',
        color: Color.White,
        font: new Font({ size: 12 }),
      }),
    );
    scene.add(label);
    this.actors.push(label);

    // Background
    const bg = new Actor({
      x: toolbarX,
      y: toolbarY,
      z: TOOLBAR_Z,
      anchor: Vector.Zero,
    });
    bg.graphics.use(
      new Rectangle({
        width: toolbarWidth,
        height: toolbarHeight,
        color: Color.fromRGB(20, 20, 30, 0.85),
      }),
    );
    scene.add(bg);
    this.actors.push(bg);

    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const slotX =
        toolbarX +
        TOOLBAR_PADDING +
        i * (SLOT_SIZE + SLOT_GAP) +
        SLOT_SIZE / 2;
      const slotY = toolbarY + TOOLBAR_PADDING + SLOT_SIZE / 2;

      // Slot background
      const slotBg = new Actor({ x: slotX, y: slotY, z: TOOLBAR_Z + 1 });
      slotBg.graphics.use(
        new Rectangle({
          width: SLOT_SIZE,
          height: SLOT_SIZE,
          color: Color.fromRGB(40, 40, 50, 0.9),
        }),
      );
      scene.add(slotBg);
      this.actors.push(slotBg);

      const tool = this.tools[i];
      if (!tool) {
        continue;
      }

      // Border (highlight for active tool)
      const border = new Actor({ x: slotX, y: slotY, z: TOOLBAR_Z + 2 });
      border.graphics.use(
        new Rectangle({
          width: SLOT_SIZE + SLOT_BORDER * 2,
          height: SLOT_SIZE + SLOT_BORDER * 2,
          color: Color.Transparent,
        }),
      );
      scene.add(border);
      this.actors.push(border);
      this.borderActors.set(tool.type, border);

      // Tool sprite
      const spriteActor = new Actor({ x: slotX, y: slotY, z: TOOLBAR_Z + 3 });
      const sprite = tool.sprite.clone();
      const scale =
        (SLOT_SIZE - 8) / Math.max(sprite.width, sprite.height);
      spriteActor.scale = new Vector(scale, scale);
      spriteActor.graphics.use(sprite);
      scene.add(spriteActor);
      this.actors.push(spriteActor);
      this.slotActors.set(tool.type, spriteActor);

      // Click handler
      slotBg.on('pointerdown', () => {
        if (this._disabled) {
          return;
        }
        this.selectTool(tool.type);
      });

      // Hotkey number overlay (top-left corner)
      const hotkeyActor = new Actor({
        x: slotX - SLOT_SIZE / 2 + 8,
        y: slotY - SLOT_SIZE / 2 + 8,
        z: TOOLBAR_Z + 4,
      });
      hotkeyActor.graphics.use(
        new Text({
          text: tool.hotkeyLabel,
          color: Color.fromRGB(200, 200, 200),
          font: new Font({ size: 10 }),
        }),
      );
      scene.add(hotkeyActor);
      this.actors.push(hotkeyActor);

      // Sand count on wall tool (bottom-right corner)
      if (tool.type === ToolType.Wall) {
        this.sandCountText = new Text({
          text: '0',
          color: Color.fromRGB(255, 220, 100),
          font: new Font({ size: 11 }),
        });
        this.sandCountActor = new Actor({
          x: slotX + SLOT_SIZE / 2 - 6,
          y: slotY + SLOT_SIZE / 2 - 6,
          z: TOOLBAR_Z + 4,
          anchor: new Vector(1, 1),
        });
        this.sandCountActor.graphics.use(this.sandCountText);
        scene.add(this.sandCountActor);
        this.actors.push(this.sandCountActor);
      }
    }

    // Keyboard hotkeys
    scene.engine.input.keyboard.on('press', this.onKeyPress);

    this.updateHighlight();
    this.setDisabled(true);
  }

  private onKeyPress = (evt: { key: Keys }): void => {
    if (this._disabled) {
      return;
    }
    for (const tool of this.tools) {
      if (evt.key === tool.hotkey) {
        this.selectTool(tool.type);
        return;
      }
    }
  };

  selectTool(tool: ToolType): void {
    this.activeTool = tool;
    this.updateHighlight();
    this.onToolSelected?.(tool);
  }

  setDisabled(disabled: boolean): void {
    this._disabled = disabled;
    const opacity = disabled ? 0.4 : 1.0;
    for (const actor of this.actors) {
      actor.graphics.opacity = opacity;
    }
  }

  updateSandCount(count: number): void {
    if (this.sandCountText && this.sandCountActor) {
      this.sandCountText.text = String(count);
      this.sandCountActor.graphics.use(this.sandCountText);
    }
  }

  private updateHighlight(): void {
    for (const [type, border] of this.borderActors) {
      const color =
        type === this.activeTool
          ? Color.fromRGB(255, 220, 50)
          : Color.Transparent;
      border.graphics.use(
        new Rectangle({
          width: SLOT_SIZE + SLOT_BORDER * 2,
          height: SLOT_SIZE + SLOT_BORDER * 2,
          color,
        }),
      );
    }
  }

  deactivate(scene: Scene): void {
    scene.engine.input.keyboard.off('press', this.onKeyPress);
    for (const actor of this.actors) {
      scene.remove(actor);
    }
    this.actors = [];
    this.slotActors.clear();
    this.borderActors.clear();
    this.sandCountText = null;
    this.sandCountActor = null;
  }
}
