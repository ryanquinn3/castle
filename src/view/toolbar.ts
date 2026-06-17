import { Scene } from 'excalibur';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ToolType } from '../tool-type.ts';
import ToolbarComponent from '../ui/ToolbarComponent.tsx';
import { TOWER_COST, WALL_LEVEL_COST } from '../config.ts';

export { ToolType };

const TOOL_DEFS = [
  { type: ToolType.Shovel, hotkeyLabel: '1', spriteUrl: './images/shovel-sprite.png', sandEffect: { amount: 1, variant: 'earn' as const } },
  { type: ToolType.Wall1, hotkeyLabel: '2', spriteUrl: './images/wall-tool-sprite.png', sandEffect: { amount: WALL_LEVEL_COST[0], variant: 'spend' as const } },
  { type: ToolType.Wall2, hotkeyLabel: '3', spriteUrl: './images/wall-tool-sprite.png', sandEffect: { amount: WALL_LEVEL_COST[1], variant: 'spend' as const } },
  { type: ToolType.Wall3, hotkeyLabel: '4', spriteUrl: './images/wall-tool-sprite.png', sandEffect: { amount: WALL_LEVEL_COST[2], variant: 'spend' as const } },
  { type: ToolType.Wall4, hotkeyLabel: '5', spriteUrl: './images/wall-tool-sprite.png', sandEffect: { amount: WALL_LEVEL_COST[3], variant: 'spend' as const } },
  { type: ToolType.Tower, hotkeyLabel: '6', spriteUrl: './images/tower-sprite.png', sandEffect: { amount: TOWER_COST, variant: 'spend' as const } },
];


export class Toolbar {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private _disabled = true;
  private _sandCount = 0;
  private enabledTools: Set<ToolType> | null = null;

  onToolTriggered: ((tool: ToolType) => void) | null = null;

  get disabled(): boolean {
    return this._disabled;
  }

  activate(_scene: Scene): void {
    this.container = document.createElement('div');
    document.getElementById('game-ui')!.appendChild(this.container);
    this.root = createRoot(this.container);
    this.render();
    this.setDisabled(true);
  }

  triggerTool(tool: ToolType): void {
    this.onToolTriggered?.(tool);
  }

  setDisabled(disabled: boolean): void {
    this._disabled = disabled;
    this.render();
  }

  setSandCount(count: number): void {
    this._sandCount = count;
    this.render();
  }

  setEnabledTools(tools: Set<ToolType> | null): void {
    this.enabledTools = tools;
    this.render();
  }

  private getDisabledTools(): Set<ToolType> {
    const disabled = new Set<ToolType>();
    for (const tool of TOOL_DEFS) {
      if (this.enabledTools === null || !this.enabledTools.has(tool.type)) {
        disabled.add(tool.type);
        continue;
      }
      if (tool.sandEffect?.variant === 'spend' && tool.sandEffect.amount > this._sandCount) {
        disabled.add(tool.type);
      }
    }
    return disabled;
  }

  deactivate(_scene: Scene): void {
    this.root?.unmount();
    this.root = null;
    this.container?.remove();
    this.container = null;
  }

  private render(): void {
    this.root?.render(
      createElement(ToolbarComponent, {
        tools: TOOL_DEFS,
        activeTool: null,
        disabled: this._disabled,
        disabledTools: this.getDisabledTools(),
        onToolSelected: (tool: ToolType) => this.triggerTool(tool),
      })
    );
  }
}
