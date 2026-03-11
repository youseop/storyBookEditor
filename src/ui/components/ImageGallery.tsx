import React, { useState } from 'react';
import type { ExpressionCard, ImageMeta } from '../../shared/messageTypes';

interface ImageGalleryProps {
  generatedImages: Map<string, ImageMeta[]>;
  parsedCards: ExpressionCard[];
  onSwap: (expressionId: string, imageHash: string) => void;
  onRegen: (expressionId: string, customPrompt?: string) => void;
}

const ImageGallery: React.FC<ImageGalleryProps> = ({
  generatedImages,
  parsedCards,
  onSwap,
  onRegen,
}) => {
  const [regenExprId, setRegenExprId] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');

  if (generatedImages.size === 0) {
    return (
      <div className="placeholder">
        Image gallery will appear after generating images.
      </div>
    );
  }

  // Deduplicate: show one gallery entry per unique expression
  const uniqueCards = parsedCards.filter((card, idx) =>
    parsedCards.findIndex(c => c.id === card.id) === idx
  );

  return (
    <div className="image-gallery">
      {uniqueCards.map((card) => {
        const images = generatedImages.get(card.id) || [];
        if (images.length === 0) return null;

        return (
          <div key={card.id} className="gallery-card">
            <div className="gallery-card-header">
              <span className="gallery-card-label">{card.lines.join(' / ')}</span>
              <button
                className="btn btn-sm"
                onClick={() => {
                  if (regenExprId === card.id) {
                    setRegenExprId(null);
                    setCustomPrompt('');
                  } else {
                    setRegenExprId(card.id);
                    setCustomPrompt('');
                  }
                }}
              >
                + Regen
              </button>
            </div>

            <div className="gallery-thumbs">
              {images.map((img, idx) => (
                <div
                  key={img.imageHash}
                  className={`gallery-thumb ${img.isActive ? 'active' : ''}`}
                  onClick={() => onSwap(card.id, img.imageHash)}
                  title={img.isActive ? `Variant #${idx + 1} (active)` : `Variant #${idx + 1} — click to select`}
                >
                  {img.imageBase64 ? (
                    <img
                      src={`data:image/png;base64,${img.imageBase64}`}
                      alt={`Variant ${idx + 1}`}
                      className="gallery-thumb-img"
                    />
                  ) : (
                    <div className="gallery-thumb-placeholder">
                      #{idx + 1}
                    </div>
                  )}
                  {img.isActive && <div className="gallery-thumb-badge">Active</div>}
                </div>
              ))}
            </div>

            {regenExprId === card.id && (
              <div className="gallery-regen-form">
                <textarea
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  placeholder="Custom prompt (leave empty for default)"
                  rows={2}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      onRegen(card.id, customPrompt || undefined);
                      setRegenExprId(null);
                      setCustomPrompt('');
                    }}
                  >
                    Generate
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setRegenExprId(null);
                      setCustomPrompt('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ImageGallery;
