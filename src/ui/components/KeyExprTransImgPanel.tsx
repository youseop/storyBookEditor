import React, { useState, useMemo, useCallback } from 'react';
import { postToPlugin } from '../hooks/useFigmaMessages';
import { callGemini, extractJson } from '../utils/geminiApi';
import type { ExpressionCard } from '../../shared/messageTypes';
import type { StoryPage } from '../../shared/pipeline';

interface KeyExprTransImgPanelProps {
  pages: StoryPage[];
  keyExpressions: Record<number, ExpressionCard[]>;
  onTranslationsUpdate: (pageIndex: number, cards: ExpressionCard[]) => void;
  styleDescription: string;
  apiKey: string;
}

type TranslateStatus = 'idle' | 'translating' | 'done';
type ImageGenStatus = 'idle' | 'generating' | 'done';

const KeyExprTransImgPanel: React.FC<KeyExprTransImgPanelProps> = ({
  pages,
  keyExpressions,
  onTranslationsUpdate,
  styleDescription,
  apiKey,
}) => {
  const [translateStatus, setTranslateStatus] = useState<TranslateStatus>('idle');
  const [imageGenStatus, setImageGenStatus] = useState<ImageGenStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<Record<string, number>>({});
  const [generatedImages, setGeneratedImages] = useState<Record<string, string[]>>({});
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const nonEmptyPages = useMemo(() => pages.filter((p) => !p.isEmpty), [pages]);

  // Collect all expression cards across all pages
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
  const translatedCount = allExpressions.filter((e) => e.card.enLines && e.card.enLines.length > 0).length;
  const imagesGeneratedCount = Object.keys(generatedImages).length;

  // --- Translation ---
  const handleTranslateAll = useCallback(async () => {
    if (!apiKey) {
      setError('API 키가 설정되지 않았습니다.');
      return;
    }
    if (totalCards === 0) {
      setError('번역할 Key Expression이 없습니다.');
      return;
    }

    setTranslateStatus('translating');
    setError(null);

    try {
      const input = nonEmptyPages
        .filter((p) => (keyExpressions[p.pageIndex] ?? []).length > 0)
        .map((p) => ({
          pageIndex: p.pageIndex,
          expressions: (keyExpressions[p.pageIndex] ?? []).map((card) => ({
            id: card.id,
            korean: card.lines.join('\n'),
          })),
        }));

      const prompt = `다음 동화의 Key Expression(핵심 표현)을 영어로 번역해주세요. JSON으로 응답해주세요.
입력 형식: [{pageIndex: number, expressions: [{id: string, korean: string}]}]
출력 형식: [{pageIndex: number, expressions: [{id: string, english: string}]}]
번역 규칙: 자연스러운 영어, 핵심 표현/단어 위주, 동화체

입력:
${JSON.stringify(input, null, 2)}

JSON 배열만 응답해주세요. 다른 텍스트 없이 순수 JSON만 반환하세요.`;

      const rawJson = await callGemini(apiKey, prompt);
      const results: Array<{
        pageIndex: number;
        expressions: Array<{ id: string; english: string }>;
      }> = JSON.parse(extractJson(rawJson));

      results.forEach((pageResult) => {
        const existingCards = keyExpressions[pageResult.pageIndex] ?? [];
        const updatedCards = existingCards.map((card) => {
          const match = pageResult.expressions.find((e) => e.id === card.id);
          if (match) {
            return { ...card, enLines: match.english.split('\n') };
          }
          return card;
        });
        onTranslationsUpdate(pageResult.pageIndex, updatedCards);
      });

      setTranslateStatus('done');
    } catch (err: any) {
      setError(err.message || '번역 중 오류가 발생했습니다.');
      setTranslateStatus('idle');
    }
  }, [apiKey, totalCards, nonEmptyPages, keyExpressions, onTranslationsUpdate]);

  // --- Edit individual English translation ---
  const handleEnglishEdit = useCallback(
    (pageIndex: number, cardId: string, value: string) => {
      const existingCards = keyExpressions[pageIndex] ?? [];
      const updatedCards = existingCards.map((card) => {
        if (card.id === cardId) {
          return { ...card, enLines: value.split('\n') };
        }
        return card;
      });
      onTranslationsUpdate(pageIndex, updatedCards);
    },
    [keyExpressions, onTranslationsUpdate],
  );

  // --- Image generation ---
  const handleGenerateAllImages = useCallback(async () => {
    if (!apiKey) {
      setError('API 키가 설정되지 않았습니다.');
      return;
    }
    if (totalCards === 0) {
      setError('이미지 생성할 Key Expression이 없습니다.');
      return;
    }

    setImageGenStatus('generating');
    setError(null);

    try {
      // For now, generate placeholder images (actual image generation
      // would call an image generation API). We create 2 placeholder slots per card.
      const newImages: Record<string, string[]> = {};
      allExpressions.forEach(({ card }) => {
        newImages[card.id] = ['placeholder-1', 'placeholder-2'];
      });

      setGeneratedImages(newImages);
      setImageGenStatus('done');
    } catch (err: any) {
      setError(err.message || '이미지 생성 중 오류가 발생했습니다.');
      setImageGenStatus('idle');
    }
  }, [apiKey, totalCards, allExpressions]);

  // --- Select preferred image ---
  const handleSelectImage = useCallback((cardId: string, imageIdx: number) => {
    setSelectedImages((prev) => ({ ...prev, [cardId]: imageIdx }));
  }, []);

  // --- Custom regeneration ---
  const handleCustomPromptChange = useCallback((cardId: string, prompt: string) => {
    setCustomPrompts((prev) => ({ ...prev, [cardId]: prompt }));
  }, []);

  const handleRegenerate = useCallback(
    async (cardId: string) => {
      if (!apiKey) return;
      setRegeneratingId(cardId);
      setError(null);

      try {
        // Placeholder: actual implementation would call image generation API
        // with customPrompts[cardId] and styleDescription
        const newImages = { ...generatedImages };
        newImages[cardId] = ['regen-1', 'regen-2'];
        setGeneratedImages(newImages);
        setSelectedImages((prev) => {
          const next = { ...prev };
          delete next[cardId];
          return next;
        });
      } catch (err: any) {
        setError(`재생성 오류: ${err.message}`);
      } finally {
        setRegeneratingId(null);
      }
    },
    [apiKey, generatedImages],
  );

  // --- Apply to Figma ---
  const handleApplyToFigma = useCallback(() => {
    const expressionEntries = nonEmptyPages
      .filter((p) => (keyExpressions[p.pageIndex] ?? []).length > 0)
      .map((p) => ({
        pageIndex: p.pageIndex,
        cards: (keyExpressions[p.pageIndex] ?? []).map((card) => ({
          ...card,
          selectedImageIndex: selectedImages[card.id] ?? 0,
        })),
      }));

    postToPlugin({
      type: 'APPLY_KEY_EXPRESSIONS',
      expressions: expressionEntries,
    });
  }, [nonEmptyPages, keyExpressions, selectedImages]);

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
  };

  const imagePlaceholderStyle = (isSelected: boolean): React.CSSProperties => ({
    width: 60,
    height: 60,
    borderRadius: 4,
    border: isSelected ? '2px solid #18A0FB' : '1px solid #DDD',
    background: '#F5F5F5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    color: '#AAA',
    cursor: 'pointer',
    flexShrink: 0,
    boxSizing: 'border-box',
  });

  const customPromptStyle: React.CSSProperties = {
    width: '100%',
    padding: 4,
    border: '1px solid #E5E5E5',
    borderRadius: 3,
    fontSize: 10,
    color: '#555',
    outline: 'none',
    fontFamily: 'inherit',
    marginTop: 4,
  };

  const regenRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
    marginTop: 4,
  };

  const successStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '10px 12px',
    background: '#E8F8F0',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    color: '#1BC47D',
  };

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

      {error && <div style={errorStyle}>{error}</div>}

      {/* Translation section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>번역</div>
        <button
          type="button"
          style={{
            ...btnPrimaryStyle,
            ...(translateStatus === 'translating' || totalCards === 0
              ? { opacity: 0.5, cursor: 'not-allowed' }
              : {}),
          }}
          onClick={handleTranslateAll}
          disabled={translateStatus === 'translating' || totalCards === 0}
        >
          {translateStatus === 'translating' ? '번역 중...' : '전체 번역'}
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

          return (
            <div key={page.pageIndex} style={pageCardStyle}>
              <div style={pageNumStyle}>Page {page.pageIndex + 1}</div>

              {cards.map((card, ci) => (
                <div key={card.id} style={exprRowStyle}>
                  <div style={labelStyle}>표현 {ci + 1}</div>
                  <div style={koreanTextStyle}>{card.lines.join('\n')}</div>

                  <div style={labelStyle}>영어 번역</div>
                  <textarea
                    style={textareaStyle}
                    value={card.enLines?.join('\n') ?? ''}
                    onChange={(e) =>
                      handleEnglishEdit(page.pageIndex, card.id, e.target.value)
                    }
                    placeholder="번역 결과가 여기에 표시됩니다"
                  />

                  {/* Image slots */}
                  {generatedImages[card.id] && (
                    <>
                      <div style={{ ...labelStyle, marginTop: 6 }}>이미지 선택</div>
                      <div style={imageRowStyle}>
                        {generatedImages[card.id].map((_, imgIdx) => (
                          <div
                            key={imgIdx}
                            style={imagePlaceholderStyle(
                              selectedImages[card.id] === imgIdx,
                            )}
                            onClick={() => handleSelectImage(card.id, imgIdx)}
                          >
                            {imgIdx + 1}
                          </div>
                        ))}
                      </div>

                      {/* Custom prompt for regeneration */}
                      <div style={regenRowStyle}>
                        <input
                          type="text"
                          style={{ ...customPromptStyle, flex: 1 }}
                          value={customPrompts[card.id] ?? ''}
                          onChange={(e) =>
                            handleCustomPromptChange(card.id, e.target.value)
                          }
                          placeholder="커스텀 프롬프트 (재생성용)"
                        />
                        <button
                          type="button"
                          style={{
                            ...btnOutlineStyle,
                            fontSize: 10,
                            padding: '3px 8px',
                            ...(regeneratingId === card.id
                              ? { opacity: 0.5, cursor: 'not-allowed' }
                              : {}),
                          }}
                          onClick={() => handleRegenerate(card.id)}
                          disabled={regeneratingId === card.id}
                        >
                          {regeneratingId === card.id ? '...' : '재생성'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Image generation section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>이미지 생성</div>
        <button
          type="button"
          style={{
            ...btnPrimaryStyle,
            ...(imageGenStatus === 'generating' || totalCards === 0
              ? { opacity: 0.5, cursor: 'not-allowed' }
              : {}),
          }}
          onClick={handleGenerateAllImages}
          disabled={imageGenStatus === 'generating' || totalCards === 0}
        >
          {imageGenStatus === 'generating' ? '생성 중...' : '전체 이미지 생성'}
        </button>
        {imageGenStatus !== 'idle' && (
          <div style={{ ...progressTextStyle, marginTop: 8 }}>
            이미지 생성: {imagesGeneratedCount} / {totalCards}개 표현
          </div>
        )}
      </div>

      {/* Apply to Figma */}
      {(translateStatus === 'done' || imageGenStatus === 'done') && (
        <>
          <button
            type="button"
            style={{
              ...btnPrimaryStyle,
              background: '#1BC47D',
            }}
            onClick={handleApplyToFigma}
          >
            Figma에 반영
          </button>
          <div style={noteStyle}>
            번역 및 이미지를 Figma Part 3 페이지에 배치합니다
          </div>
        </>
      )}
    </div>
  );
};

export default KeyExprTransImgPanel;
