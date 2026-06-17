import { type FC, type CSSProperties } from 'react';
import SandCounter from './SandCounter.tsx';
import CellInfoPanel from './CellInfoPanel.tsx';
import type { CellInfo } from '../model/terrain/terrain.ts';
import './hud.css';

interface TideHudProps {
  wavesCompleted: number;
  best: number;
  countdown: number | null;
  sandCount: number;
  selectedInfo: CellInfo | null;
  scale: number;
  gridLeft: number;
  gridPixelWidth: number;
  mapTop: number;
}


const TideHudComponent: FC<TideHudProps> = ({ wavesCompleted, best, countdown, sandCount, selectedInfo, scale, gridLeft, gridPixelWidth, mapTop }) => {
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
        <div className="hud-panel__level">Waves: {wavesCompleted}</div>
        {best > 0 && (
          <div className="hud-panel__wave">Best: {best}</div>
        )}
        <SandCounter count={sandCount} />
      </div>
      <div className="hud-panel hud-panel--right" style={rightStyle}>
        {countdown !== null && (
          <div className="hud-panel__wave">Next wave: {countdown}s</div>
        )}
        <CellInfoPanel info={selectedInfo} />
      </div>
    </>
  );
};

export default TideHudComponent;
