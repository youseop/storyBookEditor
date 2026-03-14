import React, { useState, useCallback } from 'react';
import { postToPlugin } from '../hooks/useFigmaMessages';
import { callGemini } from '../utils/geminiApi';
import { usePipelineImages, type GeneratedImage } from '../hooks/usePipelineImages';

interface StyleSetupPanelProps {
  storyText: string;
  onStoryTextChange: (text: string) => void;
  styleDescription: string;
  onStyleDescriptionChange: (desc: string) => void;
  referenceImageBase64?: string;
  onReferenceImageChange: (base64: string) => void;
  apiKey: string;
}

const StyleSetupPanel: React.FC<StyleSetupPanelProps> = ({
  storyText,
  onStoryTextChange,
  styleDescription,
  onStyleDescriptionChange,
  referenceImageBase64,
  onReferenceImageChange,
  apiKey,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [styleImages, setStyleImages] = useState<GeneratedImage[]>([]);
  const [selectedImageIdx, setSelectedImageIdx] = useState<number | null>(null);
  const {
    isGenerating,
    progress,
    error: genError,
    generateStyleImages,
    cancel: cancelGeneration,
  } = usePipelineImages();

  const handleAnalyzeStyle = useCallback(async () => {
    if (!storyText.trim()) {
      setError('이야기 텍스트를 먼저 입력해주세요.');
      return;
    }
    if (!apiKey) {
      setError('API Key가 설정되지 않았습니다.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const prompt = `다음 동화 이야기를 읽고, 이 이야기에 적합한 일러스트 스타일을 한국어로 3줄 이내로 제안해주세요. 색감, 분위기, 화풍을 포함해서 설명해주세요.\n\n${storyText}`;

      const result = await callGemini(apiKey, prompt, 'gemini-2.5-flash');

      if (!result) {
        throw new Error('AI 응답에서 텍스트를 찾을 수 없습니다.');
      }

      onStyleDescriptionChange(result.trim());
    } catch (err: any) {
      setError(err.message || '스타일 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [storyText, apiKey, onStyleDescriptionChange]);

  const handleGenerateStyleImages = useCallback(async () => {
    if (!apiKey) {
      setError('API Key가 설정되지 않았습니다. Settings에서 설정해주세요.');
      return;
    }
    if (!styleDescription.trim()) {
      setError('스타일 설명을 먼저 입력해주세요.');
      return;
    }
    setError(null);
    const images = await generateStyleImages(apiKey, styleDescription, 6);
    setStyleImages(images);
    setSelectedImageIdx(null);
  }, [apiKey, styleDescription, generateStyleImages]);

  const handleSelectStyleImage = useCallback(
    (idx: number) => {
      setSelectedImageIdx(idx);
      const img = styleImages[idx];
      if (img) {
        onReferenceImageChange(img.base64);
      }
    },
    [styleImages, onReferenceImageChange],
  );

  const handleSaveStyleGuide = useCallback(() => {
    postToPlugin({
      type: 'SAVE_STYLE_GUIDE',
      description: styleDescription,
    });
  }, [styleDescription]);

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

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 150,
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

  const smallTextareaStyle: React.CSSProperties = {
    ...textareaStyle,
    minHeight: 80,
    fontFamily: 'inherit',
  };

  const primaryBtnStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    background: '#18A0FB',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    width: '100%',
  };

  const outlineBtnStyle: React.CSSProperties = {
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

  const disabledBtnStyle: React.CSSProperties = {
    opacity: 0.5,
    cursor: 'not-allowed',
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#E53E3E',
    padding: '4px 0',
  };

  const previewImageStyle: React.CSSProperties = {
    width: '100%',
    maxHeight: 120,
    objectFit: 'contain',
    borderRadius: 4,
    border: '1px solid #E5E5E5',
    backgroundColor: '#FAFAFA',
  };

  const placeholderBoxStyle: React.CSSProperties = {
    width: '100%',
    height: 80,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
    border: '1px dashed #CCC',
    borderRadius: 4,
    fontSize: 11,
    color: '#AAA',
  };

  const helpTextStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    lineHeight: 1.5,
    padding: '4px 0 0',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 1: 이미지 스타일 확정</div>

      {/* Story text input */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>이야기 텍스트 입력</div>
        <textarea
          style={textareaStyle}
          value={storyText}
          onChange={(e) => onStoryTextChange(e.target.value)}
          placeholder="전체 동화 이야기를 여기에 붙여넣으세요..."
          spellCheck={false}
        />
        <div style={helpTextStyle}>
          전체 이야기를 입력하면 AI가 스타일을 분석합니다.
        </div>
      </div>

      {/* Style description */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>이미지 스타일 설정</div>
        <button
          type="button"
          style={{
            ...outlineBtnStyle,
            ...(isAnalyzing || !storyText.trim() ? disabledBtnStyle : {}),
            marginBottom: 8,
          }}
          onClick={handleAnalyzeStyle}
          disabled={isAnalyzing || !storyText.trim()}
        >
          {isAnalyzing ? '분석 중...' : 'AI 스타일 분석'}
        </button>
        <textarea
          style={smallTextareaStyle}
          value={styleDescription}
          onChange={(e) => onStyleDescriptionChange(e.target.value)}
          placeholder="일러스트 스타일을 설명해주세요 (색감, 분위기, 화풍 등)..."
          spellCheck={false}
        />
        {error && <div style={errorStyle}>{error}</div>}
      </div>

      {/* Reference image generation */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>레퍼런스 이미지</div>

        {/* Generate button */}
        <button
          type="button"
          style={{
            ...outlineBtnStyle,
            marginBottom: 8,
            ...(isGenerating || !styleDescription.trim() ? disabledBtnStyle : {}),
          }}
          onClick={handleGenerateStyleImages}
          disabled={isGenerating || !styleDescription.trim()}
        >
          {isGenerating ? `생성 중... (${progress.current}/${progress.total})` : '배경 이미지 생성 (6장)'}
        </button>

        {/* Progress bar */}
        {isGenerating && (
          <div style={{ marginBottom: 8 }}>
            <div style={{
              width: '100%',
              height: 4,
              background: '#F0F0F0',
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                background: '#18A0FB',
                borderRadius: 2,
                transition: 'width 0.3s ease',
                width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: '#999' }}>{progress.current}/{progress.total}</span>
              <button
                type="button"
                onClick={cancelGeneration}
                style={{ fontSize: 10, color: '#E53E3E', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* Generation error */}
        {genError && <div style={errorStyle}>{genError}</div>}

        {/* Generated image grid (3x2) */}
        {styleImages.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
            marginBottom: 8,
          }}>
            {styleImages.map((img, idx) => (
              <div
                key={img.id}
                onClick={() => handleSelectStyleImage(idx)}
                style={{
                  cursor: 'pointer',
                  border: selectedImageIdx === idx ? '2px solid #18A0FB' : '1px solid #E5E5E5',
                  borderRadius: 4,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <img
                  src={`data:image/png;base64,${img.base64}`}
                  alt={`Style variant ${idx + 1}`}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
                {selectedImageIdx === idx && (
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(24, 160, 251, 0.8)',
                    color: '#fff',
                    fontSize: 9,
                    textAlign: 'center',
                    padding: '2px 0',
                    fontWeight: 600,
                  }}>
                    선택됨
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Currently selected reference preview */}
        {referenceImageBase64 && styleImages.length === 0 && (
          <img
            src={`data:image/png;base64,${referenceImageBase64}`}
            alt="Reference"
            style={previewImageStyle}
          />
        )}
        {!referenceImageBase64 && styleImages.length === 0 && (
          <div style={placeholderBoxStyle}>스타일 설명을 입력 후 이미지를 생성하세요</div>
        )}

        <div style={helpTextStyle}>
          생성된 이미지 중 하나를 클릭하면 레퍼런스 이미지로 설정됩니다
        </div>
      </div>

      {/* Save button */}
      <button
        type="button"
        style={{
          ...primaryBtnStyle,
          ...((!styleDescription.trim()) ? disabledBtnStyle : {}),
        }}
        onClick={handleSaveStyleGuide}
        disabled={!styleDescription.trim()}
      >
        스타일 가이드 저장
      </button>
    </div>
  );
};

export default StyleSetupPanel;
