import React, { useState, useCallback } from 'react';
import { postToPlugin } from '../hooks/useFigmaMessages';
import { callGemini, extractJson, getPageTextPreview } from '../utils/geminiApi';
import type { StoryPage, Character, SceneAnalysis } from '../../shared/pipeline';

interface SceneStructurePanelProps {
  pages: StoryPage[];
  characters: Character[];
  onPagesUpdate: (pages: StoryPage[]) => void;
  apiKey: string;
}

type AnalysisStatus = 'idle' | 'analyzing' | 'done';

function buildAllPagesPrompt(pages: StoryPage[], characters: Character[]): string {
  const charList = characters.map((c) => `${c.id}: ${c.name} (${c.personality})`).join('\n');
  const pageTexts = pages
    .filter((p) => !p.isEmpty)
    .map((p) => {
      const text = p.textBlocks.map((b) => b.join('\n')).join('\n\n');
      return `페이지 ${p.pageIndex + 1}:\n${text}`;
    })
    .join('\n---\n');

  return `다음은 동화책의 페이지별 대사입니다. 각 페이지에 대해 분석해주세요. JSON 배열로 응답해주세요.
등장인물 목록:
${charList}

각 페이지: {pageIndex: number (1부터 시작), characters: [{characterId: string, action: string}], sceneDescription: string, imagePrompt: string, backgroundType: 'white'|'full'}
backgroundType은 동작 중심 장면은 'white', 공간/상황 중심 장면은 'full'로 설정.

페이지 내용:
${pageTexts}

JSON 배열만 응답해주세요. 다른 텍스트 없이 순수 JSON만 반환하세요.`;
}

function buildSinglePagePrompt(page: StoryPage, characters: Character[]): string {
  const charList = characters.map((c) => `${c.id}: ${c.name} (${c.personality})`).join('\n');
  const text = page.textBlocks.map((b) => b.join('\n')).join('\n\n');

  return `다음 동화책 페이지를 분석해주세요. JSON 객체로 응답해주세요.
등장인물 목록:
${charList}

형식: {characters: [{characterId: string, action: string}], sceneDescription: string, imagePrompt: string, backgroundType: 'white'|'full'}
backgroundType은 동작 중심 장면은 'white', 공간/상황 중심 장면은 'full'로 설정.

페이지 ${page.pageIndex + 1} 내용:
${text}

JSON 객체만 응답해주세요. 다른 텍스트 없이 순수 JSON만 반환하세요.`;
}

const SceneStructurePanel: React.FC<SceneStructurePanelProps> = ({
  pages,
  characters,
  onPagesUpdate,
  apiKey,
}) => {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const nonEmptyPages = pages.filter((p) => !p.isEmpty);

  const handleAnalyzeAll = useCallback(async () => {
    if (!apiKey) {
      setError('API 키가 설정되지 않았습니다.');
      return;
    }
    setStatus('analyzing');
    setError(null);
    setAnalyzedCount(0);

    try {
      const prompt = buildAllPagesPrompt(pages, characters);
      const rawJson = await callGemini(apiKey, prompt);
      const results: Array<{
        pageIndex: number;
        characters: { characterId: string; action: string }[];
        sceneDescription: string;
        imagePrompt: string;
        backgroundType: 'white' | 'full';
      }> = JSON.parse(extractJson(rawJson));

      const updated = pages.map((page) => {
        const result = results.find((r) => r.pageIndex === page.pageIndex + 1);
        if (result && !page.isEmpty) {
          return {
            ...page,
            sceneAnalysis: {
              characters: result.characters,
              sceneDescription: result.sceneDescription,
              imagePrompt: result.imagePrompt,
              backgroundType: result.backgroundType,
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
  }, [pages, characters, apiKey, onPagesUpdate]);

  const handleReanalyze = useCallback(
    async (pageIndex: number) => {
      if (!apiKey) return;
      const page = pages.find((p) => p.pageIndex === pageIndex);
      if (!page || page.isEmpty) return;

      setError(null);
      try {
        const prompt = buildSinglePagePrompt(page, characters);
        const rawJson = await callGemini(apiKey, prompt);
        const result = JSON.parse(extractJson(rawJson));

        const updated = pages.map((p) => {
          if (p.pageIndex === pageIndex) {
            return {
              ...p,
              sceneAnalysis: {
                characters: result.characters,
                sceneDescription: result.sceneDescription,
                imagePrompt: result.imagePrompt,
                backgroundType: result.backgroundType,
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
    [pages, characters, apiKey, onPagesUpdate],
  );

  const handleFieldChange = useCallback(
    (pageIndex: number, field: keyof SceneAnalysis, value: string) => {
      const updated = pages.map((p) => {
        if (p.pageIndex === pageIndex && p.sceneAnalysis) {
          return {
            ...p,
            sceneAnalysis: { ...p.sceneAnalysis, [field]: value },
          };
        }
        return p;
      });
      onPagesUpdate(updated);
    },
    [pages, onPagesUpdate],
  );

  const handleBgTypeChange = useCallback(
    (pageIndex: number, bgType: 'white' | 'full') => {
      const updated = pages.map((p) => {
        if (p.pageIndex === pageIndex && p.sceneAnalysis) {
          return {
            ...p,
            sceneAnalysis: { ...p.sceneAnalysis, backgroundType: bgType },
          };
        }
        return p;
      });
      onPagesUpdate(updated);
    },
    [pages, onPagesUpdate],
  );

  const handleApplyToFigma = useCallback(() => {
    postToPlugin({
      type: 'UPDATE_STORY_PAGES',
      pages: pages.map((p) => ({
        textBlocks: p.textBlocks,
        isEmpty: p.isEmpty,
      })),
    });
  }, [pages]);

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

  const textareaSmallStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 40,
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

  const radioGroupStyle: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    marginTop: 4,
  };

  const radioLabelStyle: React.CSSProperties = {
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
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
        <button
          type="button"
          style={{
            ...btnPrimaryStyle,
            ...(status === 'analyzing' ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
          }}
          onClick={handleAnalyzeAll}
          disabled={status === 'analyzing' || nonEmptyPages.length === 0}
        >
          {status === 'analyzing' ? '분석 중...' : '전체 장면 분석'}
        </button>

        <div style={statusStyle}>
          {status === 'idle' && nonEmptyPages.length > 0 && `${nonEmptyPages.length}개 페이지 대기`}
          {status === 'analyzing' && '분석 중...'}
          {status === 'done' && `${analyzedCount}개 페이지 분석 완료`}
        </div>
      </div>

      {/* Page list */}
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {pages.map((page) => {
          if (page.isEmpty) return null;
          const analysis = page.sceneAnalysis;
          return (
            <div key={page.pageIndex} style={pageCardStyle}>
              <div style={pageHeaderStyle}>
                <span style={pageNumStyle}>Page {page.pageIndex + 1}</span>
                <button
                  type="button"
                  style={btnOutlineStyle}
                  onClick={() => handleReanalyze(page.pageIndex)}
                >
                  재분석
                </button>
              </div>

              <div style={textPreviewStyle}>{getPageTextPreview(page)}</div>

              {analysis && (
                <>
                  {/* Character tags */}
                  <div style={tagContainerStyle}>
                    {analysis.characters.map((ch, i) => {
                      const char = characters.find((c) => c.id === ch.characterId);
                      return (
                        <span key={i} style={tagStyle}>
                          {char?.name || ch.characterId}: {ch.action}
                        </span>
                      );
                    })}
                  </div>

                  {/* Scene description */}
                  <div style={labelStyle}>장면 설명</div>
                  <textarea
                    style={textareaSmallStyle}
                    value={analysis.sceneDescription}
                    onChange={(e) =>
                      handleFieldChange(page.pageIndex, 'sceneDescription', e.target.value)
                    }
                  />

                  {/* Image prompt */}
                  <div style={labelStyle}>이미지 프롬프트</div>
                  <textarea
                    style={textareaSmallStyle}
                    value={analysis.imagePrompt}
                    onChange={(e) =>
                      handleFieldChange(page.pageIndex, 'imagePrompt', e.target.value)
                    }
                  />

                  {/* Background type */}
                  <div style={labelStyle}>배경 타입</div>
                  <div style={radioGroupStyle}>
                    <label style={radioLabelStyle}>
                      <input
                        type="radio"
                        name={`bg-${page.pageIndex}`}
                        checked={analysis.backgroundType === 'white'}
                        onChange={() => handleBgTypeChange(page.pageIndex, 'white')}
                      />
                      흰 배경 (동작 중심)
                    </label>
                    <label style={radioLabelStyle}>
                      <input
                        type="radio"
                        name={`bg-${page.pageIndex}`}
                        checked={analysis.backgroundType === 'full'}
                        onChange={() => handleBgTypeChange(page.pageIndex, 'full')}
                      />
                      풀 배경 (공간/상황)
                    </label>
                  </div>
                </>
              )}

              {!analysis && (
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
