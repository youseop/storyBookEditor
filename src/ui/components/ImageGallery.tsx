import React, { useState } from 'react';
import type { ExpressionCard, ImageMeta } from '../../shared/messageTypes';
import ImageSwapModal from './ImageSwapModal';

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
  const [selectedExprId, setSelectedExprId] = useState<string | null>(null);

  if (generatedImages.size === 0) {
    return (
      <div className="placeholder">
        Image gallery will appear after generating images.
      </div>
    );
  }

  const selectedImages = selectedExprId ? generatedImages.get(selectedExprId) || [] : [];
  const selectedCard = parsedCards.find(c => c.id === selectedExprId);

  return (
    <div>
      {parsedCards.map((card) => {
        const images = generatedImages.get(card.id) || [];
        if (images.length === 0) return null;
        const activeImage = images.find(img => img.isActive);
        return (
          <div key={card.id} className="gallery-item">
            <div className="gallery-item-header">
              <span className="gallery-item-label">{card.lines.join(' / ')}</span>
              <span className="gallery-item-count">{images.length} variant{images.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="gallery-item-actions">
              <button
                className="btn btn-sm"
                onClick={() => setSelectedExprId(card.id)}
              >
                Swap
              </button>
              <button
                className="btn btn-sm"
                onClick={() => onRegen(card.id)}
              >
                Regen
              </button>
            </div>
            {activeImage && (
              <div className="gallery-active-indicator">
                Active: variant #{activeImage.index + 1}
              </div>
            )}
          </div>
        );
      })}

      {selectedExprId && (
        <ImageSwapModal
          expressionId={selectedExprId}
          expressionLabel={selectedCard?.lines.join(' / ') || ''}
          images={selectedImages}
          onSwap={(imageHash) => {
            onSwap(selectedExprId, imageHash);
            setSelectedExprId(null);
          }}
          onRegen={(customPrompt) => {
            onRegen(selectedExprId, customPrompt);
          }}
          onClose={() => setSelectedExprId(null)}
        />
      )}
    </div>
  );
};

export default ImageGallery;
