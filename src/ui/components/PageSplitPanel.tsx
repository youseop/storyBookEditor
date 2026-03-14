import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { postToPlugin } from '../hooks/useFigmaMessages';
import { callGemini, extractJson } from '../utils/geminiApi';

export interface ParsedPage {
  pageIndex: number;
  textBlocks: string[][];
  isEmpty: boolean;
}

interface PageSplitPanelProps {
  initialText: string;
  onTextChange: (text: string) => void;
  onPagesChange: (pages: ParsedPage[]) => void;
  apiKey: string;
}

/**
 * Parse raw story text into structured pages.
 */
function parseTextToPages(text: string): ParsedPage[] {
  const rawPages = text.split(/\n{3,}/);
  return rawPages.map((rawPage, idx) => {
    const trimmed = rawPage.trim();
    if (trimmed === '>>') {
      return { pageIndex: idx, textBlocks: [], isEmpty: true };
    }
    const rawBlocks = trimmed.split(/\n\n/);
    const textBlocks = rawBlocks
      .map((block) => block.split('\n').map((l) => l.trim()))
      .filter((block) => block.some((line) => line.length > 0));
    return { pageIndex: idx, textBlocks, isEmpty: textBlocks.length === 0 };
  });
}

const PAGE_SEPARATOR = '\n\n\n';

const PageSplitPanel: React.FC<PageSplitPanelProps> = ({
  initialText,
  onTextChange,
  onPagesChange,
  apiKey,
}) => {
  const [text, setText] = useState(initialText);
  const [minSentences, setMinSentences] = useState(2);
  const [maxSentences, setMaxSentences] = useState(5);
  const [isSplitting, setIsSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setText(initialText); }, [initialText]);

  const parsedPages = useMemo(() => parseTextToPages(text), [text]);
  const nonEmptyPageCount = useMemo(() => parsedPages.filter(p => !p.isEmpty).length, [parsedPages]);

  useEffect(() => { onPagesChange(parsedPages); }, [parsedPages, onPagesChange]);

  // Debounced Figma sync (no auto-create, just update if pages exist)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Don't auto-send to Figma, only on explicit "Figma에 생성" click
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [parsedPages]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    onTextChange(val);
  }, [onTextChange]);

  // AI auto-split: send story text to Gemini, get page-split result back into textarea
  const handleAutoSplit = useCallback(async () => {
    if (!apiKey) { setError('API Key가 설정되지 않았습니다.'); return; }
    // Strip existing page breaks to get raw text
    const rawText = text.replace(/\n{3,}/g, '\n').trim();
    if (!rawText) { setError('이야기 텍스트를 먼저 입력해주세요.'); return; }

    setIsSplitting(true);
    setError(null);

    try {
      const prompt = `다음 동화 텍스트를 페이지별로 나눠주세요.

규칙:
- 한 페이지에 최소 ${minSentences}문장, 최대 ${maxSentences}문장
- 장면이 전환되는 곳에서는 반드시 페이지를 나눕니다
- 대화와 서술이 자연스럽게 끊기는 곳에서 나눕니다
- 같은 페이지 내에서 화자가 바뀌거나 문단이 나뉘는 곳에는 빈 줄 1개를 넣어주세요

출력 형식: JSON 배열로 응답해주세요. 각 요소는 한 페이지의 텍스트입니다.
[
  "첫 번째 페이지 텍스트...",
  "두 번째 페이지 텍스트...",
  ...
]
원본 텍스트를 절대 수정하지 마세요. 페이지 구분만 해주세요.

텍스트:
${rawText}`;

      const result = await callGemini(apiKey, prompt, 'gemini-2.5-flash');
      const pages: string[] = JSON.parse(extractJson(result));

      if (!Array.isArray(pages) || pages.length === 0) {
        throw new Error('AI 응답을 파싱할 수 없습니다.');
      }

      // Reconstruct text with triple newlines as page separators
      const splitText = pages.map(p => p.trim()).join(PAGE_SEPARATOR);
      setText(splitText);
      onTextChange(splitText);
    } catch (err: any) {
      setError(err.message || 'AI 페이지 나눔 중 오류가 발생했습니다.');
    } finally {
      setIsSplitting(false);
    }
  }, [apiKey, text, minSentences, maxSentences, onTextChange]);

  const handleCreatePages = useCallback(() => {
    postToPlugin({
      type: 'CREATE_STORY_PAGES',
      pages: parsedPages.map((p) => ({
        textBlocks: p.textBlocks,
        isEmpty: p.isEmpty,
      })),
    });
  }, [parsedPages]);

  // Styles
  const s = {
    container: { display: 'flex', flexDirection: 'column' as const, gap: 12, padding: 12, fontSize: 12, color: '#333' },
    header: { fontSize: 13, fontWeight: 700 as const, marginBottom: 4 },
    section: { border: '1px solid #E5E5E5', borderRadius: 6, padding: 10 },
    sectionTitle: { fontSize: 11, fontWeight: 600 as const, color: '#666', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    row: { display: 'flex', alignItems: 'center' as const, gap: 8, flexWrap: 'wrap' as const },
    numInput: { width: 44, padding: '3px 6px', border: '1px solid #E5E5E5', borderRadius: 4, fontSize: 12, textAlign: 'center' as const },
    label: { fontSize: 11, color: '#666' },
    btnOutline: { padding: '6px 12px', fontSize: 11, fontWeight: 600 as const, color: '#18A0FB', background: '#fff', border: '1px solid #18A0FB', borderRadius: 4, cursor: 'pointer', width: '100%' },
    btnPrimary: { padding: '8px 16px', fontSize: 12, fontWeight: 700 as const, color: '#fff', background: '#18A0FB', border: 'none', borderRadius: 6, cursor: 'pointer' },
    disabled: { opacity: 0.5, cursor: 'not-allowed' as const },
    textarea: { width: '100%', minHeight: 250, resize: 'vertical' as const, padding: 8, border: '1px solid #E5E5E5', borderRadius: 4, fontFamily: "'SF Mono', monospace", fontSize: 11, lineHeight: 1.6, color: '#333', boxSizing: 'border-box' as const, outline: 'none' },
    error: { fontSize: 11, color: '#E53E3E', padding: '4px 0' },
    help: { fontSize: 10, color: '#999', lineHeight: 1.6, padding: '4px 0 0' },
    pageIndicator: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600 as const, marginRight: 4 },
  };

  return (
    <div style={s.container}>
      <div style={s.header}>Step 5: 페이지 나눔</div>

      {/* AI Auto-split settings */}
      <div style={s.section}>
        <div style={s.sectionTitle}>AI 자동 나눔</div>
        <div style={s.row}>
          <span style={s.label}>페이지당 최소:</span>
          <input type="number" min={1} max={20} value={minSentences} onChange={(e) => setMinSentences(Math.max(1, Number(e.target.value)))} style={s.numInput} />
          <span style={s.label}>최대:</span>
          <input type="number" min={1} max={50} value={maxSentences} onChange={(e) => setMaxSentences(Math.max(1, Number(e.target.value)))} style={s.numInput} />
          <span style={s.label}>문장</span>
        </div>
        <button
          type="button"
          style={{ ...s.btnOutline, marginTop: 8, ...(isSplitting || !apiKey ? s.disabled : {}) }}
          onClick={handleAutoSplit}
          disabled={isSplitting || !apiKey}
        >
          {isSplitting ? 'AI 분석 중...' : 'AI 자동 나눔'}
        </button>
        {!apiKey && <div style={{ ...s.help, color: '#E53E3E' }}>설정에서 API Key를 먼저 입력해주세요</div>}
        {error && <div style={s.error}>{error}</div>}
      </div>

      {/* Main textarea - page breaks visible as blank lines */}
      <div style={s.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={s.sectionTitle}>텍스트 편집</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ ...s.pageIndicator, background: '#E8F4FD', color: '#18A0FB' }}>
              {parsedPages.length} 페이지
            </span>
            {parsedPages.some(p => p.isEmpty) && (
              <span style={{ ...s.pageIndicator, background: '#FFF3E0', color: '#E65100' }}>
                빈 페이지: {parsedPages.filter(p => p.isEmpty).length}
              </span>
            )}
          </div>
        </div>

        <textarea
          style={s.textarea}
          value={text}
          onChange={handleTextChange}
          placeholder={"이야기를 입력하세요...\n\n빈 줄 2개 (엔터 3번) = 페이지 나눔\n빈 줄 1개 (엔터 2번) = 같은 페이지 내 새 텍스트 블록\n>> = 빈 페이지 (이미지 전용)"}
          spellCheck={false}
        />

        <div style={s.help}>
          빈 줄 2개 (엔터 3번) = 페이지 나눔 &nbsp;|&nbsp; 빈 줄 1개 = 새 텍스트 블록 &nbsp;|&nbsp; <code>{'>>'}</code> = 빈 페이지
        </div>

        {/* Inline page breakdown */}
        {parsedPages.length > 1 && (
          <div style={{ marginTop: 8, padding: 8, background: '#F8F9FA', borderRadius: 4, fontSize: 10, color: '#666', maxHeight: 120, overflowY: 'auto' }}>
            {parsedPages.map((page) => (
              <div key={page.pageIndex} style={{ padding: '2px 0', borderBottom: '1px solid #EEE' }}>
                <strong style={{ color: '#18A0FB' }}>P{page.pageIndex + 1}</strong>
                {page.isEmpty
                  ? <span style={{ color: '#AAA', fontStyle: 'italic' }}> [빈 페이지]</span>
                  : <span> {page.textBlocks.flat().join(' ').slice(0, 40)}{page.textBlocks.flat().join(' ').length > 40 ? '...' : ''}</span>
                }
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create in Figma button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>총 {parsedPages.length} 페이지 ({nonEmptyPageCount} 내용)</span>
        <button
          type="button"
          style={{ ...s.btnPrimary, ...(parsedPages.length === 0 ? s.disabled : {}) }}
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
