import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { postToPlugin } from '../hooks/useFigmaMessages';

export interface ParsedPage {
  pageIndex: number;
  textBlocks: string[][];
  isEmpty: boolean;
}

interface PageSplitPanelProps {
  initialText: string;
  onTextChange: (text: string) => void;
  onPagesChange: (pages: ParsedPage[]) => void;
  onAutoSplit?: (minSentences: number, maxSentences: number) => void;
}

/**
 * Parse raw story text into structured pages.
 *
 * Rules:
 *  - 3+ consecutive newlines (\n\n\n) → page boundary
 *  - 2 consecutive newlines (\n\n)    → new text block on same page
 *  - 1 newline (\n)                   → line break within text block
 *  - ">>" as sole content on a page   → empty/image-only page
 */
function parseTextToPages(text: string): ParsedPage[] {
  // Split into raw page chunks by 3+ consecutive newlines
  const rawPages = text.split(/\n{3,}/);

  return rawPages.map((rawPage, idx) => {
    const trimmed = rawPage.trim();

    // Empty-page marker
    if (trimmed === '>>') {
      return {
        pageIndex: idx,
        textBlocks: [],
        isEmpty: true,
      };
    }

    // Split into text blocks by double newline
    const rawBlocks = trimmed.split(/\n\n/);

    const textBlocks = rawBlocks
      .map((block) => {
        const lines = block.split('\n').map((l) => l.trim());
        return lines;
      })
      .filter((block) => block.some((line) => line.length > 0));

    return {
      pageIndex: idx,
      textBlocks,
      isEmpty: textBlocks.length === 0,
    };
  });
}

const PageSplitPanel: React.FC<PageSplitPanelProps> = ({
  initialText,
  onTextChange,
  onPagesChange,
  onAutoSplit,
}) => {
  const [text, setText] = useState(initialText);
  const [minSentences, setMinSentences] = useState(2);
  const [maxSentences, setMaxSentences] = useState(5);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local text in sync when initialText changes externally
  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  const parsedPages = useMemo(() => parseTextToPages(text), [text]);

  // Notify parent whenever pages change
  useEffect(() => {
    onPagesChange(parsedPages);
  }, [parsedPages, onPagesChange]);

  // Debounced Figma sync
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      postToPlugin({
        type: 'UPDATE_STORY_PAGES',
        pages: parsedPages.map((p) => ({
          textBlocks: p.textBlocks,
          isEmpty: p.isEmpty,
        })),
      });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [parsedPages]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setText(val);
      onTextChange(val);
    },
    [onTextChange],
  );

  const handleAutoSplit = useCallback(() => {
    onAutoSplit?.(minSentences, maxSentences);
  }, [onAutoSplit, minSentences, maxSentences]);

  const handleCreatePages = useCallback(() => {
    postToPlugin({
      type: 'CREATE_STORY_PAGES',
      pages: parsedPages.map((p) => ({
        textBlocks: p.textBlocks,
        isEmpty: p.isEmpty,
      })),
    });
  }, [parsedPages]);

  // --- Inline Styles ---

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 12,
    fontFamily: 'inherit',
    color: '#333',
    fontSize: 12,
  };

  const sectionStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    borderRadius: 6,
    padding: 10,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };

  const headerStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 4,
  };

  const settingsRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  };

  const numberInputStyle: React.CSSProperties = {
    width: 44,
    padding: '3px 6px',
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    fontSize: 12,
    textAlign: 'center' as const,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#666',
  };

  const autoSplitBtnStyle: React.CSSProperties = {
    marginTop: 8,
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: '#18A0FB',
    background: '#fff',
    border: '1px solid #18A0FB',
    borderRadius: 4,
    cursor: 'pointer',
    width: '100%',
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 200,
    resize: 'vertical',
    padding: 8,
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    fontFamily: "'SF Mono', 'Menlo', 'Consolas', monospace",
    fontSize: 11,
    lineHeight: 1.5,
    color: '#333',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const previewListStyle: React.CSSProperties = {
    maxHeight: 200,
    overflowY: 'auto',
  };

  const pageItemStyle = (isEmpty: boolean): React.CSSProperties => ({
    padding: 8,
    borderBottom: '1px solid #F0F0F0',
    ...(isEmpty
      ? {
          border: '1px dashed #CCC',
          borderRadius: 4,
          background: '#FAFAFA',
          marginBottom: 4,
        }
      : {}),
  });

  const pageNumberStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: '#999',
    marginBottom: 2,
  };

  const blockPreviewStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#555',
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };

  const emptyLabelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#AAA',
    fontStyle: 'italic',
  };

  const footerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const pageCountStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#666',
  };

  const createBtnStyle: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    background: '#18A0FB',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  };

  const helpTextStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    lineHeight: 1.5,
    padding: '6px 0 2px',
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>Step 5: 페이지 나눔</div>

      {/* Settings section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>설정</div>
        <div style={settingsRowStyle}>
          <span style={labelStyle}>최소 문장 수:</span>
          <input
            type="number"
            min={1}
            max={20}
            value={minSentences}
            onChange={(e) => setMinSentences(Math.max(1, Number(e.target.value)))}
            style={numberInputStyle}
          />
          <span style={labelStyle}>최대:</span>
          <input
            type="number"
            min={1}
            max={50}
            value={maxSentences}
            onChange={(e) => setMaxSentences(Math.max(1, Number(e.target.value)))}
            style={numberInputStyle}
          />
        </div>
        <button
          type="button"
          style={autoSplitBtnStyle}
          onClick={handleAutoSplit}
          disabled={!onAutoSplit}
        >
          AI 자동 나눔
        </button>
      </div>

      {/* Textarea section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>텍스트 입력</div>
        <textarea
          style={textareaStyle}
          value={text}
          onChange={handleTextChange}
          placeholder="이야기를 입력하세요...&#10;&#10;Enter 1x = 같은 텍스트 박스 줄바꿈&#10;Enter 2x = 같은 페이지 새 텍스트 박스&#10;Enter 3x = 다음 페이지&#10;>> = 빈 페이지 (이미지 전용)"
          spellCheck={false}
        />
        <div style={helpTextStyle}>
          Enter 1x: 줄바꿈 &nbsp;|&nbsp; Enter 2x: 새 텍스트 박스 &nbsp;|&nbsp; Enter 3x: 다음
          페이지 &nbsp;|&nbsp; {'>>'}:빈 페이지
        </div>
      </div>

      {/* Page preview section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>페이지 미리보기</div>
        <div style={previewListStyle}>
          {parsedPages.length === 0 && (
            <div style={emptyLabelStyle}>텍스트를 입력하면 페이지가 표시됩니다.</div>
          )}
          {parsedPages.map((page) => (
            <div key={page.pageIndex} style={pageItemStyle(page.isEmpty)}>
              <div style={pageNumberStyle}>
                Page {page.pageIndex + 1}
                {page.isEmpty
                  ? ''
                  : ` (${page.textBlocks.length} block${page.textBlocks.length !== 1 ? 's' : ''})`}
              </div>
              {page.isEmpty ? (
                <div style={emptyLabelStyle}>[빈 페이지 — 이미지 전용]</div>
              ) : (
                page.textBlocks.map((block, bIdx) => {
                  const preview = block.join('\n');
                  const truncated =
                    preview.length > 50 ? preview.slice(0, 50) + '…' : preview;
                  return (
                    <div key={bIdx} style={blockPreviewStyle}>
                      {bIdx > 0 && (
                        <span
                          style={{
                            display: 'block',
                            borderTop: '1px dotted #DDD',
                            margin: '3px 0',
                          }}
                        />
                      )}
                      {truncated}
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={footerStyle}>
        <span style={pageCountStyle}>총 {parsedPages.length} 페이지</span>
        <button
          type="button"
          style={{
            ...createBtnStyle,
            ...(parsedPages.length === 0
              ? { opacity: 0.5, cursor: 'not-allowed' }
              : {}),
          }}
          onClick={handleCreatePages}
          disabled={parsedPages.length === 0}
        >
          Figma에 생성
        </button>
      </div>
    </div>
  );
};

export default PageSplitPanel;
