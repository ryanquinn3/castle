import { Fragment, useEffect, type FC } from 'react';
import { ActionType } from '../action-type.ts';
import type { ActionView } from '../view/toolbar.ts';
import './toolbar.css';

interface ToolbarProps {
  actions: ActionView[] | null;
  disabled: boolean;
  onActionTriggered: (action: ActionType) => void;
}

function formatCost(sandEffect: ActionView['sandEffect']): string | null {
  if (!sandEffect) {
    return null;
  }
  if (sandEffect.variant === 'earn') {
    return `+${sandEffect.amount}`;
  }
  return `-${sandEffect.amount}`;
}

const ToolbarComponent: FC<ToolbarProps> = ({
  actions,
  disabled,
  onActionTriggered,
}) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (disabled || !actions) {
        return;
      }
      for (const action of actions) {
        if (e.key.toLowerCase() === action.hotkey.toLowerCase() && !action.disabled) {
          onActionTriggered(action.type);
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled, actions, onActionTriggered]);

  return (
    <Fragment>
      <div className="toolbar__floating-label">Actions</div>
      <div className={`toolbar__pills ${disabled ? 'toolbar__pills--disabled' : ''}`}>
        {actions === null ? (
          <div className="toolbar__empty-prompt">Select a cell</div>
        ) : (
          actions.map((action) => {
            const costText = formatCost(action.sandEffect);
            const costClass = action.sandEffect?.variant === 'earn'
              ? 'toolbar__pill-cost--earn'
              : 'toolbar__pill-cost--spend';
            return (
              <button
                key={action.type}
                className={`toolbar__pill ${action.disabled ? 'toolbar__pill--disabled' : ''}`}
                onClick={() => {
                  if (!disabled && !action.disabled) {
                    onActionTriggered(action.type);
                  }
                }}
                disabled={disabled || action.disabled}
              >
                <span className="toolbar__pill-hotkey">[{action.hotkey}]</span>
                <span className="toolbar__pill-label">{action.label}</span>
                {costText && (
                  <span className={`toolbar__pill-cost ${costClass}`}>{costText}</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </Fragment>
  );
};

export default ToolbarComponent;
