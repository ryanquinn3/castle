import type { FC, CSSProperties } from 'react';
import SandCounter from './SandCounter.tsx';
import CellInfoPanel from './CellInfoPanel.tsx';
import type { CellInfo } from '../model/terrain/terrain.ts';
import './hud.css';

interface HudProps {
  level: number;
  sandCount: number;
  planning: {
    selectedInfo: CellInfo | null;
    waveText: string;
  } | null;
  scale: number;
  gridLeft: number;
  gridPixelWidth: number;
  mapTop: number;
}

const HudComponent: FC<HudProps> = ({ level, sandCount, planning, scale, gridLeft, gridPixelWidth, mapTop }) => {
  const leftStyle: CSSProperties = {
    left: (gridLeft + 4) * scale,
    top: (mapTop + 4) * scale,
  };

  const rightStyle: CSSProperties = {
    left: (gridLeft + gridPixelWidth - 4) * scale,
    top: (mapTop + 4) * scale,
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
          <CellInfoPanel info={planning.selectedInfo} />
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
