import type { FC } from 'react';
import './title-menu.css';

interface TitleMenuProps {
  onSelectTide: () => void;
  onSelectClassic: () => void;
}

const TitleMenuComponent: FC<TitleMenuProps> = ({ onSelectTide, onSelectClassic }) => {
  return (
    <div className="title-menu">
      <div className="title-menu__panel">
        <h1 className="title-menu__title">Castle</h1>
        <p className="title-menu__subtitle">
          Dig moats and build walls to protect your castle from the rising tide.
        </p>
        <button className="title-menu__btn title-menu__btn--tide" onClick={onSelectTide}>
          Tide Mode
        </button>
        <button className="title-menu__btn title-menu__btn--classic" onClick={onSelectClassic}>
          Classic Mode
        </button>
      </div>
    </div>
  );
};

export default TitleMenuComponent;
