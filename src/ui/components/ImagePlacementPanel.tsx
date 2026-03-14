import React, { useState, useCallback } from 'react';
import { postToPlugin } from '../hooks/useFigmaMessages';
import { getPageTextPreview } from '../utils/geminiApi';
import type { StoryPage } from '../../shared/pipeline';

interface ImagePlacementPanelProps {
  pages: StoryPage[];
  onImageRegenerate: (pageIndex: number, prompt: string, bgType: 'white' | 'full') => void;
}

interface PagePlacementState {
  bgType: 'white' | 'full';
  customPrompt: string;
}

const ImagePlacementPanel: React.FC<ImagePlacementPanelProps> = ({
  pages,
  onImageRegenerate,
}) => {
  const nonEmptyPages = pages.filter((p) => !p.isEmpty);

  const [placementStates, setPlacementStates] = useState<Record<number, PagePlacementState>>(() => {
    const init: Record<number, PagePlacementState> = {};
    nonEmptyPages.forEach((p) => {
      init[p.pageIndex] = {
        bgType: 'full',
        customPrompt: '',
      };
    });
    return init;
  });

  const handleBgTypeChange = useCallback((pageIndex: number, bgType: 'white' | 'full') => {
    setPlacementStates((prev) => ({
      ...prev,
      [pageIndex]: { ...prev[pageIndex], bgType },
    }));
  }, []);

  const handlePromptChange = useCallback((pageIndex: number, prompt: string) => {
    setPlacementStates((prev) => ({
      ...prev,
      [pageIndex]: { ...prev[pageIndex], customPrompt: prompt },
    }));
  }, []);

  const handleRegenerate = useCallback(
    (pageIndex: number) => {
      const state = placementStates[pageIndex];
      if (state) {
        onImageRegenerate(pageIndex, state.customPrompt, state.bgType);
      }
    },
    [placementStates, onImageRegenerate],
  );

  const handlePlaceAll = useCallback(() => {
    nonEmptyPages.forEach((page) => {
      const state = placementStates[page.pageIndex];
      if (state) {
        postToPlugin({
          type: 'SELECT_SCENE_IMAGE',
          pageIndex: page.pageIndex,
          variant: page.selectedImageIndex ?? 0,
        });
      }
    });
  }, [nonEmptyPages, placementStates]);

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

  const thumbnailStyle: React.CSSProperties = {
    width: 60,
    height: 60,
    background: '#F5F5F5',
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    color: '#BBB',
    marginBottom: 8,
  };

  const radioGroupStyle: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    marginBottom: 8,
  };

  const radioLabelStyle: React.CSSProperties = {
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 6px',
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    fontSize: 11,
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 6,
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

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    color: '#666',
    marginBottom: 4,
  };

  const noteStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
    padding: '4px 0',
    fontStyle: 'italic',
  };

  const selectedIndicatorStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#1BC47D',
    fontWeight: 600,
    marginBottom: 4,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 8: 이미지 배치</div>

      {/* Page list */}
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {nonEmptyPages.map((page) => {
          const state = placementStates[page.pageIndex];
          if (!state) return null;

          return (
            <div key={page.pageIndex} style={pageCardStyle}>
              <div style={pageHeaderStyle}>
                <span style={pageNumStyle}>Page {page.pageIndex + 1}</span>
              </div>
              <div style={textPreviewStyle}>{getPageTextPreview(page)}</div>

              {/* Thumbnail placeholder */}
              <div style={thumbnailStyle}>이미지</div>

              {/* Current image indicator */}
              <div style={selectedIndicatorStyle}>
                {page.selectedImageIndex !== undefined
                  ? `선택된 이미지: 변형 ${page.selectedImageIndex + 1}`
                  : '선택된 이미지 없음'}
              </div>

              {/* Background type radio */}
              <div style={labelStyle}>이미지 타입</div>
              <div style={radioGroupStyle}>
                <label style={radioLabelStyle}>
                  <input
                    type="radio"
                    name={`placement-bg-${page.pageIndex}`}
                    checked={state.bgType === 'white'}
                    onChange={() => handleBgTypeChange(page.pageIndex, 'white')}
                  />
                  흰 배경
                </label>
                <label style={radioLabelStyle}>
                  <input
                    type="radio"
                    name={`placement-bg-${page.pageIndex}`}
                    checked={state.bgType === 'full'}
                    onChange={() => handleBgTypeChange(page.pageIndex, 'full')}
                  />
                  풀 배경
                </label>
              </div>

              {/* Custom prompt */}
              <div style={labelStyle}>재생성 프롬프트</div>
              <input
                type="text"
                style={inputStyle}
                placeholder="재생성용 프롬프트 입력..."
                value={state.customPrompt}
                onChange={(e) => handlePromptChange(page.pageIndex, e.target.value)}
              />

              <button
                type="button"
                style={btnOutlineStyle}
                onClick={() => handleRegenerate(page.pageIndex)}
              >
                재생성
              </button>

              <div style={{ ...noteStyle, textAlign: 'left', marginTop: 4 }}>
                Figma에서 배치 수정
              </div>
            </div>
          );
        })}
      </div>

      {/* Place all button */}
      <button
        type="button"
        style={{
          ...btnPrimaryStyle,
          ...(nonEmptyPages.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        }}
        onClick={handlePlaceAll}
        disabled={nonEmptyPages.length === 0}
      >
        전체 1차 배치
      </button>

      <div style={noteStyle}>
        디자이너가 Figma에서 직접 위치/크기를 최종 조정합니다
      </div>
    </div>
  );
};

export default ImagePlacementPanel;
