import React, { useState, useCallback, useEffect } from 'react';
import { getPageTextPreview } from '../utils/geminiApi';
import { postToPlugin, usePluginMessage } from '../hooks/useFigmaMessages';
import { base64ToUint8Array } from '../services/geminiService';
import { usePipelineImages, type GeneratedImage } from '../hooks/usePipelineImages';
import type { StoryPage, Character, SceneAnalysis } from '../../shared/pipeline';
import ImageStrip from './ImageStrip';
import ImageHoverPreview from './ImageHoverPreview';

function buildImagePrompt(
  page: StoryPage,
  characters: Character[],
  bgType: 'white' | 'full',
): string {
  const analysis = page.sceneAnalysis;
  if (!analysis) return page.textBlocks.flat().join(' ');

  // Scene overview
  const sceneOverview = analysis.imageSceneDescription || analysis.sceneDescription;

  // Build character descriptions from Character sheet + scene actions
  const charDescriptions = analysis.characterNames
    .map((name) => {
      const char = characters.find((c) => c.name === name);
      const charAction = analysis.characterActions[name];
      if (!char && !charAction) return null;
      const appearance = char?.appearance || '';
      const action = charAction?.action || '';
      const expression = charAction?.expression || '';
      const position = charAction?.position || '';
      return `${name} (${appearance}) - ${action}, ${expression}, at ${position}`;
    })
    .filter(Boolean)
    .join('. ');

  // Key objects
  const objects = analysis.keyObjects
    .map((o) => `${o.name}: ${o.description}`)
    .join('. ');

  const objectsPart = objects ? `Key objects: ${objects}. ` : '';

  if (bgType === 'white') {
    return [
      `High-quality 4K children's book illustration, 1:1 square format.`,
      `Scene: ${sceneOverview}`,
      `Clean pure white background, no environment or scenery.`,
      `Characters: ${charDescriptions}.`,
      objectsPart,
      `Draw in the exact same art style as the reference image provided.`,
      `No text, no letters, no words. Illustration only. Ultra-detailed, sharp, 4096x4096 resolution.`,
    ].filter(Boolean).join(' ');
  } else {
    const bg = analysis.background;
    return [
      `High-quality 4K children's book illustration, 1:1 square format.`,
      `Scene: ${sceneOverview}`,
      `Setting: ${bg.setting}. Time: ${bg.time}. Mood: ${bg.mood}. ${bg.details}`,
      `Characters: ${charDescriptions}.`,
      objectsPart,
      `Draw in the exact same art style as the reference image provided.`,
      `No text, no letters, no words. Illustration only. Ultra-detailed, sharp, 4096x4096 resolution.`,
    ].filter(Boolean).join(' ');
  }
}

interface ImageBulkGenPanelProps {
  pages: StoryPage[];
  characters: Character[];
  styleDescription: string;
  referenceImageBase64?: string;
  apiKey: string;
  onImageSelect: (pageIndex: number, variant: number) => void;
  onPagesUpdate: (pages: StoryPage[]) => void;
}

interface PageImageState {
  images: GeneratedImage[];
  selectedImageId: string | null;
  customPrompt: string;
  variantMap: Record<string, number>; // imageId → Figma variant number
}

const ImageBulkGenPanel: React.FC<ImageBulkGenPanelProps> = ({
  pages,
  characters,
  styleDescription,
  referenceImageBase64,
  apiKey,
  onImageSelect,
  onPagesUpdate,
}) => {
  const nonEmptyPages = pages.filter((p) => !p.isEmpty);

  const [imageStates, setImageStates] = useState<Record<number, PageImageState>>(() => {
    const init: Record<number, PageImageState> = {};
    nonEmptyPages.forEach((p) => {
      init[p.pageIndex] = {
        images: [],
        selectedImageId: null,
        customPrompt: '',
        variantMap: {},
      };
    });
    return init;
  });

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ base64: string; x: number; y: number } | null>(null);

  const {
    generateSceneImages,
    cancel: cancelPipelineGen,
  } = usePipelineImages();

  // Load existing images from Figma on mount
  useEffect(() => {
    postToPlugin({ type: 'LOAD_PAGE_IMAGES' });
  }, []);

  // Handle loaded images from Figma
  usePluginMessage(useCallback((msg) => {
    if (msg.type === 'PAGE_IMAGES_LOADED') {
      const loaded = msg as import('../../shared/messageTypes').PageImagesLoadedMessage;
      if (!loaded.pages || loaded.pages.length === 0) return;

      setImageStates((prev) => {
        const next = { ...prev };
        for (const pageData of loaded.pages) {
          const existing = next[pageData.pageIndex]?.images || [];
          // Convert imageBytes to base64 data URL for display
          const loadedImages: GeneratedImage[] = pageData.images.map((img) => {
            const bytes = new Uint8Array(img.imageBytes);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            return {
              id: `figma_${pageData.pageIndex}_${img.variant}`,
              base64,
              prompt: `${img.backgroundType === 'white' ? '흰배경' : '풀배경'} V${img.variant + 1}`,
              aspectRatio: '3:4',
            };
          });

          // Merge: keep existing UI images, add loaded Figma images (skip duplicates)
          const existingIds = new Set(existing.map((e) => e.id));
          const newImages = loadedImages.filter((li) => !existingIds.has(li.id));

          // Build variant map from loaded images
          const prevVariantMap = next[pageData.pageIndex]?.variantMap || {};
          const loadedVariantMap: Record<string, number> = {};
          pageData.images.forEach((img) => {
            loadedVariantMap[`figma_${pageData.pageIndex}_${img.variant}`] = img.variant;
          });

          const selectedId = pageData.selectedVariant !== undefined
            ? `figma_${pageData.pageIndex}_${pageData.selectedVariant}`
            : next[pageData.pageIndex]?.selectedImageId || null;

          next[pageData.pageIndex] = {
            images: [...existing, ...newImages],
            selectedImageId: selectedId,
            customPrompt: next[pageData.pageIndex]?.customPrompt || '',
            variantMap: { ...prevVariantMap, ...loadedVariantMap },
          };
        }
        return next;
      });
    }
  }, []));

  /**
   * Generate images for a set of pages. Each page produces 4 images
   * (2 white bg + 2 full bg).
   */
  const generateForPages = useCallback(
    async (pagesToGen: StoryPage[]) => {
      if (!apiKey) {
        setError('API Key가 설정되지 않았습니다. Settings에서 설정해주세요.');
        return;
      }
      setGenerating(true);
      setError(null);
      const totalImages = pagesToGen.length * 4;
      setProgress({ current: 0, total: totalImages });

      let completedCount = 0;

      for (const page of pagesToGen) {
        let firstImageId: string | null = null;

        for (const bgType of ['white', 'full'] as const) {
          const scenePrompt = buildImagePrompt(page, characters, bgType);
          try {
            const images = await generateSceneImages(
              apiKey,
              scenePrompt,
              styleDescription,
              bgType,
              referenceImageBase64,
              2,
            );

            images.forEach((img, imgIdx) => {
              const variant = (bgType === 'white' ? 0 : 2) + imgIdx;

              // Track first generated image for auto-selection
              if (variant === 0) firstImageId = img.id;

              // Prepend to images list + track variant mapping
              setImageStates((prev) => {
                const prevState = prev[page.pageIndex] || {
                  images: [],
                  selectedImageId: null,
                  customPrompt: '',
                  variantMap: {},
                };
                return {
                  ...prev,
                  [page.pageIndex]: {
                    ...prevState,
                    images: [img, ...prevState.images],
                    variantMap: { ...prevState.variantMap, [img.id]: variant },
                  },
                };
              });

              // Send to sandbox for storage
              const bytes = base64ToUint8Array(img.base64);
              postToPlugin({
                type: 'STORE_SCENE_IMAGE',
                pageIndex: page.pageIndex,
                imageBytes: Array.from(bytes),
                variant,
                backgroundType: bgType,
              });

              // Also save to gallery
              postToPlugin({
                type: 'SAVE_TO_GALLERY',
                category: 'scene',
                imageId: img.id,
                imageBytes: Array.from(bytes),
                label: `P${page.pageIndex + 1} ${bgType === 'white' ? '흰배경' : '풀배경'} #${imgIdx + 1}`,
                metadata: JSON.stringify({ pageIndex: page.pageIndex, variant, bgType }),
              });
            });
          } catch (err: any) {
            if (err.message === 'Cancelled') break;
            setError(`Page ${page.pageIndex + 1} (${bgType}): ${err.message}`);
          }

          completedCount += 2;
          setProgress({ current: completedCount, total: totalImages });
        }

        // Auto-select first generated image and place on page
        if (firstImageId) {
          const autoId = firstImageId;
          postToPlugin({
            type: 'SELECT_SCENE_IMAGE',
            pageIndex: page.pageIndex,
            variant: 0,
          });
          onImageSelect(page.pageIndex, 0);
          setImageStates((prev) => ({
            ...prev,
            [page.pageIndex]: {
              ...prev[page.pageIndex],
              selectedImageId: autoId,
            },
          }));
        }
      }

      setGenerating(false);
    },
    [apiKey, characters, styleDescription, referenceImageBase64, generateSceneImages, onImageSelect],
  );

  const handleGenerateFirst4 = useCallback(async () => {
    const pagesToGen = nonEmptyPages.slice(0, 4);
    await generateForPages(pagesToGen);
  }, [nonEmptyPages, generateForPages]);

  const handleGenerateAll = useCallback(async () => {
    await generateForPages(nonEmptyPages);
  }, [nonEmptyPages, generateForPages]);

  const handleCancel = useCallback(() => {
    cancelPipelineGen();
    setGenerating(false);
    setProgress({ current: 0, total: 0 });
  }, [cancelPipelineGen]);

  const handleHoverImage = useCallback((base64: string | null, event: React.MouseEvent | null) => {
    if (base64 && event) {
      setHoverPreview({ base64, x: event.clientX, y: event.clientY });
    } else {
      setHoverPreview(null);
    }
  }, []);

  // --- Scene analysis edit ---
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<SceneAnalysis | null>(null);
  const [expandedScenes, setExpandedScenes] = useState<Set<number>>(new Set());

  const toggleSceneExpand = useCallback((pageIndex: number) => {
    setExpandedScenes(prev => {
      const next = new Set(prev);
      if (next.has(pageIndex)) next.delete(pageIndex); else next.add(pageIndex);
      return next;
    });
  }, []);

  const handleStartEdit = useCallback((pageIndex: number) => {
    const page = pages.find(p => p.pageIndex === pageIndex);
    if (page?.sceneAnalysis) {
      setEditDraft(JSON.parse(JSON.stringify(page.sceneAnalysis)));
      setEditingPage(pageIndex);
      setExpandedScenes(prev => new Set(prev).add(pageIndex));
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

  const handleSelectImage = useCallback(
    (pageIndex: number, imageId: string) => {
      setImageStates((prev) => {
        const state = prev[pageIndex];
        const variant = state?.variantMap[imageId];
        if (variant === undefined) return prev;

        postToPlugin({
          type: 'SELECT_SCENE_IMAGE',
          pageIndex,
          variant,
        });
        onImageSelect(pageIndex, variant);

        return {
          ...prev,
          [pageIndex]: {
            ...prev[pageIndex],
            selectedImageId: imageId,
          },
        };
      });
    },
    [onImageSelect],
  );

  const handleCustomPromptChange = useCallback((pageIndex: number, prompt: string) => {
    setImageStates((prev) => ({
      ...prev,
      [pageIndex]: {
        ...prev[pageIndex],
        customPrompt: prompt,
      },
    }));
  }, []);

  const handleRegenerate = useCallback(
    async (pageIndex: number) => {
      if (!apiKey) return;
      const state = imageStates[pageIndex];
      if (!state) return;

      const page = nonEmptyPages.find((p) => p.pageIndex === pageIndex);
      if (!page) return;

      setGenerating(true);
      setProgress({ current: 0, total: 4 });
      setError(null);

      let completedCount = 0;
      let firstImageId: string | null = null;

      for (const bgType of ['white', 'full'] as const) {
        const scenePrompt = state.customPrompt || buildImagePrompt(page, characters, bgType);
        try {
          const images = await generateSceneImages(
            apiKey,
            scenePrompt,
            styleDescription,
            bgType,
            referenceImageBase64,
            2,
          );

          images.forEach((img, imgIdx) => {
            const variant = (bgType === 'white' ? 0 : 2) + imgIdx;

            if (variant === 0) firstImageId = img.id;

            setImageStates((prev) => {
              const prevState = prev[pageIndex];
              return {
                ...prev,
                [pageIndex]: {
                  ...prevState,
                  images: [img, ...prevState.images],
                  selectedImageId: null,
                  variantMap: { ...prevState.variantMap, [img.id]: variant },
                },
              };
            });

            const bytes = base64ToUint8Array(img.base64);
            postToPlugin({
              type: 'STORE_SCENE_IMAGE',
              pageIndex,
              imageBytes: Array.from(bytes),
              variant,
              backgroundType: bgType,
            });

            // Also save to gallery
            postToPlugin({
              type: 'SAVE_TO_GALLERY',
              category: 'scene',
              imageId: img.id,
              imageBytes: Array.from(bytes),
              label: `P${pageIndex + 1} ${bgType === 'white' ? '흰배경' : '풀배경'} #${imgIdx + 1}`,
              metadata: JSON.stringify({ pageIndex, variant, bgType }),
            });
          });
        } catch (err: any) {
          if (err.message !== 'Cancelled') {
            setError(`Page ${pageIndex + 1} 재생성 오류: ${err.message}`);
          }
        }

        completedCount += 2;
        setProgress({ current: completedCount, total: 4 });
      }

      // Auto-select first regenerated image
      if (firstImageId) {
        const autoId = firstImageId;
        postToPlugin({
          type: 'SELECT_SCENE_IMAGE',
          pageIndex,
          variant: 0,
        });
        onImageSelect(pageIndex, 0);
        setImageStates((prev) => ({
          ...prev,
          [pageIndex]: {
            ...prev[pageIndex],
            selectedImageId: autoId,
          },
        }));
      }

      setGenerating(false);
    },
    [apiKey, imageStates, nonEmptyPages, characters, styleDescription, referenceImageBase64, generateSceneImages, onImageSelect],
  );

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

  const progressBarContainerStyle: React.CSSProperties = {
    width: '100%',
    height: 6,
    background: '#F0F0F0',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 6,
  };

  const progressBarFillStyle: React.CSSProperties = {
    height: '100%',
    background: '#18A0FB',
    borderRadius: 3,
    transition: 'width 0.3s ease',
    width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%',
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
    marginBottom: 8,
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#E53E3E',
    padding: '4px 8px',
    background: '#FFF3F3',
    borderRadius: 4,
    marginBottom: 4,
  };

  const regenRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '4px 6px',
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    fontSize: 11,
    outline: 'none',
  };

  const noteStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
    padding: '8px 0',
    fontStyle: 'italic',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 7: 이미지 벌크 생성</div>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Generation controls */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            style={{
              ...btnPrimaryStyle,
              flex: 1,
              ...(generating ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
            onClick={handleGenerateFirst4}
            disabled={generating}
          >
            첫 4페이지 생성
          </button>
          <button
            type="button"
            style={{
              ...btnPrimaryStyle,
              flex: 1,
              background: '#1BC47D',
              ...(generating ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
            onClick={handleGenerateAll}
            disabled={generating}
          >
            전체 페이지 생성
          </button>
        </div>

        {/* Progress bar */}
        {generating && (
          <>
            <div style={progressBarContainerStyle}>
              <div style={progressBarFillStyle} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: '#999' }}>
                {progress.current} / {progress.total} 이미지
              </span>
              <button
                type="button"
                onClick={handleCancel}
                style={{ fontSize: 10, color: '#E53E3E', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                취소
              </button>
            </div>
          </>
        )}
      </div>

      {/* Page-by-page image grid */}
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {nonEmptyPages.map((page) => {
          const state = imageStates[page.pageIndex];
          if (!state) return null;
          return (
            <div key={page.pageIndex} style={pageCardStyle}>
              <div style={pageHeaderStyle}>
                <span style={pageNumStyle}>Page {page.pageIndex + 1}</span>
              </div>
              <div style={textPreviewStyle}>{getPageTextPreview(page)}</div>

              {/* Scene analysis info */}
              {page.sceneAnalysis && editingPage !== page.pageIndex && (
                <div style={{ marginBottom: 8, padding: 8, background: '#F8F9FA', borderRadius: 4, fontSize: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <button
                      type="button"
                      onClick={() => toggleSceneExpand(page.pageIndex)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 10, fontWeight: 600, color: '#555' }}
                    >
                      {expandedScenes.has(page.pageIndex) ? '▾' : '▸'} 장면 정보
                    </button>
                    <button
                      type="button"
                      style={{ fontSize: 9, padding: '2px 6px', background: '#fff', border: '1px solid #CCC', borderRadius: 3, cursor: 'pointer', color: '#555' }}
                      onClick={() => handleStartEdit(page.pageIndex)}
                    >
                      편집
                    </button>
                  </div>
                  {/* Compact always-visible summary */}
                  <div style={{ color: '#666', lineHeight: 1.5 }}>
                    <div>
                      <span style={{ color: '#8B5CF6' }}>{page.sceneAnalysis.background.setting}</span>
                      {' · '}
                      <span style={{ color: '#059669' }}>{page.sceneAnalysis.characterNames.join(', ')}</span>
                    </div>
                  </div>
                  {/* Expanded details */}
                  {expandedScenes.has(page.pageIndex) && (
                    <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #E5E5E5', lineHeight: 1.5, color: '#666' }}>
                      <div style={{ marginBottom: 2 }}>
                        <span style={{ fontWeight: 600 }}>배경:</span> {page.sceneAnalysis.background.setting} · {page.sceneAnalysis.background.time} · {page.sceneAnalysis.background.mood}
                        {page.sceneAnalysis.background.details && <span style={{ color: '#888' }}> · {page.sceneAnalysis.background.details}</span>}
                      </div>
                      {Object.entries(page.sceneAnalysis.characterActions).map(([name, info]) => (
                        <div key={name} style={{ marginBottom: 1 }}>
                          <span style={{ fontWeight: 600 }}>{name}:</span> {info.action} ({info.expression}) — {info.position}
                        </div>
                      ))}
                      <div style={{ color: '#333', marginTop: 2 }}>{page.sceneAnalysis.sceneDescription}</div>
                      <div style={{ color: '#18A0FB', fontStyle: 'italic', marginTop: 2 }}>{page.sceneAnalysis.imageSceneDescription}</div>
                    </div>
                  )}
                </div>
              )}
              {!page.sceneAnalysis && (
                <div style={{ marginBottom: 8, padding: 6, background: '#FFF8E1', borderRadius: 4, fontSize: 10, color: '#B8860B' }}>
                  장면 분석 없음 — Step 6에서 먼저 분석을 실행해주세요
                </div>
              )}

              {/* Scene analysis edit mode */}
              {editingPage === page.pageIndex && editDraft && (
                <div style={{ marginBottom: 8, padding: 10, background: '#FFF8E1', borderRadius: 6, border: '1px solid #FFE082', fontSize: 10 }}>
                  <div style={{ fontWeight: 700, color: '#333', marginBottom: 8, fontSize: 11 }}>장면 정보 편집</div>

                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>장면 설명 (한국어)</div>
                    <textarea
                      value={editDraft.sceneDescription}
                      onChange={(e) => updateDraftField('sceneDescription', e.target.value)}
                      style={{ width: '100%', minHeight: 36, padding: 4, border: '1px solid #DDD', borderRadius: 3, fontSize: 10, resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>이미지 프롬프트 (영어, 이미지 생성에 직접 사용)</div>
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
                      <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>시간 (time)</div>
                      <input value={editDraft.background.time} onChange={(e) => updateDraftField('background.time', e.target.value)}
                        style={{ width: '100%', padding: '3px 4px', border: '1px solid #DDD', borderRadius: 3, fontSize: 10, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>분위기 (mood)</div>
                      <input value={editDraft.background.mood} onChange={(e) => updateDraftField('background.mood', e.target.value)}
                        style={{ width: '100%', padding: '3px 4px', border: '1px solid #DDD', borderRadius: 3, fontSize: 10, boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>배경 세부 (details)</div>
                    <input value={editDraft.background.details} onChange={(e) => updateDraftField('background.details', e.target.value)}
                      style={{ width: '100%', padding: '3px 4px', border: '1px solid #DDD', borderRadius: 3, fontSize: 10, boxSizing: 'border-box' }} />
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, color: '#555', marginBottom: 2 }}>등장인물 (쉼표로 구분)</div>
                    <input value={editDraft.characterNames.join(', ')} onChange={(e) => updateDraftField('characterNames', e.target.value)}
                      style={{ width: '100%', padding: '3px 4px', border: '1px solid #DDD', borderRadius: 3, fontSize: 10, boxSizing: 'border-box' }} />
                  </div>

                  {/* Character actions */}
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

              {/* Image strip */}
              {state.images.length > 0 ? (
                <ImageStrip
                  images={state.images.map((img) => ({
                    id: img.id,
                    base64: img.base64,
                    prompt: img.prompt,
                  }))}
                  selectedId={state.selectedImageId ?? undefined}
                  onSelect={(id) => handleSelectImage(page.pageIndex, id)}
                  imageSize={72}
                  onHoverImage={handleHoverImage}
                />
              ) : (
                <div style={{ fontSize: 11, color: '#AAA', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
                  이미지를 생성하세요
                </div>
              )}

              {/* Regenerate with custom prompt */}
              <div style={regenRowStyle}>
                <input
                  type="text"
                  style={inputStyle}
                  placeholder="커스텀 프롬프트..."
                  value={state.customPrompt}
                  onChange={(e) => handleCustomPromptChange(page.pageIndex, e.target.value)}
                />
                <button
                  type="button"
                  style={{
                    ...btnOutlineStyle,
                    ...(generating ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                  }}
                  onClick={() => handleRegenerate(page.pageIndex)}
                  disabled={generating}
                >
                  재생성
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Note */}
      <div style={noteStyle}>
        페이지당 4장 (흰 배경 2장 + 풀 배경 2장)이 생성됩니다
      </div>

      {hoverPreview && (
        <ImageHoverPreview
          imageBase64={hoverPreview.base64}
          mouseX={hoverPreview.x}
          mouseY={hoverPreview.y}
        />
      )}
    </div>
  );
};

export default ImageBulkGenPanel;
