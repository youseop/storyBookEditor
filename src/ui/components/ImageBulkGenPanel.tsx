import React, { useState, useCallback } from 'react';
import { getPageTextPreview } from '../utils/geminiApi';
import type { StoryPage, Character } from '../../shared/pipeline';

interface ImageBulkGenPanelProps {
  pages: StoryPage[];
  characters: Character[];
  styleDescription: string;
  referenceImageBase64?: string;
  apiKey: string;
  onImageSelect: (pageIndex: number, variant: number) => void;
}

interface PageImageState {
  slots: Array<{ label: string; bgType: 'white' | 'full'; generated: boolean }>;
  selectedVariant: number | null;
  customPrompt: string;
}

function createInitialSlots(): PageImageState['slots'] {
  return [
    { label: '흰 배경 1', bgType: 'white', generated: false },
    { label: '흰 배경 2', bgType: 'white', generated: false },
    { label: '풀 배경 1', bgType: 'full', generated: false },
    { label: '풀 배경 2', bgType: 'full', generated: false },
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

  const handleGenerateFirst4 = useCallback(async () => {
    // Placeholder: actual Gemini Image API integration pending
    setGenerating(true);
    const pagesToGen = nonEmptyPages.slice(0, 4);
    setProgress({ current: 0, total: pagesToGen.length });

    for (let i = 0; i < pagesToGen.length; i++) {
      // Simulate generation delay
      await new Promise((r) => setTimeout(r, 200));
      setProgress({ current: i + 1, total: pagesToGen.length });
    }

    setGenerating(false);
  }, [nonEmptyPages]);

  const handleGenerateAll = useCallback(async () => {
    setGenerating(true);
    setProgress({ current: 0, total: nonEmptyPages.length });

    for (let i = 0; i < nonEmptyPages.length; i++) {
      await new Promise((r) => setTimeout(r, 200));
      setProgress({ current: i + 1, total: nonEmptyPages.length });
    }

    setGenerating(false);
  }, [nonEmptyPages]);

  const handleSelectVariant = useCallback(
    (pageIndex: number, variant: number) => {
      setImageStates((prev) => ({
        ...prev,
        [pageIndex]: {
          ...prev[pageIndex],
          selectedVariant: variant,
        },
      }));
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

  const handleRegenerate = useCallback((_pageIndex: number) => {
    // Placeholder for regeneration with custom prompt
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
  });

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
            <div style={{ fontSize: 10, color: '#999', textAlign: 'center', marginTop: 4 }}>
              {progress.current} / {progress.total} 페이지
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
                    {slot.label}
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
                  style={btnOutlineStyle}
                  onClick={() => handleRegenerate(page.pageIndex)}
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
        이미지 생성은 Gemini Image API 연동 후 활성화됩니다
      </div>
    </div>
  );
};

export default ImageBulkGenPanel;
