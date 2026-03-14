import React, { useState, useCallback } from 'react';
import { getPageTextPreview } from '../utils/geminiApi';
import { postToPlugin } from '../hooks/useFigmaMessages';
import { base64ToUint8Array } from '../services/geminiService';
import { usePipelineImages, type GeneratedImage } from '../hooks/usePipelineImages';
import type { StoryPage, Character } from '../../shared/pipeline';

interface ImageBulkGenPanelProps {
  pages: StoryPage[];
  characters: Character[];
  styleDescription: string;
  referenceImageBase64?: string;
  apiKey: string;
  onImageSelect: (pageIndex: number, variant: number) => void;
}

interface SlotData {
  label: string;
  bgType: 'white' | 'full';
  image?: GeneratedImage;
}

interface PageImageState {
  slots: SlotData[];
  selectedVariant: number | null;
  customPrompt: string;
}

function createInitialSlots(): SlotData[] {
  return [
    { label: '흰 배경 1', bgType: 'white' },
    { label: '흰 배경 2', bgType: 'white' },
    { label: '풀 배경 1', bgType: 'full' },
    { label: '풀 배경 2', bgType: 'full' },
  ];
}

const ImageBulkGenPanel: React.FC<ImageBulkGenPanelProps> = ({
  pages,
  characters,
  styleDescription,
  referenceImageBase64,
  apiKey,
  onImageSelect,
}) => {
  const nonEmptyPages = pages.filter((p) => !p.isEmpty);

  const [imageStates, setImageStates] = useState<Record<number, PageImageState>>(() => {
    const init: Record<number, PageImageState> = {};
    nonEmptyPages.forEach((p) => {
      init[p.pageIndex] = {
        slots: createInitialSlots(),
        selectedVariant: null,
        customPrompt: '',
      };
    });
    return init;
  });

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const {
    generateSceneImages,
    cancel: cancelPipelineGen,
  } = usePipelineImages();

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
        const scenePrompt =
          page.sceneAnalysis?.imagePrompt ||
          page.textBlocks.flat().join(' ');

        // Generate 2 white bg + 2 full bg
        for (const bgType of ['white', 'full'] as const) {
          const slotStartIdx = bgType === 'white' ? 0 : 2;

          try {
            const images = await generateSceneImages(
              apiKey,
              scenePrompt,
              styleDescription,
              bgType,
              referenceImageBase64,
              2,
            );

            // Update slots with generated images
            setImageStates((prev) => {
              const prevState = prev[page.pageIndex] || {
                slots: createInitialSlots(),
                selectedVariant: null,
                customPrompt: '',
              };
              const newSlots = [...prevState.slots];
              images.forEach((img, imgIdx) => {
                const slotIdx = slotStartIdx + imgIdx;
                if (slotIdx < newSlots.length) {
                  newSlots[slotIdx] = {
                    ...newSlots[slotIdx],
                    image: img,
                  };
                }

                // Send to sandbox for storage
                const bytes = base64ToUint8Array(img.base64);
                postToPlugin({
                  type: 'STORE_SCENE_IMAGE',
                  pageIndex: page.pageIndex,
                  imageBytes: Array.from(bytes),
                  variant: slotIdx,
                  backgroundType: bgType,
                });
              });
              return {
                ...prev,
                [page.pageIndex]: { ...prevState, slots: newSlots },
              };
            });
          } catch (err: any) {
            if (err.message === 'Cancelled') break;
            setError(`Page ${page.pageIndex + 1} (${bgType}): ${err.message}`);
          }

          completedCount += 2;
          setProgress({ current: completedCount, total: totalImages });
        }
      }

      setGenerating(false);
    },
    [apiKey, styleDescription, referenceImageBase64, generateSceneImages],
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

  const handleSelectVariant = useCallback(
    (pageIndex: number, variant: number) => {
      setImageStates((prev) => ({
        ...prev,
        [pageIndex]: {
          ...prev[pageIndex],
          selectedVariant: variant,
        },
      }));

      // Notify sandbox of selection
      postToPlugin({
        type: 'SELECT_SCENE_IMAGE',
        pageIndex,
        variant,
      });
      onImageSelect(pageIndex, variant);
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

      const scenePrompt =
        state.customPrompt ||
        page.sceneAnalysis?.imagePrompt ||
        page.textBlocks.flat().join(' ');

      let completedCount = 0;

      for (const bgType of ['white', 'full'] as const) {
        const slotStartIdx = bgType === 'white' ? 0 : 2;

        try {
          const images = await generateSceneImages(
            apiKey,
            scenePrompt,
            styleDescription,
            bgType,
            referenceImageBase64,
            2,
          );

          setImageStates((prev) => {
            const prevState = prev[pageIndex];
            const newSlots = [...prevState.slots];
            images.forEach((img, imgIdx) => {
              const slotIdx = slotStartIdx + imgIdx;
              if (slotIdx < newSlots.length) {
                newSlots[slotIdx] = { ...newSlots[slotIdx], image: img };
              }

              const bytes = base64ToUint8Array(img.base64);
              postToPlugin({
                type: 'STORE_SCENE_IMAGE',
                pageIndex,
                imageBytes: Array.from(bytes),
                variant: slotIdx,
                backgroundType: bgType,
              });
            });
            return {
              ...prev,
              [pageIndex]: { ...prevState, slots: newSlots, selectedVariant: null },
            };
          });
        } catch (err: any) {
          if (err.message !== 'Cancelled') {
            setError(`Page ${pageIndex + 1} 재생성 오류: ${err.message}`);
          }
        }

        completedCount += 2;
        setProgress({ current: completedCount, total: 4 });
      }

      setGenerating(false);
    },
    [apiKey, imageStates, nonEmptyPages, styleDescription, referenceImageBase64, generateSceneImages],
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

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
    marginBottom: 8,
  };

  const slotStyle = (selected: boolean): React.CSSProperties => ({
    width: 80,
    height: 80,
    background: '#F5F5F5',
    border: selected ? '2px solid #18A0FB' : '1px solid #E5E5E5',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: 9,
    color: '#999',
    textAlign: 'center',
    transition: 'border-color 0.15s',
    overflow: 'hidden',
    position: 'relative',
    padding: 0,
  });

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

              {/* 2x2 image slot grid */}
              <div style={gridStyle}>
                {state.slots.map((slot, idx) => (
                  <div
                    key={idx}
                    style={slotStyle(state.selectedVariant === idx)}
                    onClick={() => handleSelectVariant(page.pageIndex, idx)}
                  >
                    {slot.image ? (
                      <>
                        <img
                          src={`data:image/png;base64,${slot.image.base64}`}
                          alt={slot.label}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {state.selectedVariant === idx && (
                          <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'rgba(24, 160, 251, 0.8)',
                            color: '#fff',
                            fontSize: 8,
                            textAlign: 'center',
                            padding: '1px 0',
                            fontWeight: 600,
                          }}>
                            선택
                          </div>
                        )}
                      </>
                    ) : (
                      slot.label
                    )}
                  </div>
                ))}
              </div>

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
    </div>
  );
};

export default ImageBulkGenPanel;
