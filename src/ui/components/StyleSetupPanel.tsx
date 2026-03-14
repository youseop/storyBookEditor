import React, { useState, useCallback } from 'react';
import { postToPlugin } from '../hooks/useFigmaMessages';
import { callGemini } from '../utils/geminiApi';
import { usePipelineImages, type GeneratedImage } from '../hooks/usePipelineImages';
import ImageStrip from './ImageStrip';
import ImageHoverPreview from './ImageHoverPreview';

interface StyleSetupPanelProps {
  storyTitle: string;
  onStoryTitleChange: (title: string) => void;
  storyText: string;
  onStoryTextChange: (text: string) => void;
  styleDescription: string;
  onStyleDescriptionChange: (desc: string) => void;
  referenceImageBase64?: string;
  onReferenceImageChange: (base64: string) => void;
  apiKey: string;
}

const StyleSetupPanel: React.FC<StyleSetupPanelProps> = ({
  storyTitle,
  onStoryTitleChange,
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
  // Append-only image list (newest first)
  const [styleImages, setStyleImages] = useState<GeneratedImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  // Hover preview state
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const {
    isGenerating,
    progress,
    error: genError,
    generateStyleImages,
    cancel: cancelGeneration,
  } = usePipelineImages();

  const handleAnalyzeStyle = useCallback(async () => {
    if (!storyText.trim()) { setError('이야기 텍스트를 먼저 입력해주세요.'); return; }
    if (!apiKey) { setError('API Key가 설정되지 않았습니다.'); return; }
    setIsAnalyzing(true);
    setError(null);
    try {
      const prompt = `다음 동화 이야기를 읽고, 이 이야기에 적합한 일러스트 스타일을 한국어로 3줄 이내로 제안해주세요. 색감, 분위기, 화풍을 포함해서 설명해주세요.\n\n${storyText}`;
      const result = await callGemini(apiKey, prompt, 'gemini-2.5-flash');
      onStyleDescriptionChange(result.trim());
    } catch (err: any) {
      setError(err.message || '스타일 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [storyText, apiKey, onStyleDescriptionChange]);

  // Streaming callback: prepend each new image (newest first)
  const handleImageReady = useCallback((img: GeneratedImage) => {
    setStyleImages(prev => [img, ...prev]);
    // Auto-select first generated image
    setSelectedImageId(prev => {
      if (prev === null) {
        onReferenceImageChange(img.base64);
        // Save to Figma immediately
        const bytes = Uint8Array.from(atob(img.base64), c => c.charCodeAt(0));
        postToPlugin({
          type: 'SAVE_STYLE_GUIDE',
          description: '',
          imageBytes: Array.from(bytes),
        });
        return img.id;
      }
      return prev;
    });
  }, [onReferenceImageChange]);

  const handleGenerateStyleImages = useCallback(async () => {
    if (!apiKey) { setError('API Key가 설정되지 않았습니다.'); return; }
    if (!styleDescription.trim()) { setError('스타일 설명을 먼저 입력해주세요.'); return; }
    setError(null);
    await generateStyleImages(apiKey, styleDescription, 6, undefined, handleImageReady);
  }, [apiKey, styleDescription, generateStyleImages, handleImageReady]);

  // Custom prompt: generate 2 more images
  const handleCustomGenerate = useCallback(async () => {
    if (!apiKey || !customPrompt.trim()) return;
    setError(null);
    await generateStyleImages(apiKey, styleDescription, 2, customPrompt, handleImageReady);
  }, [apiKey, styleDescription, customPrompt, generateStyleImages, handleImageReady]);

  const handleSelectImage = useCallback((id: string) => {
    setSelectedImageId(id);
    const img = styleImages.find(i => i.id === id);
    if (img) {
      onReferenceImageChange(img.base64);
      // Update Figma immediately
      const bytes = Uint8Array.from(atob(img.base64), c => c.charCodeAt(0));
      postToPlugin({
        type: 'SAVE_STYLE_GUIDE',
        description: styleDescription,
        imageBytes: Array.from(bytes),
      });
    }
  }, [styleImages, onReferenceImageChange, styleDescription]);

  const handleSaveStyleGuide = useCallback(() => {
    postToPlugin({ type: 'SAVE_STYLE_GUIDE', description: styleDescription });
    // Also save story text to Figma
    postToPlugin({ type: 'SAVE_STORY_TEXT' as any, title: storyTitle, text: storyText });
  }, [styleDescription, storyTitle, storyText]);

  const handleHoverImage = useCallback((base64: string | null, event: React.MouseEvent | null) => {
    setHoverImage(base64);
    if (event) setHoverPos({ x: event.clientX, y: event.clientY });
  }, []);

  const s = {
    container: { display: 'flex', flexDirection: 'column' as const, gap: 12, padding: 12, fontSize: 12, color: '#333' },
    header: { fontSize: 13, fontWeight: 700 as const, marginBottom: 4 },
    section: { border: '1px solid #E5E5E5', borderRadius: 6, padding: 10 },
    sectionTitle: { fontSize: 11, fontWeight: 600 as const, color: '#666', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    input: { width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #DDD', fontSize: 13, boxSizing: 'border-box' as const },
    textarea: { width: '100%', minHeight: 120, resize: 'vertical' as const, padding: 8, border: '1px solid #E5E5E5', borderRadius: 4, fontFamily: "'SF Mono', monospace", fontSize: 11, lineHeight: 1.5, boxSizing: 'border-box' as const, outline: 'none' },
    smallTextarea: { width: '100%', minHeight: 70, resize: 'vertical' as const, padding: 8, border: '1px solid #E5E5E5', borderRadius: 4, fontSize: 11, lineHeight: 1.5, boxSizing: 'border-box' as const, outline: 'none' },
    btnPrimary: { padding: '6px 12px', fontSize: 11, fontWeight: 600 as const, color: '#fff', background: '#18A0FB', border: 'none', borderRadius: 4, cursor: 'pointer', width: '100%' },
    btnOutline: { padding: '6px 12px', fontSize: 11, fontWeight: 600 as const, color: '#18A0FB', background: '#fff', border: '1px solid #18A0FB', borderRadius: 4, cursor: 'pointer', width: '100%' },
    disabled: { opacity: 0.5, cursor: 'not-allowed' as const },
    error: { fontSize: 11, color: '#E53E3E', padding: '4px 0' },
    help: { fontSize: 10, color: '#999', lineHeight: 1.5, padding: '4px 0 0' },
  };

  return (
    <div style={s.container}>
      <div style={s.header}>Step 1: 이미지 스타일 확정</div>

      {/* Story title + text input */}
      <div style={s.section}>
        <div style={s.sectionTitle}>이야기 정보</div>
        <input
          type="text"
          value={storyTitle}
          onChange={(e) => onStoryTitleChange(e.target.value)}
          placeholder="동화 제목을 입력하세요"
          style={{ ...s.input, marginBottom: 8, fontWeight: 600 }}
        />
        <textarea
          style={s.textarea}
          value={storyText}
          onChange={(e) => onStoryTextChange(e.target.value)}
          placeholder="전체 동화 이야기를 여기에 붙여넣으세요..."
          spellCheck={false}
        />
        <div style={s.help}>제목과 이야기는 피그마에 자동 저장됩니다.</div>
      </div>

      {/* Style description */}
      <div style={s.section}>
        <div style={s.sectionTitle}>이미지 스타일 설정</div>
        <button
          type="button"
          style={{ ...s.btnOutline, ...(isAnalyzing || !storyText.trim() ? s.disabled : {}), marginBottom: 8 }}
          onClick={handleAnalyzeStyle}
          disabled={isAnalyzing || !storyText.trim()}
        >
          {isAnalyzing ? '분석 중...' : 'AI 스타일 분석'}
        </button>
        <textarea
          style={s.smallTextarea}
          value={styleDescription}
          onChange={(e) => onStyleDescriptionChange(e.target.value)}
          placeholder="일러스트 스타일을 설명해주세요..."
          spellCheck={false}
        />
        {error && <div style={s.error}>{error}</div>}
      </div>

      {/* Reference image generation */}
      <div style={s.section}>
        <div style={s.sectionTitle}>레퍼런스 이미지</div>

        {/* Initial generation */}
        <button
          type="button"
          style={{ ...s.btnOutline, marginBottom: 8, ...(isGenerating || !styleDescription.trim() ? s.disabled : {}) }}
          onClick={handleGenerateStyleImages}
          disabled={isGenerating || !styleDescription.trim()}
        >
          {isGenerating ? `생성 중... (${progress.current}/${progress.total})` : '배경 이미지 생성 (6장)'}
        </button>

        {/* Progress bar */}
        {isGenerating && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ width: '100%', height: 4, background: '#F0F0F0', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#18A0FB', borderRadius: 2, transition: 'width 0.3s', width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: '#999' }}>{progress.current}/{progress.total}</span>
              <button type="button" onClick={cancelGeneration} style={{ fontSize: 10, color: '#E53E3E', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        )}

        {genError && <div style={s.error}>{genError}</div>}

        {/* Image strip (horizontal scroll, newest first, append-only) */}
        {styleImages.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <ImageStrip
              images={styleImages}
              selectedId={selectedImageId ?? undefined}
              onSelect={handleSelectImage}
              imageSize={80}
              onHoverImage={handleHoverImage}
            />
            <div style={s.help}>{styleImages.length}장 생성됨 · 클릭하여 선택 · 1초 hover로 크게 보기</div>
          </div>
        )}

        {/* Custom prompt for 2 more images */}
        {styleImages.length > 0 && !isGenerating && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>커스텀 프롬프트로 추가 생성 (2장)</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="예: 따뜻한 가을 마을 풍경..."
                style={{ ...s.input, flex: 1 }}
              />
              <button
                type="button"
                onClick={handleCustomGenerate}
                disabled={!customPrompt.trim() || isGenerating}
                style={{ ...s.btnOutline, width: 'auto', whiteSpace: 'nowrap', ...((!customPrompt.trim() || isGenerating) ? s.disabled : {}) }}
              >
                +2장
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {styleImages.length === 0 && !isGenerating && (
          <div style={{ width: '100%', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAFA', border: '1px dashed #CCC', borderRadius: 4, fontSize: 11, color: '#AAA' }}>
            스타일 설명 입력 후 이미지를 생성하세요
          </div>
        )}
      </div>

      {/* Save button */}
      <button
        type="button"
        style={{ ...s.btnPrimary, ...(!styleDescription.trim() ? s.disabled : {}) }}
        onClick={handleSaveStyleGuide}
        disabled={!styleDescription.trim()}
      >
        스타일 가이드 저장 (Figma에 반영)
      </button>

      {/* Hover preview overlay */}
      <ImageHoverPreview imageBase64={hoverImage} mouseX={hoverPos.x} mouseY={hoverPos.y} />
    </div>
  );
};

export default StyleSetupPanel;
