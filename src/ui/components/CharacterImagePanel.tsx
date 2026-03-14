import React, { useState, useCallback } from 'react';
import type { Character } from '../../shared/pipeline';
import { usePipelineImages, type GeneratedImage } from '../hooks/usePipelineImages';

interface CharacterImagePanelProps {
  characters: Character[];
  onCharacterImageSelect: (characterId: string, imageBase64: string) => void;
  styleDescription: string;
  apiKey: string;
}

interface CharacterImagesState {
  images: GeneratedImage[];
  selectedIdx: number | null;
}

const CharacterImagePanel: React.FC<CharacterImagePanelProps> = ({
  characters,
  onCharacterImageSelect,
  styleDescription,
  apiKey,
}) => {
  const [charImages, setCharImages] = useState<Record<string, CharacterImagesState>>({});
  const [generatingCharId, setGeneratingCharId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    isGenerating,
    progress,
    error: genError,
    generateCharacterImages,
    cancel: cancelGeneration,
  } = usePipelineImages();

  const handleGenerateForCharacter = useCallback(
    async (char: Character) => {
      if (!apiKey) {
        setError('API Key가 설정되지 않았습니다. Settings에서 설정해주세요.');
        return;
      }
      if (!char.appearance) {
        setError(`"${char.name}"의 외형 설명을 먼저 입력해주세요.`);
        return;
      }
      setError(null);
      setGeneratingCharId(char.id);

      const images = await generateCharacterImages(
        apiKey,
        { name: char.name, appearance: char.appearance },
        styleDescription,
        4,
      );

      setCharImages((prev) => ({
        ...prev,
        [char.id]: { images, selectedIdx: null },
      }));
      setGeneratingCharId(null);
    },
    [apiKey, styleDescription, generateCharacterImages],
  );

  const handleSelectImage = useCallback(
    (charId: string, idx: number) => {
      const state = charImages[charId];
      if (!state || !state.images[idx]) return;

      setCharImages((prev) => ({
        ...prev,
        [charId]: { ...prev[charId], selectedIdx: idx },
      }));
      onCharacterImageSelect(charId, state.images[idx].base64);
    },
    [charImages, onCharacterImageSelect],
  );
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

  const charCardStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  };

  const charNameStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 4,
  };

  const charDescStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#666',
    lineHeight: 1.4,
    marginBottom: 8,
  };

  const imageGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 6,
    marginBottom: 8,
  };

  const imageSlotStyle: React.CSSProperties = {
    aspectRatio: '1',
    backgroundColor: '#FAFAFA',
    border: '1px dashed #CCC',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    color: '#CCC',
  };

  const btnPrimaryStyle: React.CSSProperties = {
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

  const disabledBtnStyle: React.CSSProperties = {
    opacity: 0.5,
    cursor: 'not-allowed',
  };

  const emptyStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#AAA',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '16px 0',
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#E53E3E',
    padding: '4px 8px',
    background: '#FFF3F3',
    borderRadius: 4,
    marginBottom: 4,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 4: 등장인물 이미지 생성</div>

      {(error || genError) && <div style={errorStyle}>{error || genError}</div>}

      {/* Character list */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>인물 목록</div>

        {characters.length === 0 && (
          <div style={emptyStyle}>Step 3에서 등장인물을 먼저 설정해주세요.</div>
        )}

        {characters.map((char) => {
          const charState = charImages[char.id];
          const isThisCharGenerating = isGenerating && generatingCharId === char.id;

          return (
            <div key={char.id} style={charCardStyle}>
              <div style={charNameStyle}>{char.name || '(이름 없음)'}</div>
              <div style={charDescStyle}>{char.appearance || '외형 설명 없음'}</div>

              {/* Image grid */}
              <div style={imageGridStyle}>
                {charState && charState.images.length > 0
                  ? charState.images.map((img, idx) => (
                      <div
                        key={img.id}
                        style={{
                          ...imageSlotStyle,
                          border: charState.selectedIdx === idx ? '2px solid #18A0FB' : '1px solid #E5E5E5',
                          cursor: 'pointer',
                          padding: 0,
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                        onClick={() => handleSelectImage(char.id, idx)}
                      >
                        <img
                          src={`data:image/png;base64,${img.base64}`}
                          alt={`${char.name} variant ${idx + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {charState.selectedIdx === idx && (
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
                      </div>
                    ))
                  : [0, 1, 2, 3].map((slot) => (
                      <div key={slot} style={imageSlotStyle}>
                        {slot + 1}
                      </div>
                    ))}
              </div>

              {/* Progress indicator */}
              {isThisCharGenerating && (
                <div style={{ marginBottom: 6 }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
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

              {/* Generate button */}
              <button
                type="button"
                style={{
                  ...btnPrimaryStyle,
                  ...(isGenerating ? disabledBtnStyle : {}),
                }}
                onClick={() => handleGenerateForCharacter(char)}
                disabled={isGenerating}
              >
                {isThisCharGenerating
                  ? `생성 중... (${progress.current}/${progress.total})`
                  : charState && charState.images.length > 0
                    ? '이미지 재생성 (4장)'
                    : '이미지 생성 (4장)'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CharacterImagePanel;
