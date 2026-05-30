import type { FC, CSSProperties } from 'react';
import SandCounter from './SandCounter.tsx';
import './hud.css';

interface LayoutBounds {
  gridLeft: number;
  gridPixelWidth: number;
  mapTop: number;
}

interface HudProps {
  level: number;
  sandCount: number;
  planning: {
    stateText: string;
    waveText: string;
  } | null;
  layout: LayoutBounds;
}

const HudComponent: FC<HudProps> = ({ level, sandCount, planning, layout }) => {
  const leftStyle: CSSProperties = {
    left: layout.gridLeft + 4,
    top: layout.mapTop + 4,
  };

  const rightStyle: CSSProperties = {
    left: layout.gridLeft + layout.gridPixelWidth - 4,
    top: layout.mapTop + 4,
    transform: 'translateX(-100%)',
  };

  return (
    <>
      <div className="hud-panel hud-panel--left" style={leftStyle}>
        <div className="hud-panel__level">Level {level}</div>
        {planning && (
          <div className="hud-panel__wave">{planning.waveText}</div>
        )}
        <SandCounter count={sandCount} />
      </div>
      <div className="hud-panel hud-panel--right" style={rightStyle}>
        {planning ? (
          <div className="hud-panel__state" key="planning">
            {planning.stateText}
          </div>
        ) : (
          <div className="hud-panel__state hud-panel__state--dim" key="idle">
            Waiting...
          </div>
        )}
      </div>
    </>
  );
};

export default HudComponent;
