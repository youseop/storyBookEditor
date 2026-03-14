import React, { useState, useCallback } from 'react';
import { postToPlugin } from '../hooks/useFigmaMessages';
import { callGemini, extractJson, getPageTextPreview } from '../utils/geminiApi';
import type { StoryPage, Character, SceneAnalysis } from '../../shared/pipeline';

interface SceneStructurePanelProps {
  pages: StoryPage[];
  characters: Character[];
  storyText: string;
  onPagesUpdate: (pages: StoryPage[]) => void;
  apiKey: string;
}

type AnalysisStatus = 'idle' | 'analyzing' | 'done';

function buildSceneAnalysisPrompt(
  storyText: string,
  pages: StoryPage[],
  characters: Character[],
): string {
  const charSheet = characters.map((c) => ({
    name: c.name,
    personality: c.personality,
    appearance: c.appearance,
  }));

  const pageDialogues = pages
    .filter((p) => !p.isEmpty)
    .map((p, idx, arr) => {
      const text = p.textBlocks.map((b) => b.join('\n')).join('\n\n');
      // Include previous scene context if available
      const prevPage = idx > 0 ? arr[idx - 1] : null;
      const prevContext = prevPage?.sceneAnalysis
        ? `[이전 장면: ${prevPage.sceneAnalysis.sceneDescription}]`
        : '';
      return {
        pageIndex: p.pageIndex + 1,
        dialogue: text,
        previousSceneContext: prevContext || undefined,
      };
    });

  return `당신은 동화책 일러스트레이터를 위한 장면 분석 전문가입니다.
아래 동화의 전체 이야기와 등장인물 정보를 읽고, 각 페이지별로 이미지 생성에 필요한 장면 정보를 구조화해주세요.

## 전체 이야기
${storyText}

## 등장인물 시트 (캐릭터 이름은 반드시 이 목록에서만 사용)
${JSON.stringify(charSheet, null, 2)}

## 페이지별 대사
${JSON.stringify(pageDialogues, null, 2)}

## 응답 형식 (JSON 배열)
각 페이지에 대해 다음 구조로 응답해주세요:
[
  {
    "pageIndex": 1,
    "background": {
      "setting": "장소/공간 묘사 (영어, 풀배경 이미지용. 예: a cozy wooden cabin in the forest)",
      "time": "시간대 (영어. 예: golden sunset)",
      "mood": "분위기 (영어. 예: warm and peaceful)",
      "details": "배경 세부 요소 (영어. 예: smoke from chimney, flowers around the path)"
    },
    "characterNames": ["캐릭터시트에 등록된 이름만 사용"],
    "characterActions": {
      "토끼": {
        "action": "what the character is doing (영어)",
        "expression": "facial expression (영어)",
        "position": "위치 (영어. 예: center, left side)"
      }
    },
    "keyObjects": [
      {"name": "object name (영어)", "description": "appearance and state (영어)"}
    ],
    "sceneDescription": "장면 전체 요약 (한국어, UI 표시용)",
    "imageSceneDescription": "Full scene description for image generation (영어, 1-2 sentences describing the entire scene composition)"
  }
]

## 중요 규칙
1. characterNames 배열에는 반드시 등장인물 시트에 있는 이름만 사용하세요
2. 이전 장면 맥락(previousSceneContext)을 고려하여 장면의 연속성을 유지하세요
3. background의 setting/time/mood/details는 모두 영어로 작성 (이미지 생성 프롬프트에 직접 사용됨)
4. characterActions의 action/expression/position도 영어로 작성
5. keyObjects가 없으면 빈 배열 []
6. sceneDescription은 한국어 (UI 표시용), imageSceneDescription은 영어 (이미지 프롬프트용)
7. imageSceneDescription: 장면 전체를 영어 1-2문장으로 요약 (인물 행동 + 배경 + 분위기를 종합)

JSON 배열만 응답해주세요.`;
}

function buildSinglePagePrompt(
  storyText: string,
  page: StoryPage,
  characters: Character[],
  prevPage?: StoryPage,
): string {
  const charSheet = characters.map((c) => ({
    name: c.name,
    personality: c.personality,
    appearance: c.appearance,
  }));

  const text = page.textBlocks.map((b) => b.join('\n')).join('\n\n');
  const prevContext = prevPage?.sceneAnalysis
    ? `이전 장면: ${prevPage.sceneAnalysis.sceneDescription}`
    : '(첫 장면)';

  return `동화책 일러스트를 위한 장면 분석을 해주세요.

## 전체 이야기 맥락
${storyText}

## 등장인물 시트
${JSON.stringify(charSheet, null, 2)}

## 이전 장면
${prevContext}

## 현재 페이지 (${page.pageIndex + 1}) 대사
${text}

## 응답 형식 (JSON 객체 하나)
{
  "background": {"setting": string, "time": string, "mood": string, "details": string},
  "characterNames": [string],
  "characterActions": {"이름": {"action": string, "expression": string, "position": string}},
  "keyObjects": [{"name": string, "description": string}],
  "sceneDescription": string (한국어),
  "imageSceneDescription": string (영어, 장면 전체를 1-2문장으로 종합 설명)
}

규칙: characterNames에는 등장인물 시트의 이름만 사용. background/characterActions/keyObjects/imageSceneDescription는 영어. sceneDescription만 한국어.

JSON 객체만 응답해주세요.`;
}

const SceneStructurePanel: React.FC<SceneStructurePanelProps> = ({
  pages,
  characters,
  storyText,
  onPagesUpdate,
  apiKey,
}) => {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reanalyzeSummary, setReanalyzeSummary] = useState<string | null>(null);
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<SceneAnalysis | null>(null);

  const nonEmptyPages = pages.filter((p) => !p.isEmpty);

  const handleAnalyzeAll = useCallback(async () => {
    if (!apiKey) { setError('API 키가 설정되지 않았습니다.'); return; }
    setStatus('analyzing');
    setError(null);
    setAnalyzedCount(0);

    try {
      const prompt = buildSceneAnalysisPrompt(storyText, pages, characters);
      const rawJson = await callGemini(apiKey, prompt);
      const results: Array<{
        pageIndex: number;
        background: { setting: string; time: string; mood: string; details: string };
        characterNames: string[];
        characterActions: Record<string, { action: string; expression: string; position: string }>;
        keyObjects: Array<{ name: string; description: string }>;
        sceneDescription: string;
        imageSceneDescription?: string;
      }> = JSON.parse(extractJson(rawJson));

      const updated = pages.map((page) => {
        const result = results.find((r) => r.pageIndex === page.pageIndex + 1);
        if (result && !page.isEmpty) {
          return {
            ...page,
            sceneAnalysis: {
              background: result.background,
              characterNames: result.characterNames,
              characterActions: result.characterActions,
              keyObjects: result.keyObjects || [],
              sceneDescription: result.sceneDescription,
              imageSceneDescription: result.imageSceneDescription || '',
            },
          };
        }
        return page;
      });

      onPagesUpdate(updated);
      setAnalyzedCount(results.length);
      setStatus('done');
    } catch (err: any) {
      setError(err.message || '분석 중 오류가 발생했습니다.');
      setStatus('idle');
    }
  }, [pages, characters, storyText, apiKey, onPagesUpdate]);

  const handleReanalyzeAll = useCallback(async () => {
    if (!apiKey) { setError('API 키가 설정되지 않았습니다.'); return; }
    if (nonEmptyPages.length === 0) return;

    setStatus('analyzing');
    setError(null);
    setReanalyzeSummary(null);
    setAnalyzedCount(0);

    try {
      const prompt = buildSceneAnalysisPrompt(storyText, pages, characters);
      const rawJson = await callGemini(apiKey, prompt);
      const results: Array<{
        pageIndex: number;
        background: { setting: string; time: string; mood: string; details: string };
        characterNames: string[];
        characterActions: Record<string, { action: string; expression: string; position: string }>;
        keyObjects: Array<{ name: string; description: string }>;
        sceneDescription: string;
        imageSceneDescription?: string;
      }> = JSON.parse(extractJson(rawJson));

      const updated = pages.map((page) => {
        const result = results.find((r) => r.pageIndex === page.pageIndex + 1);
        if (result && !page.isEmpty) {
          return {
            ...page,
            sceneAnalysis: {
              background: result.background,
              characterNames: result.characterNames,
              characterActions: result.characterActions,
              keyObjects: result.keyObjects || [],
              sceneDescription: result.sceneDescription,
              imageSceneDescription: result.imageSceneDescription || '',
            },
          };
        }
        return page;
      });

      onPagesUpdate(updated);
      setAnalyzedCount(results.length);
      setStatus('done');

      // Build summary
      const summaryLines = results.map((r) => {
        const chars = r.characterNames.join(', ');
        return `P${r.pageIndex}: ${chars} | ${r.background.setting.slice(0, 30)}`;
      });
      setReanalyzeSummary(summaryLines.join('\n'));
    } catch (err: any) {
      setError(err.message || '일괄 재분석 중 오류가 발생했습니다.');
      setStatus('idle');
    }
  }, [pages, characters, storyText, apiKey, onPagesUpdate, nonEmptyPages]);

  const handleReanalyze = useCallback(
    async (pageIndex: number) => {
      if (!apiKey) return;
      const page = pages.find((p) => p.pageIndex === pageIndex);
      if (!page || page.isEmpty) return;

      // Find previous non-empty page for context
      const prevPage = pages
        .filter((p) => !p.isEmpty && p.pageIndex < pageIndex)
        .sort((a, b) => b.pageIndex - a.pageIndex)[0];

      setError(null);
      try {
        const prompt = buildSinglePagePrompt(storyText, page, characters, prevPage);
        const rawJson = await callGemini(apiKey, prompt);
        const result = JSON.parse(extractJson(rawJson));

        const updated = pages.map((p) => {
          if (p.pageIndex === pageIndex) {
            return {
              ...p,
              sceneAnalysis: {
                background: result.background,
                characterNames: result.characterNames,
                characterActions: result.characterActions,
                keyObjects: result.keyObjects || [],
                sceneDescription: result.sceneDescription,
              imageSceneDescription: result.imageSceneDescription || '',
              } as SceneAnalysis,
            };
          }
          return p;
        });
        onPagesUpdate(updated);
      } catch (err: any) {
        setError(`페이지 ${pageIndex + 1} 재분석 오류: ${err.message}`);
      }
    },
    [pages, characters, storyText, apiKey, onPagesUpdate],
  );

  const handleApplyToFigma = useCallback(() => {
    postToPlugin({
      type: 'UPDATE_STORY_PAGES',
      pages: pages.map((p) => ({
        textBlocks: p.textBlocks,
        isEmpty: p.isEmpty,
      })),
    });

    const analyzedPages = pages.filter((p) => p.sceneAnalysis && !p.isEmpty);
    if (analyzedPages.length > 0) {
      const characterNames: Record<string, string> = {};
      characters.forEach((c) => { characterNames[c.id] = c.name; });

      postToPlugin({
        type: 'SAVE_SCENE_ANALYSIS',
        pages: analyzedPages.map((p) => ({
          pageIndex: p.pageIndex,
          characters: p.sceneAnalysis!.characterNames.map(name => ({
            characterId: name,
            action: p.sceneAnalysis!.characterActions[name]?.action || '',
          })),
          sceneDescription: p.sceneAnalysis!.sceneDescription,
          imagePrompt: `${p.sceneAnalysis!.background.setting}, ${p.sceneAnalysis!.background.mood}`,
          backgroundType: 'full' as const,
        })),
        characterNames,
      });
    }
  }, [pages, characters]);

  // --- Scene analysis edit handlers ---
  const handleStartEdit = useCallback((pageIndex: number) => {
    const page = pages.find(p => p.pageIndex === pageIndex);
    if (page?.sceneAnalysis) {
      setEditDraft(JSON.parse(JSON.stringify(page.sceneAnalysis)));
      setEditingPage(pageIndex);
    }
  }, [pages]);

  const handleSaveEdit = useCallback((pageIndex: number) => {
    if (!editDraft) return;
    const updated = pages.map(p =>
      p.pageIndex === pageIndex ? { ...p, sceneAnalysis: editDraft } : p
    );
    onPagesUpdate(updated);
    setEditingPage(null);
    setEditDraft(null);
  }, [editDraft, pages, onPagesUpdate]);

  const handleCancelEdit = useCallback(() => {
    setEditingPage(null);
    setEditDraft(null);
  }, []);

  const updateDraftField = useCallback((path: string, value: string) => {
    setEditDraft(prev => {
      if (!prev) return prev;
      const draft = { ...prev };
      if (path.startsWith('background.')) {
        const key = path.split('.')[1] as keyof SceneAnalysis['background'];
        draft.background = { ...draft.background, [key]: value };
      } else if (path === 'imageSceneDescription') {
        draft.imageSceneDescription = value;
      } else if (path === 'sceneDescription') {
        draft.sceneDescription = value;
      } else if (path === 'characterNames') {
        draft.characterNames = value.split(',').map(s => s.trim()).filter(Boolean);
      }
      return draft;
    });
  }, []);

  const updateDraftAction = useCallback((charName: string, field: string, value: string) => {
    setEditDraft(prev => {
      if (!prev) return prev;
      const actions = { ...prev.characterActions };
      actions[charName] = { ...actions[charName], [field]: value };
      return { ...prev, characterActions: actions };
    });
  }, []);

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

  const textPreviewStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    marginBottom: 6,
  };

  const tagContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
    marginBottom: 6,
  };

  const tagStyle: React.CSSProperties = {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 10,
    background: '#E8F4FD',
    color: '#18A0FB',
    fontWeight: 600,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    color: '#666',
    marginBottom: 2,
    marginTop: 6,
  };

  const statusStyle: React.CSSProperties = {
    fontSize: 11,
    color: status === 'analyzing' ? '#F5A623' : status === 'done' ? '#1BC47D' : '#999',
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

  const analyzedPagesCount = pages.filter((p) => p.sceneAnalysis).length;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 6: 장면 구조화</div>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Analysis controls */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button
            type="button"
            style={{
              ...btnPrimaryStyle,
              flex: 1,
              ...(status === 'analyzing' ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
            onClick={handleAnalyzeAll}
            disabled={status === 'analyzing' || nonEmptyPages.length === 0}
          >
            {status === 'analyzing' ? '분석 중...' : '전체 장면 분석'}
          </button>
          {analyzedPagesCount > 0 && (
            <button
              type="button"
              style={{
                ...btnPrimaryStyle,
                flex: 1,
                background: '#F5A623',
                ...(status === 'analyzing' ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
              }}
              onClick={handleReanalyzeAll}
              disabled={status === 'analyzing' || nonEmptyPages.length === 0}
            >
              {status === 'analyzing' ? '재분석 중...' : '일괄 재분석'}
            </button>
          )}
        </div>

        <div style={statusStyle}>
          {status === 'idle' && nonEmptyPages.length > 0 && `${nonEmptyPages.length}개 페이지 대기`}
          {status === 'analyzing' && '분석 중...'}
          {status === 'done' && `${analyzedCount}개 페이지 분석 완료`}
        </div>
      </div>

      {/* Reanalyze summary */}
      {reanalyzeSummary && (
        <div style={{
          fontSize: 10,
          color: '#555',
          background: '#F8F9FA',
          border: '1px solid #E5E5E5',
          borderRadius: 6,
          padding: 10,
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6,
          maxHeight: 160,
          overflowY: 'auto',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#333', marginBottom: 6 }}>
            재분석 결과 요약
          </div>
          {reanalyzeSummary}
        </div>
      )}

      {/* Page list */}
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {pages.map((page) => {
          if (page.isEmpty) return null;
          const analysis = page.sceneAnalysis;
          return (
            <div key={page.pageIndex} style={pageCardStyle}>
              <div style={pageHeaderStyle}>
                <span style={pageNumStyle}>Page {page.pageIndex + 1}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {analysis && editingPage !== page.pageIndex && (
                    <button
                      type="button"
                      style={{ ...btnOutlineStyle, color: '#F5A623', borderColor: '#F5A623' }}
                      onClick={() => handleStartEdit(page.pageIndex)}
                    >
                      편집
                    </button>
                  )}
                  <button
                    type="button"
                    style={btnOutlineStyle}
                    onClick={() => handleReanalyze(page.pageIndex)}
                  >
                    재분석
                  </button>
                </div>
              </div>

              <div style={textPreviewStyle}>{getPageTextPreview(page)}</div>

              {/* Read-only display */}
              {analysis && editingPage !== page.pageIndex && (
                <>
                  {/* Character names with validation */}
                  <div style={tagContainerStyle}>
                    {analysis.characterNames.map((name, i) => {
                      const isValid = characters.some((c) => c.name === name);
                      return (
                        <span key={i} style={{
                          ...tagStyle,
                          ...(isValid ? {} : { background: '#FFE0E0', color: '#E53935', border: '1px solid #E53935' }),
                        }}>
                          {name}
                          {!isValid && ' (시트에 없음!)'}
                        </span>
                      );
                    })}
                  </div>

                  {/* Character actions */}
                  {Object.entries(analysis.characterActions).map(([name, info]) => (
                    <div key={name} style={{ fontSize: 10, color: '#555', padding: '2px 0' }}>
                      <strong>{name}</strong>: {info.action} ({info.expression})
                    </div>
                  ))}

                  {/* Background info */}
                  <div style={labelStyle}>배경</div>
                  <div style={{ fontSize: 10, color: '#666', background: '#F5F5F5', padding: 6, borderRadius: 4, lineHeight: 1.5 }}>
                    {analysis.background.setting} · {analysis.background.time} · {analysis.background.mood}
                    {analysis.background.details && <div style={{ marginTop: 2, color: '#888' }}>{analysis.background.details}</div>}
                  </div>

                  {/* Key objects */}
                  {analysis.keyObjects.length > 0 && (
                    <>
                      <div style={labelStyle}>핵심 사물</div>
                      {analysis.keyObjects.map((obj, i) => (
                        <div key={i} style={{ fontSize: 10, color: '#666', padding: '2px 0' }}>
                          · {obj.name}: {obj.description}
                        </div>
                      ))}
                    </>
                  )}

                  {/* Scene description (Korean) */}
                  <div style={labelStyle}>장면 설명</div>
                  <div style={{ fontSize: 11, color: '#333', background: '#F9F9F9', padding: 6, borderRadius: 4, lineHeight: 1.4 }}>
                    {analysis.sceneDescription}
                  </div>

                  {/* Image scene description (English) */}
                  {analysis.imageSceneDescription && (
                    <>
                      <div style={labelStyle}>이미지 장면 설명 (EN)</div>
                      <div style={{ fontSize: 10, color: '#18A0FB', background: '#F0F8FF', padding: 6, borderRadius: 4, lineHeight: 1.4, fontStyle: 'italic' }}>
                        {analysis.imageSceneDescription}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Edit mode */}
              {editingPage === page.pageIndex && editDraft && (
                <div style={{ padding: 8, background: '#FFF8E1', borderRadius: 6, border: '1px solid #FFE082', fontSize: 10 }}>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>장면 설명 (한국어)</div>
                    <textarea
                      value={editDraft.sceneDescription}
                      onChange={(e) => updateDraftField('sceneDescription', e.target.value)}
                      style={{ width: '100%', minHeight: 40, padding: 4, border: '1px solid #DDD', borderRadius: 3, fontSize: 10, resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>이미지 프롬프트 (영어)</div>
                    <textarea
                      value={editDraft.imageSceneDescription}
                      onChange={(e) => updateDraftField('imageSceneDescription', e.target.value)}
                      style={{ width: '100%', minHeight: 48, padding: 4, border: '1px solid #18A0FB', borderRadius: 3, fontSize: 10, resize: 'vertical', boxSizing: 'border-box', background: '#F0F8FF' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>배경 (setting)</div>
                      <input value={editDraft.background.setting} onChange={(e) => updateDraftField('background.setting', e.target.value)}
                        style={{ width: '100%', padding: '3px 4px', border: '1px solid #DDD', borderRadius: 3, fontSize: 10, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>시간</div>
                      <input value={editDraft.background.time} onChange={(e) => updateDraftField('background.time', e.target.value)}
                        style={{ width: '100%', padding: '3px 4px', border: '1px solid #DDD', borderRadius: 3, fontSize: 10, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>분위기</div>
                      <input value={editDraft.background.mood} onChange={(e) => updateDraftField('background.mood', e.target.value)}
                        style={{ width: '100%', padding: '3px 4px', border: '1px solid #DDD', borderRadius: 3, fontSize: 10, boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>배경 세부</div>
                    <input value={editDraft.background.details} onChange={(e) => updateDraftField('background.details', e.target.value)}
                      style={{ width: '100%', padding: '3px 4px', border: '1px solid #DDD', borderRadius: 3, fontSize: 10, boxSizing: 'border-box' }} />
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>등장인물 (쉼표로 구분)</div>
                    <input value={editDraft.characterNames.join(', ')} onChange={(e) => updateDraftField('characterNames', e.target.value)}
                      style={{ width: '100%', padding: '3px 4px', border: '1px solid #DDD', borderRadius: 3, fontSize: 10, boxSizing: 'border-box' }} />
                  </div>

                  {editDraft.characterNames.map((name) => {
                    const action = editDraft.characterActions[name] || { action: '', expression: '', position: '' };
                    return (
                      <div key={name} style={{ marginBottom: 4, padding: 4, background: '#fff', borderRadius: 3, border: '1px solid #EEE' }}>
                        <div style={{ fontWeight: 600, color: '#059669', marginBottom: 2 }}>{name}</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input placeholder="action" value={action.action} onChange={(e) => updateDraftAction(name, 'action', e.target.value)}
                            style={{ flex: 2, padding: '2px 4px', border: '1px solid #DDD', borderRadius: 2, fontSize: 9, boxSizing: 'border-box' }} />
                          <input placeholder="expression" value={action.expression} onChange={(e) => updateDraftAction(name, 'expression', e.target.value)}
                            style={{ flex: 1, padding: '2px 4px', border: '1px solid #DDD', borderRadius: 2, fontSize: 9, boxSizing: 'border-box' }} />
                          <input placeholder="position" value={action.position} onChange={(e) => updateDraftAction(name, 'position', e.target.value)}
                            style={{ flex: 1, padding: '2px 4px', border: '1px solid #DDD', borderRadius: 2, fontSize: 9, boxSizing: 'border-box' }} />
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button type="button" onClick={() => handleSaveEdit(page.pageIndex)}
                      style={{ flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 700, color: '#fff', background: '#18A0FB', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                      저장
                    </button>
                    <button type="button" onClick={handleCancelEdit}
                      style={{ flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600, color: '#666', background: '#fff', border: '1px solid #DDD', borderRadius: 4, cursor: 'pointer' }}>
                      취소
                    </button>
                  </div>
                </div>
              )}

              {!analysis && editingPage !== page.pageIndex && (
                <div style={{ fontSize: 11, color: '#AAA', fontStyle: 'italic' }}>
                  분석 결과 없음
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Apply to Figma */}
      <button
        type="button"
        style={{
          ...btnPrimaryStyle,
          background: '#1BC47D',
          ...(analyzedPagesCount === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        }}
        onClick={handleApplyToFigma}
        disabled={analyzedPagesCount === 0}
      >
        Figma에 반영
      </button>

      {/* Status indicator */}
      <div style={{ fontSize: 10, color: '#999', textAlign: 'center' }}>
        분석된 페이지: {analyzedPagesCount} / {nonEmptyPages.length}
      </div>
    </div>
  );
};

export default SceneStructurePanel;
