import React, { useState, useCallback } from 'react';
import { getPageTextPreview } from '../utils/geminiApi';
import { postToPlugin } from '../hooks/useFigmaMessages';
import { base64ToUint8Array } from '../services/geminiService';
import { usePipelineImages, type GeneratedImage } from '../hooks/usePipelineImages';
import type { StoryPage, Character } from '../../shared/pipeline';
import ImageStrip from './ImageStrip';
import ImageHoverPreview from './ImageHoverPreview';

interface ImageBulkGenPanelProps {
  pages: StoryPage[];
  characters: Character[];
  styleDescription: string;
  referenceImageBase64?: string;
  apiKey: string;
  onImageSelect: (pageIndex: number, variant: number) => void;
}

interface PageImageState {
  images: GeneratedImage[];
  selectedImageId: string | null;
  customPrompt: string;
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
        images: [],
        selectedImageId: null,
        customPrompt: '',
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

        for (const bgType of ['white', 'full'] as const) {
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

              // Append to images list
              setImageStates((prev) => {
                const prevState = prev[page.pageIndex] || {
                  images: [],
                  selectedImageId: null,
                  customPrompt: '',
                };
                return {
                  ...prev,
                  [page.pageIndex]: {
                    ...prevState,
                    images: [img, ...prevState.images],
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

  const handleHoverImage = useCallback((base64: string | null, event: React.MouseEvent | null) => {
    if (base64 && event) {
      setHoverPreview({ base64, x: event.clientX, y: event.clientY });
    } else {
      setHoverPreview(null);
    }
  }, []);

  const handleSelectImage = useCallback(
    (pageIndex: number, imageId: string) => {
      setImageStates((prev) => ({
        ...prev,
        [pageIndex]: {
          ...prev[pageIndex],
          selectedImageId: imageId,
        },
      }));

      // Find variant index for the image
      const state = imageStates[pageIndex];
      const imgIndex = state?.images.findIndex((img) => img.id === imageId) ?? 0;

      postToPlugin({
        type: 'SELECT_SCENE_IMAGE',
        pageIndex,
        variant: imgIndex,
      });
      onImageSelect(pageIndex, imgIndex);
    },
    [onImageSelect, imageStates],
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

            setImageStates((prev) => {
              const prevState = prev[pageIndex];
              return {
                ...prev,
                [pageIndex]: {
                  ...prevState,
                  images: [img, ...prevState.images],
                  selectedImageId: null,
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
