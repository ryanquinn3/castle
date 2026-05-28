import { useEffect, type FC } from 'react';
import { ToolType } from '../tool-type.ts';
import './toolbar.css';

interface ToolDef {
  type: ToolType;
  hotkeyLabel: string;
  spriteUrl: string;
}

interface ToolbarProps {
  tools: ToolDef[];
  activeTool: ToolType;
  disabled: boolean;
  sandCount: number;
  onToolSelected: (tool: ToolType) => void;
}

const TOTAL_SLOTS = 8;

const ToolbarComponent: FC<ToolbarProps> = ({
  tools,
  activeTool,
  disabled,
  sandCount,
  onToolSelected,
}) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (disabled) {
        return;
      }
      for (const tool of tools) {
        if (e.key === tool.hotkeyLabel) {
          onToolSelected(tool.type);
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled, tools, onToolSelected]);

  const slots = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const tool = tools[i];
    const isActive = tool && tool.type === activeTool;
    slots.push(
      <div
        key={i}
        className={`toolbar__slot ${isActive ? 'toolbar__slot--active' : ''} ${tool ? 'toolbar__slot--filled' : ''}`}
        onClick={() => {
          if (!disabled && tool) {
            onToolSelected(tool.type);
          }
        }}
      >
        {tool && (
          <>
            <span className="toolbar__hotkey">{tool.hotkeyLabel}</span>
            <img className="toolbar__sprite" src={tool.spriteUrl} alt={tool.type} />
            {tool.type === ToolType.Wall && (
              <span className="toolbar__sand-count">{sandCount}</span>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`toolbar ${disabled ? 'toolbar--disabled' : ''}`}>
      <div className="toolbar__label">Build Tools</div>
      <div className="toolbar__slots">{slots}</div>
    </div>
  );
};

export default ToolbarComponent;
