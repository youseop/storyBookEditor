import React, { useState } from 'react';
import type { ImageMeta } from '../../shared/messageTypes';

interface ImageSwapModalProps {
  expressionId: string;
  expressionLabel: string;
  images: ImageMeta[];
  onSwap: (imageHash: string) => void;
  onRegen: (customPrompt?: string) => void;
  onClose: () => void;
}

const ImageSwapModal: React.FC<ImageSwapModalProps> = ({
  expressionLabel,
  images,
  onSwap,
  onRegen,
  onClose,
}) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{expressionLabel}</h3>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>

        <div className="modal-body">
          <div className="variant-grid">
            {images.map((img, idx) => (
              <div
                key={img.imageHash}
                className={`variant-item ${img.isActive ? 'active' : ''}`}
                onClick={() => onSwap(img.imageHash)}
              >
                <div className="variant-label">
                  Variant #{idx + 1}
                  {img.isActive && ' (active)'}
                </div>
              </div>
            ))}
          </div>

          <div className="modal-actions">
            {!showPromptInput ? (
              <button
                className="btn"
                onClick={() => setShowPromptInput(true)}
              >
                + Regen with custom prompt
              </button>
            ) : (
              <div className="regen-form">
                <textarea
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  placeholder="Custom prompt (leave empty for default)"
                  rows={3}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      onRegen(customPrompt || undefined);
                      setShowPromptInput(false);
                      setCustomPrompt('');
                    }}
                  >
                    Generate
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setShowPromptInput(false);
                      setCustomPrompt('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageSwapModal;
