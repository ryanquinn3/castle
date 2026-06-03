import { useState, type FC } from 'react';
import { isMuted, toggleMuted } from '../sound.ts';
import './gameplay-controls.css';

interface GameplayControlsProps {
  isExitDialogOpen: boolean;
  onExitRequested: () => void;
  onExitCancelled: () => void;
  onExitConfirmed: () => void;
}

const SpeakerIcon: FC<{ muted: boolean }> = ({ muted }) => (
  <svg className="gameplay-controls__mute-icon" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M5 12h6l8-7v22l-8-7H5z" />
    <path d="M22 11c2 2 2 8 0 10" className="gameplay-controls__speaker-wave" />
    {muted && (
      <g className="gameplay-controls__mute-x">
        <path d="M23 11l6 6" />
        <path d="M29 11l-6 6" />
      </g>
    )}
  </svg>
);

const GameplayControlsComponent: FC<GameplayControlsProps> = ({
  isExitDialogOpen,
  onExitRequested,
  onExitCancelled,
  onExitConfirmed,
}) => {
  const [muted, setMuted] = useState(() => isMuted());

  return (
    <>
      <div className="gameplay-controls" aria-label="Gameplay controls">
        <button
          className="gameplay-controls__button gameplay-controls__button--icon"
          type="button"
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          aria-pressed={muted}
          onClick={() => setMuted(toggleMuted())}
        >
          <SpeakerIcon muted={muted} />
        </button>
        <button
          className="gameplay-controls__button gameplay-controls__button--text"
          type="button"
          onClick={onExitRequested}
        >
          Exit
        </button>
      </div>
      {isExitDialogOpen && (
        <div className="gameplay-controls-modal" role="presentation">
          <div className="gameplay-controls-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="gameplay-controls-exit-title">
            <h2 id="gameplay-controls-exit-title" className="gameplay-controls-modal__title">Exit to main menu?</h2>
            <p className="gameplay-controls-modal__body">Your current run will be lost.</p>
            <div className="gameplay-controls-modal__actions">
              <button className="gameplay-controls-modal__button" type="button" onClick={onExitCancelled}>
                Cancel
              </button>
              <button className="gameplay-controls-modal__button gameplay-controls-modal__button--danger" type="button" onClick={onExitConfirmed}>
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GameplayControlsComponent;
