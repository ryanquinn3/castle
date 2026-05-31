import { Scene } from 'excalibur';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ToolType } from '../tool-type.ts';
import ToolbarComponent from '../ui/ToolbarComponent.tsx';
import { computeLayout, TILEMAP_SAND_ROWS, TOWER_COST } from '../config.ts';

export { ToolType };

const TOOL_DEFS = [
  { type: ToolType.Shovel, hotkeyLabel: '1', spriteUrl: './images/shovel-sprite.png', sandEffect: { amount: 1, variant: 'earn' as const } },
  { type: ToolType.Wall, hotkeyLabel: '2', spriteUrl: './images/wall-tool-sprite.png', sandEffect: { amount: 1, variant: 'spend' as const } },
  { type: ToolType.Tower, hotkeyLabel: '3', spriteUrl: './images/tower-sprite.png', sandEffect: { amount: TOWER_COST, variant: 'spend' as const } },
];

export class Toolbar {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private activeTool: ToolType = ToolType.Shovel;
  private _disabled = true;
  private _sandCount = 0;

  onToolSelected: ((tool: ToolType) => void) | null = null;

  get active(): ToolType {
    return this.activeTool;
  }

  get disabled(): boolean {
    return this._disabled;
  }

  activate(_scene: Scene): void {
    const { tileSize, gridLeft, gridTop, gridPixelWidth } = computeLayout(window);
    const sandBottom = gridTop + TILEMAP_SAND_ROWS * tileSize;

    this.container = document.createElement('div');
    this.container.style.setProperty('--toolbar-bottom', `${window.innerHeight - sandBottom + 5}px`);
    this.container.style.setProperty('--toolbar-center-x', `${gridLeft + gridPixelWidth / 2}px`);
    document.getElementById('game-ui')!.appendChild(this.container);
    this.root = createRoot(this.container);
    this.setDisabled(true);
    this.render();
  }

  selectTool(tool: ToolType): void {
    this.activeTool = tool;
    this.render();
    this.onToolSelected?.(tool);
  }

  setDisabled(disabled: boolean): void {
    this._disabled = disabled;
    this.render();
  }

  setSandCount(count: number): void {
    this._sandCount = count;
    this.render();
  }

  private getDisabledTools(): Set<ToolType> {
    const disabled = new Set<ToolType>();
    for (const tool of TOOL_DEFS) {
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
        activeTool: this.activeTool,
        disabled: this._disabled,
        disabledTools: this.getDisabledTools(),
        onToolSelected: (tool: ToolType) => this.selectTool(tool),
      })
    );
  }
}
