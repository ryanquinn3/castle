import type { FC } from 'react';
import type { CellInfo } from '../model/terrain/terrain.ts';
import './hud.css';

interface CellInfoPanelProps {
  info: CellInfo | null;
}

const CellInfoPanel: FC<CellInfoPanelProps> = ({ info }) => {
  if (!info) {
    return (
      <div className="cell-info">
        <div className="cell-info__title">Select a cell</div>
      </div>
    );
  }

  return (
    <div className="cell-info">
      <div className="cell-info__title">{info.title}</div>
      {info.stats.map((stat) => (
        <div className="cell-info__stat" key={stat.label}>
          <span className="cell-info__stat-label">{stat.label}</span>
          <span className="cell-info__stat-value">{stat.value}</span>
        </div>
      ))}
    </div>
  );
};

export default CellInfoPanel;
