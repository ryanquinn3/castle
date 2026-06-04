import { Fragment, useEffect, type FC } from 'react';
import { ToolType } from '../tool-type.ts';
import ToolCostBadge from './ToolCostBadge.tsx';
import './toolbar.css';

interface SandEffect {
  amount: number;
  variant: 'earn' | 'spend';
}

interface ToolDef {
  type: ToolType;
  hotkeyLabel: string;
  spriteUrl: string;
  sandEffect?: SandEffect;
}

interface ToolbarProps {
  tools: ToolDef[];
  activeTool: ToolType;
  disabled: boolean;
  disabledTools: Set<ToolType>;
  onToolSelected: (tool: ToolType) => void;
}

const TOTAL_SLOTS = 5;

const ToolbarComponent: FC<ToolbarProps> = ({
  tools,
  activeTool,
  disabled,
  disabledTools,
  onToolSelected,
}) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (disabled) {
        return;
      }
      for (const tool of tools) {
        if (e.key === tool.hotkeyLabel && !disabledTools.has(tool.type)) {
          onToolSelected(tool.type);
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled, disabledTools, tools, onToolSelected]);

  const slots = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const tool = tools[i];
    const isActive = tool && tool.type === activeTool;
    const isToolDisabled = tool && disabledTools.has(tool.type);
    slots.push(
      <div
        key={i}
        className={`toolbar__slot ${isActive ? 'toolbar__slot--active' : ''} ${tool ? 'toolbar__slot--filled' : ''} ${isToolDisabled ? 'toolbar__slot--tool-disabled' : ''}`}
        onClick={() => {
          if (!disabled && tool && !isToolDisabled) {
            onToolSelected(tool.type);
          }
        }}
      >
        {tool && (
          <>
            <span className="toolbar__hotkey">{tool.hotkeyLabel}</span>
            <img className="toolbar__sprite" src={tool.spriteUrl} alt={tool.type} />
            {tool.sandEffect && (
              <ToolCostBadge amount={tool.sandEffect.amount} variant={tool.sandEffect.variant} />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <Fragment>
      <div className="toolbar__floating-label">Build Tools</div>
      <div className={`toolbar__slots ${disabled ? 'toolbar__slots--disabled' : ''}`}>{slots}</div>
    </Fragment>
  );
};

export default ToolbarComponent;
