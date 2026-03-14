import React, { useState, useCallback } from 'react';
import { postToPlugin, usePluginMessage } from '../hooks/useFigmaMessages';
import { usePipelineImages, type GeneratedImage } from '../hooks/usePipelineImages';
import { base64ToUint8Array } from '../services/geminiService';
import ImageStrip from './ImageStrip';
import ImageHoverPreview from './ImageHoverPreview';

interface CoverPanelProps {
  apiKey: string;
  styleDescription: string;
  referenceImageBase64?: string;
  keyColorA: string;
  keyColorB: string;
}

const CoverPanel: React.FC<CoverPanelProps> = ({
  apiKey,
  styleDescription,
  referenceImageBase64,
  keyColorA,
  keyColorB,
}) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const [titleKo, setTitleKo] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coverCreated, setCoverCreated] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{ base64: string; x: number; y: number } | null>(null);

  const {
    isGenerating,
    progress,
    generateCoverImages,
    cancel,
  } = usePipelineImages();

  usePluginMessage(useCallback((msg) => {
    if (msg.type === 'COVER_CREATED') {
      setCoverCreated(true);
    }
    if (msg.type === 'ERROR') {
      setError(msg.message);
    }
  }, []));

  const handleGenerateImages = useCallback(async () => {
    if (!apiKey) {
      setError('API Key가 설정되지 않았습니다.');
      return;
    }
    setError(null);
    setCoverCreated(false);

    const prompt = customPrompt || '동화책 표지에 어울리는 일러스트';
    const newImages = await generateCoverImages(
      apiKey,
      prompt,
      styleDescription,
      referenceImageBase64,
      4,
      (img) => {
        setImages((prev) => [img, ...prev]);
        // Save to gallery
        const bytes = Uint8Array.from(atob(img.base64), c => c.charCodeAt(0));
        postToPlugin({
          type: 'SAVE_TO_GALLERY',
          category: 'cover',
          imageId: img.id,
          imageBytes: Array.from(bytes),
          label: 'Cover Image',
        });
        if (!selectedImageId) {
          setSelectedImageId(img.id);
        }
      },
    );

    if (newImages.length > 0 && !selectedImageId) {
      setSelectedImageId(newImages[0].id);
    }
  }, [apiKey, customPrompt, styleDescription, referenceImageBase64, generateCoverImages, selectedImageId]);

  const handleCreateCover = useCallback(() => {
    const selectedImage = images.find((img) => img.id === selectedImageId);
    if (!selectedImage) {
      setError('표지 이미지를 선택해주세요.');
      return;
    }

    setError(null);
    const bytes = base64ToUint8Array(selectedImage.base64);
    postToPlugin({
      type: 'CREATE_COVER',
      imageBytes: Array.from(bytes),
      titleKo,
      titleEn,
      keyColorA,
      keyColorB,
    });
  }, [images, selectedImageId, titleKo, titleEn, keyColorA, keyColorB]);

  const handleHoverImage = useCallback((base64: string | null, event: React.MouseEvent | null) => {
    if (base64 && event) {
      setHoverPreview({ base64, x: event.clientX, y: event.clientY });
    } else {
      setHoverPreview(null);
    }
  }, []);

  // --- Styles ---
  const s = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 12,
      padding: 12,
      fontFamily: 'inherit',
      color: '#333',
      fontSize: 12,
    },
    header: {
      fontSize: 13,
      fontWeight: 700,
      marginBottom: 4,
    },
    section: {
      border: '1px solid #E5E5E5',
      borderRadius: 6,
      padding: 10,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: 600,
      color: '#666',
      marginBottom: 8,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    label: {
      fontSize: 11,
      color: '#666',
      fontWeight: 600,
      marginBottom: 4,
    },
    input: {
      width: '100%',
      padding: '6px 8px',
      border: '1px solid #E5E5E5',
      borderRadius: 4,
      fontSize: 12,
      fontFamily: 'inherit',
      color: '#333',
      boxSizing: 'border-box' as const,
      outline: 'none',
    },
    textarea: {
      width: '100%',
      minHeight: 60,
      padding: '6px 8px',
      border: '1px solid #E5E5E5',
      borderRadius: 4,
      fontSize: 11,
      fontFamily: 'inherit',
      color: '#333',
      resize: 'vertical' as const,
      boxSizing: 'border-box' as const,
      outline: 'none',
    },
    inputGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 4,
      marginBottom: 8,
    },
    btnPrimary: {
      padding: '8px 16px',
      fontSize: 12,
      fontWeight: 700,
      color: '#fff',
      background: '#18A0FB',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      width: '100%',
    } as React.CSSProperties,
    error: {
      fontSize: 11,
      color: '#E53935',
      padding: '6px 8px',
      background: '#FFF3F3',
      borderRadius: 4,
      marginBottom: 4,
    },
    progressBar: {
      width: '100%',
      height: 6,
      background: '#E5E5E5',
      borderRadius: 3,
      overflow: 'hidden' as const,
      marginBottom: 6,
    },
    success: {
      fontSize: 12,
      fontWeight: 600,
      color: '#1BC47D',
      padding: '8px 10px',
      background: '#EEFBF3',
      borderRadius: 4,
      textAlign: 'center' as const,
    },
    previewBox: {
      width: 280,
      height: 140,
      borderRadius: 6,
      backgroundColor: keyColorA,
      border: `2px solid ${keyColorB}`,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      overflow: 'hidden' as const,
      margin: '0 auto',
      position: 'relative' as const,
    },
    note: {
      fontSize: 10,
      color: '#999',
      fontStyle: 'italic',
      textAlign: 'center' as const,
      padding: '4px 0',
    },
  };

  const selectedImage = images.find((img) => img.id === selectedImageId);
  const progressPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={s.container}>
      <div style={s.header}>Step 18: 표지 제작</div>

      {error && <div style={s.error} onClick={() => setError(null)}>{error}</div>}

      {/* Image Generation */}
      <div style={s.section}>
        <div style={s.sectionTitle}>표지 이미지 생성</div>
        <textarea
          style={s.textarea}
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="표지 이미지 프롬프트 (비워두면 기본 프롬프트 사용)"
        />
        <div style={s.note}>2:1 비율 표지 이미지를 4장 생성합니다</div>

        {isGenerating && (
          <div style={{ marginTop: 8 }}>
            <div style={s.progressBar}>
              <div style={{
                width: `${progressPct}%`,
                height: '100%',
                background: '#18A0FB',
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#18A0FB' }}>
                {progress.current}/{progress.total} 이미지
              </span>
              <button
                type="button"
                onClick={cancel}
                style={{ fontSize: 10, color: '#E53935', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                취소
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          style={{
            ...s.btnPrimary,
            marginTop: 8,
            ...(isGenerating ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
          }}
          onClick={handleGenerateImages}
          disabled={isGenerating}
        >
          {isGenerating ? '생성 중...' : '이미지 생성'}
        </button>
      </div>

      {/* Image Selection */}
      {images.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>이미지 선택 ({images.length}장)</div>
          <ImageStrip
            images={images.map((img) => ({
              id: img.id,
              base64: img.base64,
              prompt: img.prompt,
            }))}
            selectedId={selectedImageId ?? undefined}
            onSelect={setSelectedImageId}
            imageSize={80}
            onHoverImage={handleHoverImage}
          />
        </div>
      )}

      {/* Title Input */}
      <div style={s.section}>
        <div style={s.sectionTitle}>제목 입력</div>
        <div style={s.inputGroup}>
          <div style={s.label}>한국어 제목</div>
          <input
            type="text"
            style={s.input}
            value={titleKo}
            onChange={(e) => setTitleKo(e.target.value)}
            placeholder="동화책 한국어 제목"
          />
        </div>
        <div style={s.inputGroup}>
          <div style={s.label}>영어 제목</div>
          <input
            type="text"
            style={s.input}
            value={titleEn}
            onChange={(e) => setTitleEn(e.target.value)}
            placeholder="English title"
          />
        </div>
      </div>

      {/* Cover Preview */}
      <div style={s.section}>
        <div style={s.sectionTitle}>표지 미리보기</div>
        <div style={s.previewBox}>
          {selectedImage && (
            <img
              src={`data:image/png;base64,${selectedImage.base64}`}
              alt="Cover"
              style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          <div style={{
            position: 'relative',
            zIndex: 1,
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', textAlign: 'center', padding: '0 12px', wordBreak: 'keep-all' as const }}>
              {titleKo || '한국어 제목'}
            </div>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.85)', textAlign: 'center', padding: '0 12px' }}>
              {titleEn || 'English Title'}
            </div>
          </div>
        </div>
      </div>

      {/* Success */}
      {coverCreated && (
        <div style={s.success}>
          표지가 Figma 캔버스에 생성되었습니다
        </div>
      )}

      {/* Create Cover Button */}
      <button
        type="button"
        style={{
          ...s.btnPrimary,
          background: '#1BC47D',
          ...((!selectedImageId || !titleKo) ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        }}
        onClick={handleCreateCover}
        disabled={!selectedImageId || !titleKo}
      >
        표지 생성
      </button>

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

export default CoverPanel;
