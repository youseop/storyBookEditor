import React, { useState, useCallback } from 'react';
import { callGemini, extractJson } from '../utils/geminiApi';
import type { StoryPage } from '../../shared/pipeline';

interface BulkTranslatePanelProps {
  pages: StoryPage[];
  onTranslationsChange: (translations: Record<number, string[][]>) => void;
  apiKey: string;
}

type TranslateStatus = 'idle' | 'translating' | 'done';

function getPageKoreanText(page: StoryPage): string {
  return page.textBlocks.map((block) => block.join('\n')).join('\n\n');
}

const BulkTranslatePanel: React.FC<BulkTranslatePanelProps> = ({
  pages,
  onTranslationsChange,
  apiKey,
}) => {
  const [translations, setTranslations] = useState<Record<number, string[][]>>({});
  const [status, setStatus] = useState<TranslateStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reviewResults, setReviewResults] = useState<Record<number, string>>({});
  const [reviewingPage, setReviewingPage] = useState<number | null>(null);
  const [retranslatingPage, setRetranslatingPage] = useState<number | null>(null);

  const nonEmptyPages = pages.filter((p) => !p.isEmpty);
  const translatedCount = nonEmptyPages.filter((p) => translations[p.pageIndex]?.length > 0).length;

  const handleTranslateAll = useCallback(async () => {
    if (!apiKey) {
      setError('API 키가 설정되지 않았습니다.');
      return;
    }
    setStatus('translating');
    setError(null);

    try {
      const input = nonEmptyPages.map((p) => ({
        pageIndex: p.pageIndex,
        textBlocks: p.textBlocks,
      }));

      const prompt = `다음 동화의 한국어 대사를 영어로 번역해주세요. JSON으로 응답해주세요.
입력 형식: [{pageIndex: number, textBlocks: string[][]}]
출력 형식: [{pageIndex: number, translatedBlocks: string[][]}]
번역 규칙: 자연스러운 영어, 동화체, 주어가 생략된 경우 문맥에서 추론

입력:
${JSON.stringify(input, null, 2)}

JSON 배열만 응답해주세요. 다른 텍스트 없이 순수 JSON만 반환하세요.`;

      const rawJson = await callGemini(apiKey, prompt);
      const results: Array<{ pageIndex: number; translatedBlocks: string[][] }> = JSON.parse(extractJson(rawJson));

      const newTranslations: Record<number, string[][]> = {};
      results.forEach((r) => {
        newTranslations[r.pageIndex] = r.translatedBlocks;
      });

      setTranslations(newTranslations);
      onTranslationsChange(newTranslations);
      setStatus('done');
    } catch (err: any) {
      setError(err.message || '번역 중 오류가 발생했습니다.');
      setStatus('idle');
    }
  }, [nonEmptyPages, apiKey, onTranslationsChange]);

  const handleRetranslatePage = useCallback(
    async (pageIndex: number) => {
      if (!apiKey) return;
      const page = pages.find((p) => p.pageIndex === pageIndex);
      if (!page || page.isEmpty) return;

      setRetranslatingPage(pageIndex);
      setError(null);

      try {
        const input = [{ pageIndex: page.pageIndex, textBlocks: page.textBlocks }];

        const prompt = `다음 동화의 한국어 대사를 영어로 번역해주세요. JSON으로 응답해주세요.
입력 형식: [{pageIndex: number, textBlocks: string[][]}]
출력 형식: [{pageIndex: number, translatedBlocks: string[][]}]
번역 규칙: 자연스러운 영어, 동화체, 주어가 생략된 경우 문맥에서 추론

입력:
${JSON.stringify(input, null, 2)}

JSON 배열만 응답해주세요. 다른 텍스트 없이 순수 JSON만 반환하세요.`;

        const rawJson = await callGemini(apiKey, prompt);
        const results: Array<{ pageIndex: number; translatedBlocks: string[][] }> = JSON.parse(extractJson(rawJson));

        if (results.length > 0) {
          const translatedBlocks = results[0].translatedBlocks;
          setTranslations(prev => {
            const updated = { ...prev, [pageIndex]: translatedBlocks };
            onTranslationsChange(updated);
            return updated;
          });
        }
      } catch (err: any) {
        setError(`페이지 ${pageIndex + 1} 재번역 오류: ${err.message}`);
      } finally {
        setRetranslatingPage(null);
      }
    },
    [pages, apiKey, onTranslationsChange],
  );

  const handleReviewPage = useCallback(
    async (pageIndex: number) => {
      if (!apiKey) return;
      const page = pages.find((p) => p.pageIndex === pageIndex);
      if (!page || page.isEmpty) return;
      const pageTrans = translations[pageIndex];
      if (!pageTrans) return;

      setReviewingPage(pageIndex);
      setError(null);

      try {
        const koreanText = getPageKoreanText(page);
        const englishText = pageTrans.map((block) => block.join('\n')).join('\n\n');

        const prompt = `다음 한국어 문장의 영어 번역이 적절한지 검수해주세요. 부적절한 부분이 있으면 수정 번역을 제안해주세요.
한국어: ${koreanText}
영어: ${englishText}`;

        const result = await callGemini(apiKey, prompt);
        setReviewResults((prev) => ({ ...prev, [pageIndex]: result }));
      } catch (err: any) {
        setError(`페이지 ${pageIndex + 1} 검수 오류: ${err.message}`);
      } finally {
        setReviewingPage(null);
      }
    },
    [pages, apiKey, translations],
  );

  const handleTranslationEdit = useCallback(
    (pageIndex: number, blockIndex: number, value: string) => {
      const pageTrans = translations[pageIndex];
      if (!pageTrans) return;

      const updatedBlocks = pageTrans.map((block, bi) => {
        if (bi === blockIndex) {
          return value.split('\n');
        }
        return block;
      });

      const updated = { ...translations, [pageIndex]: updatedBlocks };
      setTranslations(updated);
      onTranslationsChange(updated);
    },
    [translations, onTranslationsChange],
  );

  const handleSaveTranslations = useCallback(() => {
    onTranslationsChange(translations);
  }, [translations, onTranslationsChange]);

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

  const btnSmallStyle: React.CSSProperties = {
    padding: '4px 8px',
    fontSize: 10,
    fontWeight: 600,
    color: '#F5A623',
    background: '#fff',
    border: '1px solid #F5A623',
    borderRadius: 4,
    cursor: 'pointer',
  };

  const pageCardStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  };

  const pageHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  };

  const pageNumStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#666',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    color: '#666',
    marginBottom: 2,
    marginTop: 6,
  };

  const koreanTextStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#999',
    background: '#F9F9F9',
    padding: 6,
    borderRadius: 4,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    marginBottom: 4,
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 50,
    resize: 'vertical',
    padding: 6,
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    fontSize: 11,
    lineHeight: 1.4,
    color: '#333',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const statusStyle: React.CSSProperties = {
    fontSize: 11,
    color: status === 'translating' ? '#F5A623' : status === 'done' ? '#1BC47D' : '#999',
    fontWeight: 600,
    textAlign: 'center',
    padding: '4px 0',
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#E53935',
    padding: '6px 8px',
    background: '#FFF3F3',
    borderRadius: 4,
    marginBottom: 4,
  };

  const reviewResultStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#555',
    background: '#FFF8E1',
    padding: 8,
    borderRadius: 4,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    marginTop: 6,
    border: '1px solid #FFE082',
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

  const btnActionRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 6,
    marginTop: 6,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 11: 벌크 번역</div>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Bulk translate button */}
      <div style={sectionStyle}>
        <button
          type="button"
          style={{
            ...btnPrimaryStyle,
            ...(status === 'translating' ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
          }}
          onClick={handleTranslateAll}
          disabled={status === 'translating' || nonEmptyPages.length === 0}
        >
          {status === 'translating' ? '번역 중...' : '전체 번역'}
        </button>

        <div style={statusStyle}>
          {status === 'idle' && nonEmptyPages.length > 0 && `${nonEmptyPages.length}개 페이지 대기`}
          {status === 'translating' && '번역 중...'}
          {status === 'done' && `${translatedCount}개 페이지 번역 완료`}
        </div>
      </div>

      {/* Translation progress */}
      <div style={progressTextStyle}>
        번역 완료: {translatedCount} / {nonEmptyPages.length} 페이지
      </div>

      {/* Page-by-page translation review */}
      <div style={{ maxHeight: 500, overflowY: 'auto' }}>
        {nonEmptyPages.map((page) => {
          const pageTrans = translations[page.pageIndex];
          const reviewResult = reviewResults[page.pageIndex];
          const isReviewing = reviewingPage === page.pageIndex;
          const isRetranslating = retranslatingPage === page.pageIndex;

          return (
            <div key={page.pageIndex} style={pageCardStyle}>
              <div style={pageHeaderStyle}>
                <span style={pageNumStyle}>Page {page.pageIndex + 1}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    style={{
                      ...btnOutlineStyle,
                      ...(isRetranslating ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                    }}
                    onClick={() => handleRetranslatePage(page.pageIndex)}
                    disabled={isRetranslating}
                  >
                    {isRetranslating ? '번역 중...' : '재번역'}
                  </button>
                </div>
              </div>

              {/* Korean text (read-only) */}
              {page.textBlocks.map((block, bi) => (
                <div key={`ko-${bi}`}>
                  <div style={labelStyle}>한국어 텍스트 블록 {bi + 1}</div>
                  <div style={koreanTextStyle}>{block.join('\n')}</div>

                  {/* English translation (editable) */}
                  <div style={labelStyle}>영어 번역</div>
                  {pageTrans && pageTrans[bi] ? (
                    <textarea
                      style={textareaStyle}
                      value={pageTrans[bi].join('\n')}
                      onChange={(e) => handleTranslationEdit(page.pageIndex, bi, e.target.value)}
                    />
                  ) : (
                    <div style={{ fontSize: 11, color: '#AAA', fontStyle: 'italic', padding: '4px 0' }}>
                      번역 결과 없음
                    </div>
                  )}
                </div>
              ))}

              {/* Action buttons */}
              {pageTrans && (
                <div style={btnActionRowStyle}>
                  <button
                    type="button"
                    style={{
                      ...btnSmallStyle,
                      ...(isReviewing ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                    }}
                    onClick={() => handleReviewPage(page.pageIndex)}
                    disabled={isReviewing}
                  >
                    {isReviewing ? '검수 중...' : 'AI 검수'}
                  </button>
                </div>
              )}

              {/* Review result */}
              {reviewResult && (
                <div style={reviewResultStyle}>{reviewResult}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save translations */}
      <button
        type="button"
        style={{
          ...btnPrimaryStyle,
          background: '#1BC47D',
          ...(translatedCount === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        }}
        onClick={handleSaveTranslations}
        disabled={translatedCount === 0}
      >
        번역 저장
      </button>

      <div style={{ fontSize: 10, color: '#999', textAlign: 'center', fontStyle: 'italic' }}>
        번역 후 각 페이지를 확인하고 필요시 수동으로 수정하세요
      </div>
    </div>
  );
};

export default BulkTranslatePanel;
