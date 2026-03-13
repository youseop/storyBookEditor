import React from 'react';
import type { Character } from '../../shared/pipeline';

interface CharacterImagePanelProps {
  characters: Character[];
  onCharacterImageSelect: (characterId: string, imageBase64: string) => void;
  styleDescription: string;
  apiKey: string;
}

const CharacterImagePanel: React.FC<CharacterImagePanelProps> = ({
  characters,
  onCharacterImageSelect,
  styleDescription,
  apiKey,
}) => {
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

  const disabledBtnStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: '#AAA',
    background: '#F5F5F5',
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    cursor: 'not-allowed',
    width: '100%',
  };

  const emptyStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#AAA',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '16px 0',
  };

  const noticeStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#999',
    backgroundColor: '#FAFAFA',
    padding: '10px 12px',
    borderRadius: 6,
    textAlign: 'center',
    lineHeight: 1.5,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 4: 등장인물 이미지 생성</div>

      <div style={noticeStyle}>
        Gemini Image API 연동 후 활성화됩니다
      </div>

      {/* Character list */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>인물 목록</div>

        {characters.length === 0 && (
          <div style={emptyStyle}>Step 3에서 등장인물을 먼저 설정해주세요.</div>
        )}

        {characters.map((char) => (
          <div key={char.id} style={charCardStyle}>
            <div style={charNameStyle}>{char.name || '(이름 없음)'}</div>
            <div style={charDescStyle}>{char.appearance || '외형 설명 없음'}</div>

            {/* Image grid placeholder */}
            <div style={imageGridStyle}>
              {[0, 1, 2, 3].map((slot) => (
                <div key={slot} style={imageSlotStyle}>
                  {slot + 1}
                </div>
              ))}
            </div>

            <button
              type="button"
              style={disabledBtnStyle}
              disabled
            >
              이미지 생성 (추후 구현)
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CharacterImagePanel;
