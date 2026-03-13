import React, { useState, useMemo, useCallback } from 'react';
import type { ExpressionCard } from '../../shared/messageTypes';
import type { StoryPage } from '../../shared/pipeline';

interface KeyExprInputPanelProps {
  pages: StoryPage[];
  keyExpressions: Record<number, ExpressionCard[]>;
  onExpressionsChange: (pageIndex: number, cards: ExpressionCard[]) => void;
  apiKey: string;
}

/**
 * Parse raw text into ExpressionCard[].
 * Single Enter = line break within a card.
 * Double Enter (blank line) = new card.
 */
function parseExpressions(raw: string): ExpressionCard[] {
  if (!raw.trim()) return [];

  const blocks = raw.split(/\n\s*\n/);
  return blocks
    .map((block, idx) => {
      const lines = block.split('\n').filter((l) => l.trim() !== '');
      if (lines.length === 0) return null;
      return {
        id: `expr-${idx}`,
        lines,
        colSpan: 2,
        rowSpan: 2,
      } as ExpressionCard;
    })
    .filter((c): c is ExpressionCard => c !== null);
}

function getPageTextPreview(page: StoryPage, maxLen = 20): string {
  const full = page.textBlocks
    .flat()
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!full) return '(빈 페이지)';
  return full.length > maxLen ? full.slice(0, maxLen) + '...' : full;
}

const KeyExprInputPanel: React.FC<KeyExprInputPanelProps> = ({
  pages,
  keyExpressions,
  onExpressionsChange,
}) => {
  const nonEmptyPages = useMemo(() => pages.filter((p) => !p.isEmpty), [pages]);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(
    nonEmptyPages.length > 0 ? nonEmptyPages[0].pageIndex : 0,
  );
  const [rawTexts, setRawTexts] = useState<Record<number, string>>({});

  const selectedPage = useMemo(
    () => pages.find((p) => p.pageIndex === selectedPageIndex),
    [pages, selectedPageIndex],
  );

  const currentRaw = rawTexts[selectedPageIndex] ?? '';
  const parsedCards = useMemo(() => parseExpressions(currentRaw), [currentRaw]);

  const handleTextChange = useCallback(
    (value: string) => {
      setRawTexts((prev) => ({ ...prev, [selectedPageIndex]: value }));
      const cards = parseExpressions(value);
      onExpressionsChange(selectedPageIndex, cards);
    },
    [selectedPageIndex, onExpressionsChange],
  );

  const handlePageSelect = useCallback((pageIndex: number) => {
    setSelectedPageIndex(pageIndex);
  }, []);

  // Summary: how many cards each page has
  const pageSummary = useMemo(() => {
    return nonEmptyPages.map((p) => ({
      pageIndex: p.pageIndex,
      cardCount: keyExpressions[p.pageIndex]?.length ?? 0,
    }));
  }, [nonEmptyPages, keyExpressions]);

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

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    color: '#666',
    marginBottom: 4,
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    fontSize: 11,
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    color: '#333',
    background: '#fff',
    outline: 'none',
    fontFamily: 'inherit',
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
    minHeight: 100,
    resize: 'vertical',
    padding: 8,
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    fontSize: 11,
    lineHeight: 1.5,
    color: '#333',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const cardPreviewStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
    background: '#FAFAFA',
  };

  const cardHeaderStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: '#18A0FB',
    marginBottom: 4,
  };

  const cardTextStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#333',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  };

  const summaryContainerStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    borderRadius: 6,
    padding: 10,
    maxHeight: 150,
    overflowY: 'auto',
  };

  const summaryRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
    padding: '4px 0',
    borderBottom: '1px solid #F0F0F0',
  };

  const summaryTitleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#666',
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };

  const badgeStyle = (count: number): React.CSSProperties => ({
    fontSize: 10,
    fontWeight: 700,
    color: count > 0 ? '#1BC47D' : '#999',
    background: count > 0 ? '#E8F8F0' : '#F5F5F5',
    padding: '2px 6px',
    borderRadius: 3,
  });

  const hintStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    lineHeight: 1.5,
    padding: '4px 0',
  };

  const warningStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#F5A623',
    padding: '4px 6px',
    background: '#FFF8E1',
    borderRadius: 4,
    marginTop: 4,
  };

  const sceneDescStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 4,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 15: Key Expression 입력</div>

      {/* Page selector */}
      <div style={sectionStyle}>
        <div style={labelStyle}>페이지 선택</div>
        <select
          style={selectStyle}
          value={selectedPageIndex}
          onChange={(e) => handlePageSelect(Number(e.target.value))}
        >
          {nonEmptyPages.map((p) => (
            <option key={p.pageIndex} value={p.pageIndex}>
              Page {p.pageIndex + 1} - {getPageTextPreview(p)}
            </option>
          ))}
        </select>
      </div>

      {/* Selected page info */}
      {selectedPage && (
        <div style={sectionStyle}>
          <div style={labelStyle}>페이지 텍스트 미리보기</div>
          <div style={koreanTextStyle}>
            {selectedPage.textBlocks.map((block) => block.join('\n')).join('\n\n') || '(텍스트 없음)'}
          </div>

          {selectedPage.sceneAnalysis?.sceneDescription && (
            <>
              <div style={labelStyle}>장면 설명</div>
              <div style={sceneDescStyle}>
                {selectedPage.sceneAnalysis.sceneDescription}
              </div>
            </>
          )}
        </div>
      )}

      {/* Expression input */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Key Expression 입력</div>
        <textarea
          style={textareaStyle}
          value={currentRaw}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={
            '핵심 표현을 입력하세요.\n\n' +
            'Enter = 카드 내 줄바꿈\n' +
            '빈 줄 (Enter 2번) = 새 카드 구분'
          }
        />
        <div style={hintStyle}>
          Enter = 카드 내 줄바꿈 | 빈 줄 (Enter 2번) = 새 카드 구분
        </div>
      </div>

      {/* Card preview */}
      {parsedCards.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>
            파싱된 카드 미리보기 ({parsedCards.length}개)
          </div>

          {parsedCards.map((card, idx) => (
            <div key={card.id} style={cardPreviewStyle}>
              <div style={cardHeaderStyle}>Card {idx + 1}</div>
              <div style={cardTextStyle}>{card.lines.join('\n')}</div>
            </div>
          ))}

          {parsedCards.length > 4 && (
            <div style={warningStyle}>
              카드가 4개를 초과했습니다. 초과 카드는 다음 페이지로 넘어갑니다.
            </div>
          )}
        </div>
      )}

      {/* All-page summary */}
      <div style={summaryContainerStyle}>
        <div style={summaryTitleStyle}>전체 페이지 요약</div>
        {pageSummary.map((item) => (
          <div
            key={item.pageIndex}
            style={{
              ...summaryRowStyle,
              ...(item.pageIndex === selectedPageIndex
                ? { background: '#F0F8FF' }
                : {}),
              cursor: 'pointer',
            }}
            onClick={() => handlePageSelect(item.pageIndex)}
          >
            <span style={{ color: '#555' }}>Page {item.pageIndex + 1}</span>
            <span style={badgeStyle(item.cardCount)}>
              {item.cardCount > 0 ? `${item.cardCount}개 카드` : '미입력'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KeyExprInputPanel;
