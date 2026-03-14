import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { getPageTextPreview } from '../utils/geminiApi';
import { useExpressionParser } from '../hooks/useExpressionParser';
import { postToPlugin, usePluginMessage } from '../hooks/useFigmaMessages';
import type { ExpressionCard, CardPlacement, ContentIdMap, SandboxToUIMessage, PluginSettings } from '../../shared/messageTypes';
import { DEFAULT_BG_COLOR, DEFAULT_FONT_SIZE } from '../../shared/constants';
import type { StoryPage } from '../../shared/pipeline';

interface KeyExprInputPanelProps {
  pages: StoryPage[];
  keyExpressions: Record<number, ExpressionCard[]>;
  onExpressionsChange: (pageIndex: number, cards: ExpressionCard[]) => void;
  apiKey: string;
  /** Per-page contentIdMap (pageIndex -> ContentIdMap) */
  contentIdMaps: Record<number, ContentIdMap | undefined>;
  onContentIdMapChange: (pageIndex: number, map: ContentIdMap) => void;
  /** Per-page placements (pageIndex -> CardPlacement[]) */
  placements: Record<number, CardPlacement[]>;
  onPlacementsChange: (pageIndex: number, placements: CardPlacement[]) => void;
  /** Per-page frameId (pageIndex -> frameId string) */
  frameIds: Record<number, string | undefined>;
  onFrameIdChange: (pageIndex: number, frameId: string) => void;
  /** Per-page enLinesMap (pageIndex -> Map<expressionId, enLines>) */
  enLinesMaps: Record<number, Map<string, string[]>>;
  onEnLinesMapChange: (pageIndex: number, map: Map<string, string[]>) => void;
}

/** Normalize text for contentIdMap keys (same logic as plugin side). */
function normalizeText(lines: string[]): string {
  return lines.map(l => l.trim()).filter(l => l.length > 0).join('\n');
}

/** Default settings for layout generation */
const defaultSettings: PluginSettings = {
  bgColor: DEFAULT_BG_COLOR,
  fontFamily: '',
  fontSize: DEFAULT_FONT_SIZE,
  apiKey: '',
  refFrameName: 'ref_img',
};

const KeyExprInputPanel: React.FC<KeyExprInputPanelProps> = ({
  pages,
  keyExpressions,
  onExpressionsChange,
  apiKey,
  contentIdMaps,
  onContentIdMapChange,
  placements,
  onPlacementsChange,
  frameIds,
  onFrameIdChange,
  enLinesMaps,
  onEnLinesMapChange,
}) => {
  const nonEmptyPages = useMemo(() => pages.filter((p) => !p.isEmpty), [pages]);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(
    nonEmptyPages.length > 0 ? nonEmptyPages[0].pageIndex : 0,
  );
  const [rawTexts, setRawTexts] = useState<Record<number, string>>({});
  const [isGeneratingLayout, setIsGeneratingLayout] = useState(false);
  const [layoutGenerated, setLayoutGenerated] = useState<Record<number, boolean>>({});

  const selectedPage = useMemo(
    () => pages.find((p) => p.pageIndex === selectedPageIndex),
    [pages, selectedPageIndex],
  );

  const currentRaw = rawTexts[selectedPageIndex] ?? '';
  const currentContentIdMap = contentIdMaps[selectedPageIndex];
  const currentFrameId = frameIds[selectedPageIndex];

  // Use the real expression parser hook
  const { cards: parsedCards, cardCount, restoredEnMap, restoredImageMap } = useExpressionParser(
    currentRaw,
    currentContentIdMap,
  );

  // Restore English translations from contentIdMap when cards change
  const lastRestoredRef = useRef<string>('');
  useEffect(() => {
    if (restoredEnMap.size > 0) {
      const key = `${selectedPageIndex}_${Array.from(restoredEnMap.entries()).map(([k, v]) => `${k}:${v.join(',')}`).join('|')}`;
      if (key !== lastRestoredRef.current) {
        lastRestoredRef.current = key;
        const currentMap = enLinesMaps[selectedPageIndex] || new Map<string, string[]>();
        const newMap = new Map(currentMap);
        restoredEnMap.forEach((enLines, cardId) => {
          if (!newMap.has(cardId) || newMap.get(cardId)!.every(l => l === '' || l === '영어 번역')) {
            newMap.set(cardId, enLines);
          }
        });
        onEnLinesMapChange(selectedPageIndex, newMap);
      }
    }
  }, [restoredEnMap, selectedPageIndex, enLinesMaps, onEnLinesMapChange]);

  // Ref tracking latest parsed cards for live updates
  const parsedCardsRef = useRef<ExpressionCard[]>([]);
  useEffect(() => {
    parsedCardsRef.current = parsedCards;
  }, [parsedCards]);

  // Propagate parsed cards to parent
  useEffect(() => {
    if (parsedCards.length > 0 || currentRaw.trim() !== '') {
      onExpressionsChange(selectedPageIndex, parsedCards);
    }
  }, [parsedCards, selectedPageIndex, onExpressionsChange, currentRaw]);

  // Merge enLines into cards before sending to plugin
  const mergeEnLines = useCallback((cards: ExpressionCard[], pageIdx: number): ExpressionCard[] => {
    const map = enLinesMaps[pageIdx] || new Map<string, string[]>();
    return cards.map(card => ({
      ...card,
      enLines: map.get(card.id),
    }));
  }, [enLinesMaps]);

  // Live update: debounced layout update when text changes
  const liveUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLiveUpdate = useCallback((pageIdx: number) => {
    if (liveUpdateTimerRef.current) {
      clearTimeout(liveUpdateTimerRef.current);
    }
    liveUpdateTimerRef.current = setTimeout(() => {
      liveUpdateTimerRef.current = null;
      const cards = parsedCardsRef.current;
      if (cards.length === 0) return;
      const fId = frameIds[pageIdx];
      if (!fId) return; // No frame yet, need to generate layout first
      postToPlugin({
        type: 'UPDATE_LAYOUT',
        expressions: mergeEnLines(cards, pageIdx),
        settings: { ...defaultSettings, apiKey },
        frameId: fId,
      });
    }, 400);
  }, [frameIds, mergeEnLines, apiKey]);

  // Handle messages from sandbox
  usePluginMessage(useCallback((msg: SandboxToUIMessage) => {
    switch (msg.type) {
      case 'LAYOUT_CREATED': {
        if (msg.contentIdMap) {
          // Find which page this frame belongs to
          const pageIdx = Object.entries(frameIds).find(([, fId]) => fId === msg.frameId)?.[0];
          if (pageIdx !== undefined) {
            onContentIdMapChange(Number(pageIdx), msg.contentIdMap);
          }
        }
        if (msg.placements.length > 0) {
          setIsGeneratingLayout(false);
          // Find which page by frameId
          const pageIdx = Object.entries(frameIds).find(([, fId]) => fId === msg.frameId)?.[0];
          if (pageIdx !== undefined) {
            onPlacementsChange(Number(pageIdx), msg.placements);
            setLayoutGenerated(prev => ({ ...prev, [Number(pageIdx)]: true }));
          } else {
            // New frame - associate with the currently selected page
            onFrameIdChange(selectedPageIndex, msg.frameId);
            onPlacementsChange(selectedPageIndex, msg.placements);
            setLayoutGenerated(prev => ({ ...prev, [selectedPageIndex]: true }));
          }
        }
        break;
      }
      case 'ERROR':
        setIsGeneratingLayout(false);
        break;
    }
  }, [frameIds, selectedPageIndex, onContentIdMapChange, onPlacementsChange, onFrameIdChange]));

  const handleTextChange = useCallback(
    (value: string) => {
      setRawTexts((prev) => ({ ...prev, [selectedPageIndex]: value }));
      // If a frame already exists for this page, trigger live update
      if (frameIds[selectedPageIndex]) {
        // Need to wait for next tick so parsedCards updates
        setTimeout(() => handleLiveUpdate(selectedPageIndex), 50);
      }
    },
    [selectedPageIndex, frameIds, handleLiveUpdate],
  );

  const handlePageSelect = useCallback((pageIndex: number) => {
    setSelectedPageIndex(pageIndex);
  }, []);

  // Generate or update layout for current page
  const handleGenerateLayout = useCallback(() => {
    if (parsedCards.length === 0) return;
    setIsGeneratingLayout(true);
    const fId = frameIds[selectedPageIndex];
    postToPlugin({
      type: fId ? 'UPDATE_LAYOUT' : 'GENERATE_LAYOUT',
      expressions: mergeEnLines(parsedCards, selectedPageIndex),
      settings: { ...defaultSettings, apiKey },
      frameId: fId,
    });
  }, [parsedCards, selectedPageIndex, frameIds, mergeEnLines, apiKey]);

  // Summary: how many cards each page has
  const pageSummary = useMemo(() => {
    return nonEmptyPages.map((p) => ({
      pageIndex: p.pageIndex,
      cardCount: keyExpressions[p.pageIndex]?.length ?? 0,
      hasLayout: !!layoutGenerated[p.pageIndex] || !!frameIds[p.pageIndex],
    }));
  }, [nonEmptyPages, keyExpressions, layoutGenerated, frameIds]);

  const currentPlacements = placements[selectedPageIndex] || [];

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

  const cardMetaStyle: React.CSSProperties = {
    fontSize: 9,
    color: '#999',
    marginTop: 4,
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

  const layoutBadgeStyle = (hasLayout: boolean): React.CSSProperties => ({
    fontSize: 9,
    fontWeight: 600,
    color: hasLayout ? '#18A0FB' : '#CCC',
    marginLeft: 4,
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
            '빈 줄 (Enter 2번) = 새 카드 구분\n' +
            '빈 줄 2개 (Enter 3번) = 새 줄 시작'
          }
        />
        <div style={hintStyle}>
          Enter = 카드 내 줄바꿈 | 빈 줄 = 새 카드 | 빈 줄 2개 = 새 줄 시작
        </div>
      </div>

      {/* Card preview */}
      {cardCount > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>
            파싱된 카드 미리보기 ({cardCount}개)
          </div>

          {parsedCards.map((card, idx) => (
            <div key={card.id} style={cardPreviewStyle}>
              <div style={cardHeaderStyle}>
                Card {idx + 1} (ID: {card.id})
                {card.rowBreakBefore && (
                  <span style={{ color: '#F5A623', marginLeft: 6, fontWeight: 400, fontSize: 9 }}>
                    [줄바꿈]
                  </span>
                )}
              </div>
              <div style={cardTextStyle}>{card.lines.join('\n')}</div>
              <div style={cardMetaStyle}>
                {card.colSpan}x{card.rowSpan} | ID: {card.id}
                {restoredEnMap.has(card.id) && (
                  <span style={{ color: '#18A0FB', marginLeft: 6 }}>
                    EN: {restoredEnMap.get(card.id)?.join(' ')}
                  </span>
                )}
              </div>
            </div>
          ))}

          {cardCount > 4 && (
            <div style={warningStyle}>
              카드가 4개를 초과했습니다. 초과 카드는 다음 페이지로 넘어갑니다.
            </div>
          )}
        </div>
      )}

      {/* Generate layout button */}
      {cardCount > 0 && (
        <button
          type="button"
          style={{
            ...btnPrimaryStyle,
            ...(isGeneratingLayout ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
          }}
          onClick={handleGenerateLayout}
          disabled={isGeneratingLayout}
        >
          {isGeneratingLayout
            ? '레이아웃 생성 중...'
            : currentFrameId
              ? '레이아웃 업데이트'
              : '레이아웃 생성'}
        </button>
      )}

      {/* Placement info */}
      {currentPlacements.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>배치 정보</div>
          <div style={hintStyle}>
            {currentPlacements.length}개 카드 배치됨
            {currentFrameId && (
              <span style={{ color: '#18A0FB', marginLeft: 4 }}>
                (Frame: {currentFrameId.slice(0, 8)}...)
              </span>
            )}
          </div>
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
            <span style={{ color: '#555' }}>
              Page {item.pageIndex + 1}
              <span style={layoutBadgeStyle(item.hasLayout)}>
                {item.hasLayout ? '[L]' : ''}
              </span>
            </span>
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
