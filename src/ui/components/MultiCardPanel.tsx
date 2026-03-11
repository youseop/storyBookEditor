import React, { useState } from 'react';
import type { ImageMeta } from '../../shared/messageTypes';

interface MultiCardPanelProps {
  cards: Array<{ expressionId: string; korean: string; en: string }>;
  frameId: string;
  generatedImages: Map<string, ImageMeta[]>;
  apiKey: string;
  refFrameName: string;
  onRetranslate: (cards: Array<{ expressionId: string; korean: string }>) => Promise<void>;
  onRegenerateImages: (cards: Array<{ expressionId: string; korean: string; prompt: string }>) => Promise<void>;
  onSwap: (expressionId: string, imageHash: string) => void;
  onClose: () => void;
}

const MultiCardPanel: React.FC<MultiCardPanelProps> = ({
  cards, generatedImages, apiKey,
  onRetranslate, onRegenerateImages, onSwap, onClose,
}) => {
  const [isRetranslating, setIsRetranslating] = useState(false);
  const [showRetranslateConfirm, setShowRetranslateConfirm] = useState(false);
  const [showRegenPrompts, setShowRegenPrompts] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [prompts, setPrompts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    cards.forEach(c => {
      initial[c.expressionId] = c.korean.split('\n').map(l => l.split('=')[0].trim()).join(' ');
    });
    return initial;
  });

  const handleRetranslate = async () => {
    setShowRetranslateConfirm(false);
    setIsRetranslating(true);
    try {
      await onRetranslate(cards.map(c => ({ expressionId: c.expressionId, korean: c.korean })));
    } finally {
      setIsRetranslating(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerateImages(
        cards.map(c => ({
          expressionId: c.expressionId,
          korean: c.korean,
          prompt: prompts[c.expressionId] || '',
        }))
      );
    } finally {
      setIsRegenerating(false);
      setShowRegenPrompts(false);
    }
  };

  return (
    <div className="tab-content multi-card-panel">
      {/* Header */}
      <div className="multi-card-header">
        <span className="multi-card-badge">{cards.length} cards selected</span>
        <button className="btn-icon" onClick={onClose} title="Close">&times;</button>
      </div>

      {/* Tag bar */}
      <div className="multi-card-tags">
        {cards.map(c => (
          <span key={c.expressionId} className="multi-card-tag">
            {c.korean.split('\n')[0].substring(0, 20)}{c.korean.length > 20 ? '...' : ''}
          </span>
        ))}
      </div>

      {/* Translations section */}
      <div className="multi-card-section">
        <div className="multi-card-section-label">Translations</div>
        <div className="multi-card-translations">
          {cards.map(c => (
            <div key={c.expressionId} className="multi-card-translation-row">
              <span className="translation-ko">{c.korean.split('\n').join(' / ')}</span>
              <span className="translation-en">{c.en || '\u2014'}</span>
            </div>
          ))}
        </div>
        {showRetranslateConfirm ? (
          <div className="multi-card-confirm">
            <span className="multi-card-confirm-text">
              {cards.length}개 카드를 재번역할까요?
            </span>
            <div className="multi-card-confirm-actions">
              <button className="btn btn-primary btn-sm" onClick={handleRetranslate} disabled={isRetranslating}>
                {isRetranslating ? '번역 중...' : '확인'}
              </button>
              <button className="btn btn-sm" onClick={() => setShowRetranslateConfirm(false)} disabled={isRetranslating}>
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-sm"
            onClick={() => setShowRetranslateConfirm(true)}
            disabled={isRetranslating || !apiKey}
            style={{ marginTop: 8, width: '100%' }}
          >
            {isRetranslating ? '번역 중...' : '일괄 재번역'}
          </button>
        )}
      </div>

      {/* Images section */}
      <div className="multi-card-section">
        <div className="multi-card-section-label">Images</div>
        {cards.map(c => {
          const images = generatedImages.get(c.expressionId) || [];
          return (
            <div key={c.expressionId} className="multi-card-image-row">
              <div className="multi-card-image-label">
                {c.korean.split('\n')[0].substring(0, 30)}{c.korean.length > 30 ? '...' : ''}
              </div>
              {images.length > 0 ? (
                <div className="multi-card-image-scroll">
                  {images.map((img, idx) => (
                    <div
                      key={img.imageHash}
                      className={`multi-card-thumb ${img.isActive ? 'active' : ''}`}
                      onClick={() => onSwap(c.expressionId, img.imageHash)}
                      title={img.isActive ? `#${idx + 1} (active)` : `#${idx + 1}`}
                    >
                      {img.imageBase64 ? (
                        <img src={`data:image/png;base64,${img.imageBase64}`} alt={`#${idx + 1}`} />
                      ) : (
                        <div className="multi-card-thumb-ph">#{idx + 1}</div>
                      )}
                      {img.isActive && <div className="multi-card-thumb-badge">Active</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="multi-card-no-images">No images</div>
              )}
            </div>
          );
        })}

        {/* Regen prompts area */}
        {showRegenPrompts ? (
          <div className="multi-card-regen-prompts">
            {cards.map(c => (
              <div key={c.expressionId} className="multi-card-regen-prompt-row">
                <label className="multi-card-regen-label">
                  {c.korean.split('\n')[0].substring(0, 25)}{c.korean.length > 25 ? '...' : ''}
                </label>
                <input
                  type="text"
                  value={prompts[c.expressionId] || ''}
                  onChange={e => setPrompts(prev => ({ ...prev, [c.expressionId]: e.target.value }))}
                  placeholder="Image prompt"
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleRegenerate}
                disabled={isRegenerating}
                style={{ flex: 1 }}
              >
                {isRegenerating ? '생성 중...' : '생성 시작'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setShowRegenPrompts(false)}
                disabled={isRegenerating}
                style={{ flex: 1 }}
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-sm"
            onClick={() => setShowRegenPrompts(true)}
            disabled={isRegenerating || !apiKey}
            style={{ marginTop: 8, width: '100%' }}
          >
            일괄 이미지 재생성
          </button>
        )}
      </div>
    </div>
  );
};

export default MultiCardPanel;
