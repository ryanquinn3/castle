import { type FC, type CSSProperties } from 'react';
import SandCounter from './SandCounter.tsx';
import CellInfoPanel from './CellInfoPanel.tsx';
import type { CellInfo } from '../model/terrain/terrain.ts';
import './hud.css';

interface LayoutBounds {
  gridLeft: number;
  gridPixelWidth: number;
  mapTop: number;
}

interface TideHudProps {
  wavesCompleted: number;
  best: number;
  countdown: number;
  sandCount: number;
  selectedInfo: CellInfo | null;
  layout: LayoutBounds;
}


const TideHudComponent: FC<TideHudProps> = ({ wavesCompleted, best, countdown, sandCount, selectedInfo, layout }) => {
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
        <div className="hud-panel__level">Waves: {wavesCompleted}</div>
        {best > 0 && (
          <div className="hud-panel__wave">Best: {best}</div>
        )}
        <SandCounter count={sandCount} />
      </div>
      <div className="hud-panel hud-panel--right" style={rightStyle}>
        <div className="hud-panel__wave">Next wave: {countdown}s</div>
        <CellInfoPanel info={selectedInfo} />
      </div>
    </>
  );
};

export default TideHudComponent;
