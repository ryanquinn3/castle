import type { FC } from 'react';
import './hud.css';

interface HudProps {
  level: number;
  planning: {
    stateText: string;
    waveText: string;
  } | null;
}

const HudComponent: FC<HudProps> = ({ level, planning }) => {
  return (
    <div className="hud">
      <div className="hud__level">Level: {level}</div>
      {planning && (
        <>
          <div className="hud__state">{planning.stateText}</div>
          <div className="hud__wave">{planning.waveText}</div>
        </>
      )}
    </div>
  );
};

export default HudComponent;
