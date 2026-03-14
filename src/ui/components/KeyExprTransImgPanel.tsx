import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { postToPlugin, usePluginMessage } from '../hooks/useFigmaMessages';
import { useGeminiApi } from '../hooks/useGeminiApi';
import type { ExpressionCard, ImageMeta, SandboxToUIMessage, ContentIdMap } from '../../shared/messageTypes';
import { CARD_EN_PLACEHOLDER } from '../../shared/constants';
import type { StoryPage } from '../../shared/pipeline';

interface KeyExprTransImgPanelProps {
  pages: StoryPage[];
  keyExpressions: Record<number, ExpressionCard[]>;
  onTranslationsUpdate: (pageIndex: number, cards: ExpressionCard[]) => void;
  styleDescription: string;
  apiKey: string;
  /** Per-page enLinesMap (pageIndex -> Map<expressionId, enLines>) */
  enLinesMaps: Record<number, Map<string, string[]>>;
  onEnLinesMapChange: (pageIndex: number, map: Map<string, string[]>) => void;
  /** Per-page frameId (pageIndex -> frameId string) */
  frameIds: Record<number, string | undefined>;
  /** Per-page contentIdMap (pageIndex -> ContentIdMap) */
  contentIdMaps: Record<number, ContentIdMap | undefined>;
  onContentIdMapChange: (pageIndex: number, map: ContentIdMap) => void;
  /** Reference image for style consistency */
  referenceImageBase64?: string;
}

/** Normalize text for contentIdMap keys. */
function normalizeText(lines: string[]): string {
  return lines.map(l => l.trim()).filter(l => l.length > 0).join('\n');
}

const KeyExprTransImgPanel: React.FC<KeyExprTransImgPanelProps> = ({
  pages,
  keyExpressions,
  onTranslationsUpdate,
  styleDescription,
  apiKey,
  enLinesMaps,
  onEnLinesMapChange,
  frameIds,
  contentIdMaps,
  onContentIdMapChange,
  referenceImageBase64,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [retranslatingId, setRetranslatingId] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<Map<string, ImageMeta[]>>(new Map());
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});
  const [regenExprId, setRegenExprId] = useState<string | null>(null);

  const nonEmptyPages = useMemo(() => pages.filter((p) => !p.isEmpty), [pages]);

  // Gemini API hook for real image generation and translation
  const gemini = useGeminiApi();

  // Collect all expression cards across all pages with their enLines
  const allExpressions = useMemo(() => {
    const result: { pageIndex: number; card: ExpressionCard; cardIdx: number }[] = [];
    nonEmptyPages.forEach((page) => {
      const cards = keyExpressions[page.pageIndex] ?? [];
      cards.forEach((card, ci) => {
        result.push({ pageIndex: page.pageIndex, card, cardIdx: ci });
      });
    });
    return result;
  }, [nonEmptyPages, keyExpressions]);

  const totalCards = allExpressions.length;

  // Count translations from enLinesMaps
  const translatedCount = useMemo(() => {
    let count = 0;
    allExpressions.forEach(({ pageIndex, card }) => {
      const map = enLinesMaps[pageIndex] || new Map<string, string[]>();
      const en = map.get(card.id);
      if (en && en.length > 0 && en.some(l => l !== '' && l !== CARD_EN_PLACEHOLDER)) {
        count++;
      }
    });
    return count;
  }, [allExpressions, enLinesMaps]);

  const imagesGeneratedCount = useMemo(() => {
    let count = 0;
    allExpressions.forEach(({ card }) => {
      if (generatedImages.has(card.id) && generatedImages.get(card.id)!.length > 0) {
        count++;
      }
    });
    return count;
  }, [allExpressions, generatedImages]);

  // Handle messages from sandbox
  usePluginMessage(useCallback((msg: SandboxToUIMessage) => {
    switch (msg.type) {
      case 'IMAGE_STORED': {
        const isFirstVariant = msg.index === 0;
        const thumbBase64 = gemini.getImageBase64(msg.expressionId, msg.index);
        setGeneratedImages((prev) => {
          const next = new Map(prev);
          const existing = next.get(msg.expressionId) || [];
          const meta: ImageMeta = {
            expressionId: msg.expressionId,
            imageHash: msg.imageHash,
            prompt: '',
            isActive: isFirstVariant && existing.length === 0,
            index: msg.index,
            imageBase64: thumbBase64,
          };
          next.set(msg.expressionId, [...existing, meta]);
          return next;
        });
        // Auto-assign first variant
        if (isFirstVariant) {
          // Find which frame this expression belongs to
          const exprEntry = allExpressions.find(e => e.card.id === msg.expressionId);
          const frameId = exprEntry ? frameIds[exprEntry.pageIndex] : undefined;
          postToPlugin({
            type: 'ASSIGN_IMAGE',
            expressionId: msg.expressionId,
            imageHash: msg.imageHash,
            frameId,
          });
          // Update contentIdMap with image index
          if (exprEntry) {
            const contentIdMap = contentIdMaps[exprEntry.pageIndex];
            postToPlugin({
              type: 'UPDATE_CONTENT_ID_MAP',
              entries: [{
                normalizedText: normalizeText(exprEntry.card.lines),
                expressionId: parseInt(exprEntry.card.id),
                imageIndex: msg.index,
              }],
              frameId,
            });
          }
        }
        break;
      }
      case 'IMAGE_THUMBNAIL': {
        setGeneratedImages(prev => {
          const next = new Map(prev);
          const images = next.get(msg.expressionId);
          if (images) {
            next.set(msg.expressionId, images.map(img =>
              img.imageHash === msg.imageHash
                ? { ...img, imageBase64: msg.imageBase64 }
                : img
            ));
          }
          return next;
        });
        break;
      }
      case 'ERROR':
        setError(msg.message + (msg.detail ? `: ${msg.detail}` : ''));
        break;
    }
  }, [gemini, allExpressions, frameIds, contentIdMaps]));

  // --- Translation using real geminiService ---
  const handleTranslateAll = useCallback(async () => {
    if (!apiKey) {
      setError('API 키가 설정되지 않았습니다.');
      return;
    }
    if (totalCards === 0) {
      setError('번역할 Key Expression이 없습니다.');
      return;
    }

    setIsTranslating(true);
    setError(null);

    try {
      // Collect untranslated cards per page, deduplicating by expressionId
      const seenIds = new Set<string>();
      const cardsToTranslate: { id: string; koreanText: string; pageIndex: number }[] = [];

      for (const { pageIndex, card } of allExpressions) {
        if (seenIds.has(card.id)) continue;
        seenIds.add(card.id);

        const map = enLinesMaps[pageIndex] || new Map<string, string[]>();
        const en = map.get(card.id);
        if (en && en.length > 0 && en.some(l => l !== '' && l !== CARD_EN_PLACEHOLDER)) {
          continue; // Already translated
        }
        cardsToTranslate.push({
          id: card.id,
          koreanText: card.lines.map(l => l.split('=')[0].trim()).join(' '),
          pageIndex,
        });
      }

      if (cardsToTranslate.length === 0) {
        setError('모든 표현이 이미 번역되었습니다.');
        setIsTranslating(false);
        return;
      }

      // Use gemini.translate (the real translateExpressions via geminiService)
      const translationMap = await gemini.translate(
        apiKey,
        cardsToTranslate.map(c => ({ id: c.id, koreanText: c.koreanText })),
      );

      // Update enLinesMaps per page
      const pageUpdates = new Map<number, Map<string, string[]>>();

      for (const item of cardsToTranslate) {
        const en = translationMap.get(item.id);
        if (!en) continue;

        if (!pageUpdates.has(item.pageIndex)) {
          pageUpdates.set(item.pageIndex, new Map(enLinesMaps[item.pageIndex] || new Map()));
        }
        pageUpdates.get(item.pageIndex)!.set(item.id, en);
      }

      // Apply page-level updates
      for (const [pageIndex, newMap] of pageUpdates) {
        onEnLinesMapChange(pageIndex, newMap);

        // Update cards with enLines for parent
        const cards = keyExpressions[pageIndex] ?? [];
        const updatedCards = cards.map(card => {
          const en = newMap.get(card.id);
          return en ? { ...card, enLines: en } : card;
        });
        onTranslationsUpdate(pageIndex, updatedCards);

        // Send UPDATE_CARD_TRANSLATIONS to sandbox
        const frameId = frameIds[pageIndex];
        if (frameId) {
          const updates = cards
            .filter(card => translationMap.has(card.id))
            .map(card => ({
              expressionId: card.id,
              enText: translationMap.get(card.id)!.join(' '),
            }));
          if (updates.length > 0) {
            postToPlugin({
              type: 'UPDATE_CARD_TRANSLATIONS',
              cards: updates,
              frameId,
            });
          }
        }

        // Update contentIdMap with translations
        const entries = cards
          .filter(card => translationMap.has(card.id))
          .map(card => ({
            normalizedText: normalizeText(card.lines),
            expressionId: parseInt(card.id),
            en: translationMap.get(card.id)!.join(' '),
          }));
        if (entries.length > 0) {
          postToPlugin({
            type: 'UPDATE_CONTENT_ID_MAP',
            entries,
            frameId: frameIds[pageIndex],
          });
        }
      }
    } catch (err: any) {
      setError('번역 실패: ' + (err.message || String(err)));
    } finally {
      setIsTranslating(false);
    }
  }, [apiKey, totalCards, allExpressions, enLinesMaps, gemini, onEnLinesMapChange, keyExpressions, onTranslationsUpdate, frameIds]);

  // Retranslate a single card
  const handleRetranslateCard = useCallback(async (cardId: string, pageIndex: number) => {
    if (!apiKey) return;
    const cards = keyExpressions[pageIndex] ?? [];
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    setRetranslatingId(cardId);
    setError(null);

    try {
      const koreanText = card.lines.map(l => l.split('=')[0].trim()).join(' ');
      const translationMap = await gemini.translate(apiKey, [{ id: cardId, koreanText }]);
      const en = translationMap.get(cardId);
      if (!en) return;

      // Update enLinesMap
      const currentMap = new Map(enLinesMaps[pageIndex] || new Map<string, string[]>());
      currentMap.set(cardId, en);
      onEnLinesMapChange(pageIndex, currentMap);

      // Update parent
      const updatedCards = cards.map(c =>
        c.id === cardId ? { ...c, enLines: en } : c
      );
      onTranslationsUpdate(pageIndex, updatedCards);

      // Update canvas
      const frameId = frameIds[pageIndex];
      if (frameId) {
        postToPlugin({
          type: 'UPDATE_CARD_EN',
          expressionId: cardId,
          enText: en.join(' '),
          frameId,
        });
      }

      // Update contentIdMap
      postToPlugin({
        type: 'UPDATE_CONTENT_ID_MAP',
        entries: [{
          normalizedText: normalizeText(card.lines),
          expressionId: parseInt(card.id),
          en: en.join(' '),
        }],
        frameId: frameIds[pageIndex],
      });
    } catch (err: any) {
      setError('재번역 실패: ' + (err.message || String(err)));
    } finally {
      setRetranslatingId(null);
    }
  }, [apiKey, keyExpressions, gemini, enLinesMaps, onEnLinesMapChange, onTranslationsUpdate, frameIds]);

  // --- Edit individual English translation ---
  const handleEnglishEdit = useCallback(
    (pageIndex: number, cardId: string, value: string) => {
      const currentMap = new Map(enLinesMaps[pageIndex] || new Map<string, string[]>());
      currentMap.set(cardId, value.split('\n'));
      onEnLinesMapChange(pageIndex, currentMap);

      // Update parent cards
      const existingCards = keyExpressions[pageIndex] ?? [];
      const updatedCards = existingCards.map((card) => {
        if (card.id === cardId) {
          return { ...card, enLines: value.split('\n') };
        }
        return card;
      });
      onTranslationsUpdate(pageIndex, updatedCards);
    },
    [enLinesMaps, keyExpressions, onTranslationsUpdate, onEnLinesMapChange],
  );

  // --- Image generation using real useGeminiApi ---
  const handleGenerateAllImages = useCallback(async () => {
    if (!apiKey) {
      setError('API 키가 설정되지 않았습니다.');
      return;
    }
    if (totalCards === 0) {
      setError('이미지 생성할 Key Expression이 없습니다.');
      return;
    }

    setError(null);

    // Collect cards that need images, deduplicating by expressionId
    const seenIds = new Set<string>();
    const cardsToGenerate: ExpressionCard[] = [];
    // Track which frameId to use per expression
    const exprFrameIds: Record<string, string | undefined> = {};

    for (const { pageIndex, card } of allExpressions) {
      if (seenIds.has(card.id)) continue;
      seenIds.add(card.id);

      // Skip if already has images
      if (generatedImages.has(card.id) && generatedImages.get(card.id)!.length > 0) continue;

      // Check contentIdMap for existing images
      const contentIdMap = contentIdMaps[pageIndex];
      if (contentIdMap) {
        const key = normalizeText(card.lines);
        const entry = contentIdMap[key];
        if (entry && entry.imageIndex !== undefined) continue;
      }

      cardsToGenerate.push(card);
      exprFrameIds[card.id] = frameIds[pageIndex];
    }

    if (cardsToGenerate.length === 0) {
      setError('모든 표현에 이미 이미지가 있습니다.');
      return;
    }

    // Use the first available frameId for bulk generation
    const firstFrameId = Object.values(frameIds).find(f => f);

    gemini.generateAll(apiKey, cardsToGenerate, referenceImageBase64, firstFrameId);
  }, [apiKey, totalCards, allExpressions, generatedImages, contentIdMaps, frameIds, gemini, referenceImageBase64]);

  // --- Single image regeneration ---
  const handleRegenerate = useCallback(async (cardId: string) => {
    if (!apiKey) return;

    const exprEntry = allExpressions.find(e => e.card.id === cardId);
    if (!exprEntry) return;

    setRegenExprId(null);
    setError(null);

    try {
      const existingCount = generatedImages.get(cardId)?.length || 0;
      const frameId = frameIds[exprEntry.pageIndex];
      await gemini.generateSingle(
        apiKey,
        exprEntry.card,
        customPrompts[cardId] || undefined,
        referenceImageBase64,
        existingCount,
        frameId,
      );
    } catch (err: any) {
      setError('이미지 재생성 실패: ' + (err.message || String(err)));
    }
  }, [apiKey, allExpressions, generatedImages, frameIds, gemini, customPrompts, referenceImageBase64]);

  // --- Swap image ---
  const handleSwapImage = useCallback((expressionId: string, imageHash: string) => {
    const exprEntry = allExpressions.find(e => e.card.id === expressionId);
    const frameId = exprEntry ? frameIds[exprEntry.pageIndex] : undefined;

    postToPlugin({
      type: 'SWAP_IMAGE',
      expressionId,
      newImageHash: imageHash,
      frameId,
    });

    setGeneratedImages(prev => {
      const next = new Map(prev);
      const images = next.get(expressionId);
      if (images) {
        next.set(expressionId, images.map(img => ({
          ...img,
          isActive: img.imageHash === imageHash,
        })));
      }
      return next;
    });

    // Update contentIdMap with new image index
    if (exprEntry) {
      const images = generatedImages.get(expressionId);
      const swappedImg = images?.find(img => img.imageHash === imageHash);
      if (swappedImg) {
        postToPlugin({
          type: 'UPDATE_CONTENT_ID_MAP',
          entries: [{
            normalizedText: normalizeText(exprEntry.card.lines),
            expressionId: parseInt(exprEntry.card.id),
            imageIndex: swappedImg.index,
          }],
          frameId,
        });
      }
    }
  }, [allExpressions, frameIds, generatedImages]);

  // --- Styles ---
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 12,
    fontFamily: 'inherit',
    color: '#333',
    fontSize: 12,
  };

  const headerStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 4,
  };

  const sectionStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    borderRadius: 6,
    padding: 10,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };

  const btnPrimaryStyle: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    background: '#18A0FB',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    width: '100%',
  };

  const btnOutlineStyle: React.CSSProperties = {
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: '#18A0FB',
    background: '#fff',
    border: '1px solid #18A0FB',
    borderRadius: 4,
    cursor: 'pointer',
  };

  const btnDangerStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: '#E53935',
    background: '#fff',
    border: '1px solid #E53935',
    borderRadius: 4,
    cursor: 'pointer',
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#E53935',
    padding: '6px 8px',
    background: '#FFF3F3',
    borderRadius: 4,
    marginBottom: 4,
  };

  const progressTextStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#18A0FB',
    padding: '8px 10px',
    background: '#F0F8FF',
    borderRadius: 4,
    textAlign: 'center',
  };

  const pageCardStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  };

  const pageNumStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#666',
    marginBottom: 6,
  };

  const exprRowStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '6px 0',
    borderBottom: '1px solid #F0F0F0',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    color: '#666',
    marginBottom: 2,
  };

  const koreanTextStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#333',
    background: '#F9F9F9',
    padding: 4,
    borderRadius: 3,
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap',
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 36,
    resize: 'vertical',
    padding: 4,
    border: '1px solid #E5E5E5',
    borderRadius: 3,
    fontSize: 11,
    lineHeight: 1.4,
    color: '#333',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const imageRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  };

  const thumbStyle = (isActive: boolean): React.CSSProperties => ({
    width: 60,
    height: 60,
    borderRadius: 4,
    border: isActive ? '2px solid #18A0FB' : '1px solid #DDD',
    background: '#F5F5F5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    color: '#AAA',
    cursor: 'pointer',
    flexShrink: 0,
    boxSizing: 'border-box',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  });

  const thumbImgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: 3,
  };

  const activeBadgeStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 2,
    right: 2,
    fontSize: 7,
    fontWeight: 700,
    color: '#fff',
    background: '#18A0FB',
    padding: '1px 3px',
    borderRadius: 2,
  };

  const regenRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
    marginTop: 4,
  };

  const customPromptStyle: React.CSSProperties = {
    flex: 1,
    padding: 4,
    border: '1px solid #E5E5E5',
    borderRadius: 3,
    fontSize: 10,
    color: '#555',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const progressBarWrapperStyle: React.CSSProperties = {
    width: '100%',
    height: 6,
    background: '#E5E5E5',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  };

  const progressBarFillStyle = (pct: number): React.CSSProperties => ({
    width: `${pct}%`,
    height: '100%',
    background: '#18A0FB',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  });

  const noteStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
    padding: '4px 0',
    fontStyle: 'italic',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 16: Key Expression 번역 & 이미지</div>

      {error && (
        <div style={errorStyle} onClick={() => setError(null)}>
          {error}
        </div>
      )}

      {/* Translation section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>번역</div>
        <button
          type="button"
          style={{
            ...btnPrimaryStyle,
            ...((isTranslating || totalCards === 0)
              ? { opacity: 0.5, cursor: 'not-allowed' }
              : {}),
          }}
          onClick={handleTranslateAll}
          disabled={isTranslating || totalCards === 0}
        >
          {isTranslating ? '번역 중...' : '전체 번역'}
        </button>
        <div style={{ ...progressTextStyle, marginTop: 8 }}>
          번역 완료: {translatedCount} / {totalCards}개 표현
        </div>
      </div>

      {/* Per-page translation review */}
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {nonEmptyPages.map((page) => {
          const cards = keyExpressions[page.pageIndex] ?? [];
          if (cards.length === 0) return null;
          const pageEnMap = enLinesMaps[page.pageIndex] || new Map<string, string[]>();

          return (
            <div key={page.pageIndex} style={pageCardStyle}>
              <div style={pageNumStyle}>
                Page {page.pageIndex + 1}
                {frameIds[page.pageIndex] && (
                  <span style={{ color: '#18A0FB', fontWeight: 400, fontSize: 9, marginLeft: 6 }}>
                    [Layout]
                  </span>
                )}
              </div>

              {cards.map((card, ci) => {
                const enLines = pageEnMap.get(card.id);
                const enText = enLines?.join('\n') ?? '';
                const cardImages = generatedImages.get(card.id) || [];

                return (
                  <div key={card.id} style={exprRowStyle}>
                    <div style={labelStyle}>표현 {ci + 1} (ID: {card.id})</div>
                    <div style={koreanTextStyle}>{card.lines.join('\n')}</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={labelStyle}>영어 번역</div>
                      <button
                        type="button"
                        style={{
                          ...btnOutlineStyle,
                          fontSize: 9,
                          padding: '2px 6px',
                          ...(retranslatingId === card.id ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                        }}
                        onClick={() => handleRetranslateCard(card.id, page.pageIndex)}
                        disabled={retranslatingId === card.id}
                      >
                        {retranslatingId === card.id ? '...' : '재번역'}
                      </button>
                    </div>
                    <textarea
                      style={textareaStyle}
                      value={enText}
                      onChange={(e) =>
                        handleEnglishEdit(page.pageIndex, card.id, e.target.value)
                      }
                      placeholder="번역 결과가 여기에 표시됩니다"
                    />

                    {/* Image gallery for this expression */}
                    {cardImages.length > 0 && (
                      <>
                        <div style={{ ...labelStyle, marginTop: 6 }}>이미지 ({cardImages.length}개)</div>
                        <div style={imageRowStyle}>
                          {cardImages.map((img, imgIdx) => (
                            <div
                              key={img.imageHash || imgIdx}
                              style={thumbStyle(img.isActive)}
                              onClick={() => handleSwapImage(card.id, img.imageHash)}
                              title={img.isActive ? `Variant #${imgIdx + 1} (활성)` : `Variant #${imgIdx + 1} - 클릭하여 선택`}
                            >
                              {img.imageBase64 ? (
                                <img
                                  src={`data:image/png;base64,${img.imageBase64}`}
                                  alt={`Variant ${imgIdx + 1}`}
                                  style={thumbImgStyle}
                                />
                              ) : (
                                <span>#{imgIdx + 1}</span>
                              )}
                              {img.isActive && <div style={activeBadgeStyle}>Active</div>}
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Regeneration controls */}
                    <div style={regenRowStyle}>
                      <input
                        type="text"
                        style={customPromptStyle}
                        value={customPrompts[card.id] ?? ''}
                        onChange={(e) =>
                          setCustomPrompts(prev => ({ ...prev, [card.id]: e.target.value }))
                        }
                        placeholder="커스텀 프롬프트 (재생성용)"
                      />
                      <button
                        type="button"
                        style={{
                          ...btnOutlineStyle,
                          fontSize: 10,
                          padding: '3px 8px',
                        }}
                        onClick={() => handleRegenerate(card.id)}
                      >
                        +이미지
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Image generation section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>이미지 생성</div>

        {/* Progress bar when generating */}
        {gemini.isGenerating && (
          <div style={{ marginBottom: 8 }}>
            <div style={progressBarWrapperStyle}>
              <div style={progressBarFillStyle(
                gemini.total > 0 ? Math.round((gemini.current / gemini.total) * 100) : 0
              )} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#18A0FB' }}>
                이미지 생성: {gemini.current}/{gemini.total}
              </span>
              <button
                type="button"
                style={btnDangerStyle}
                onClick={gemini.cancel}
              >
                취소
              </button>
            </div>
            {gemini.errors.length > 0 && (
              <div style={{ fontSize: 10, color: '#E53935', marginTop: 4 }}>
                오류: {gemini.errors.join(', ')}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          style={{
            ...btnPrimaryStyle,
            ...((gemini.isGenerating || totalCards === 0)
              ? { opacity: 0.5, cursor: 'not-allowed' }
              : {}),
          }}
          onClick={handleGenerateAllImages}
          disabled={gemini.isGenerating || totalCards === 0}
        >
          {gemini.isGenerating ? '생성 중...' : '전체 이미지 생성'}
        </button>
        {imagesGeneratedCount > 0 && (
          <div style={{ ...progressTextStyle, marginTop: 8 }}>
            이미지 생성 완료: {imagesGeneratedCount} / {totalCards}개 표현
          </div>
        )}
      </div>

      {/* Apply to Figma */}
      {(translatedCount > 0 || imagesGeneratedCount > 0) && (
        <div style={noteStyle}>
          번역과 이미지는 실시간으로 Figma에 반영됩니다
        </div>
      )}
    </div>
  );
};

export default KeyExprTransImgPanel;
