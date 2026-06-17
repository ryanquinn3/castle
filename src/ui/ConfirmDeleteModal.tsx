import { useEffect, type FC } from 'react';
import './confirm-delete-modal.css';

interface ConfirmDeleteModalProps {
  terrainType: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDeleteModal: FC<ConfirmDeleteModalProps> = ({ terrainType, onConfirm, onCancel }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onConfirm, onCancel]);

  return (
    <div className="confirm-delete-modal" role="presentation">
      <div
        className="confirm-delete-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
      >
        <h2 id="confirm-delete-title" className="confirm-delete-modal__title">
          Delete {terrainType}?
        </h2>
        <p className="confirm-delete-modal__body">No sand will be refunded.</p>
        <div className="confirm-delete-modal__actions">
          <button className="confirm-delete-modal__button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="confirm-delete-modal__button confirm-delete-modal__button--danger"
            type="button"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;
