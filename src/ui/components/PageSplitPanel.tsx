import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { postToPlugin, usePluginMessage } from '../hooks/useFigmaMessages';
import { callGemini, extractJson } from '../utils/geminiApi';

export interface ParsedPage {
  pageIndex: number;
  textBlocks: string[][];
  isEmpty: boolean;
}

interface SceneHint {
  sceneHint: string;
  characters: string[];
  location: string;
}

interface PageSplitPanelProps {
  initialText: string;
  onTextChange: (text: string) => void;
  onPagesChange: (pages: ParsedPage[]) => void;
  apiKey: string;
  characters?: Array<{ id: string; name: string; personality: string; appearance: string }>;
  storyTitle?: string;
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
  characters = [],
  storyTitle = '',
}) => {
  const [text, setText] = useState(initialText);
  const [minSentences, setMinSentences] = useState(2);
  const [maxSentences, setMaxSentences] = useState(5);
  const [isSplitting, setIsSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagesCreated, setPagesCreated] = useState(false);
  const [sceneHints, setSceneHints] = useState<SceneHint[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  usePluginMessage(useCallback((msg) => {
    if (msg.type === 'STORY_PAGES_CREATED') {
      setPagesCreated(true);
    }
  }, []));

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
    setSceneHints([]); // Manual edit invalidates AI scene hints
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
      // Build character info section if available
      const characterSection = characters.length > 0
        ? `\n## 등장인물\n${characters.map(c => `- ${c.name}: 성격 - ${c.personality}, 외형 - ${c.appearance}`).join('\n')}`
        : '';

      const titleSection = storyTitle ? `\n## 동화 제목: ${storyTitle}` : '';

      const prompt = `당신은 어린이 동화책 편집자입니다.
동화책에서는 각 페이지에 하나의 삽화가 들어갑니다.
"한 페이지 = 한 장의 그림"이 되도록 페이지를 나눠주세요.

## 핵심 원칙
하나의 그림으로 그릴 수 있는 문장들을 같은 페이지에 묶으세요.
- 같은 장소 + 같은 시간 + 같은 인물 상호작용 → 같은 페이지
- 장소 변경 → 새 페이지
- 시간 점프 → 새 페이지
- 인물 구성이 크게 변경 → 새 페이지

## 추가 규칙
- 한 페이지에 최소 ${minSentences}문장, 최대 ${maxSentences}문장
- 같은 페이지 내에서 화자가 바뀌거나 문단이 나뉘는 곳에는 빈 줄 1개를 넣어주세요
- 원본 텍스트를 절대 수정하지 마세요. 페이지 구분만 해주세요.
${titleSection}${characterSection}

## 동화 텍스트
${rawText}

## 출력 형식 (JSON)
{
  "pages": [
    {
      "text": "이 페이지의 원본 텍스트 (수정 금지)",
      "sceneHint": "삽화 설명: 이 페이지 그림에 뭐가 보이는지 한 줄 (한국어)",
      "characters": ["등장 인물 이름"],
      "location": "장소 (한국어)"
    }
  ]
}`;

      const result = await callGemini(apiKey, prompt, 'gemini-2.5-flash');
      const parsed = JSON.parse(extractJson(result));

      // Handle new format: { pages: [...] }
      if (parsed && Array.isArray(parsed.pages) && parsed.pages.length > 0) {
        const pages = parsed.pages;
        const splitText = pages.map((p: any) => (typeof p === 'string' ? p : p.text || '').trim()).join(PAGE_SEPARATOR);
        const hints: SceneHint[] = pages.map((p: any) => ({
          sceneHint: p.sceneHint || '',
          characters: Array.isArray(p.characters) ? p.characters : [],
          location: p.location || '',
        }));
        setText(splitText);
        onTextChange(splitText);
        setSceneHints(hints);
      }
      // Fallback: old format string[]
      else if (Array.isArray(parsed) && parsed.length > 0) {
        const splitText = parsed.map((p: any) => (typeof p === 'string' ? p : String(p)).trim()).join(PAGE_SEPARATOR);
        setText(splitText);
        onTextChange(splitText);
        setSceneHints([]);
      } else {
        throw new Error('AI 응답을 파싱할 수 없습니다.');
      }
    } catch (err: any) {
      setError(err.message || 'AI 페이지 나눔 중 오류가 발생했습니다.');
    } finally {
      setIsSplitting(false);
    }
  }, [apiKey, text, minSentences, maxSentences, onTextChange, characters, storyTitle]);

  const handleSavePages = useCallback(() => {
    const pageData = parsedPages.map((p) => ({
      textBlocks: p.textBlocks,
      isEmpty: p.isEmpty,
    }));
    postToPlugin({
      type: pagesCreated ? 'UPDATE_STORY_PAGES' : 'CREATE_STORY_PAGES',
      pages: pageData,
    });
  }, [parsedPages, pagesCreated]);

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
          <div style={{ marginTop: 8, padding: 8, background: '#F8F9FA', borderRadius: 4, fontSize: 10, color: '#666', maxHeight: 180, overflowY: 'auto' }}>
            {parsedPages.map((page) => {
              const hint = sceneHints[page.pageIndex];
              return (
                <div key={page.pageIndex} style={{ padding: '3px 0', borderBottom: '1px solid #EEE' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                    <strong style={{ color: '#18A0FB' }}>P{page.pageIndex + 1}</strong>
                    {page.isEmpty
                      ? <span style={{ color: '#AAA', fontStyle: 'italic' }}>[빈 페이지]</span>
                      : (
                        <>
                          {hint && hint.location && (
                            <span style={{ color: '#8B5CF6', fontWeight: 600 }}>{hint.location}</span>
                          )}
                          {hint && hint.characters.length > 0 && (
                            <span style={{ color: '#059669' }}>{hint.characters.join(', ')}</span>
                          )}
                        </>
                      )
                    }
                  </div>
                  {!page.isEmpty && hint && hint.sceneHint && (
                    <div style={{ paddingLeft: 20, color: '#888', fontStyle: 'italic', fontSize: 9, lineHeight: 1.4, marginTop: 1 }}>
                      &ldquo;{hint.sceneHint}&rdquo;
                    </div>
                  )}
                  {!page.isEmpty && (
                    <div style={{ paddingLeft: 20, marginTop: 1 }}>
                      {page.textBlocks.flat().join(' ').slice(0, 50)}{page.textBlocks.flat().join(' ').length > 50 ? '...' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create in Figma button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>총 {parsedPages.length} 페이지 ({nonEmptyPageCount} 내용)</span>
        <button
          type="button"
          style={{ ...s.btnPrimary, ...(parsedPages.length === 0 ? s.disabled : {}) }}
          onClick={handleSavePages}
          disabled={parsedPages.length === 0}
        >
          {pagesCreated ? 'Figma에 수정 반영' : 'Figma에 생성'}
        </button>
      </div>
    </div>
  );
};

export default PageSplitPanel;
