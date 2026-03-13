import React, { useState, useCallback } from 'react';

interface CoverPanelProps {
  apiKey: string;
  styleDescription: string;
  keyColorA: string;
  keyColorB: string;
}

const CoverPanel: React.FC<CoverPanelProps> = ({
  apiKey,
  styleDescription,
  keyColorA,
  keyColorB,
}) => {
  const [imageSource, setImageSource] = useState<'existing' | 'generate'>('existing');
  const [customPrompt, setCustomPrompt] = useState('');
  const [titleKo, setTitleKo] = useState('');
  const [titleEn, setTitleEn] = useState('');

  const handleGenerateImage = useCallback(() => {
    console.log('[CoverPanel] Generate cover image', {
      apiKey: apiKey ? '***' : '(empty)',
      styleDescription,
      customPrompt,
    });
  }, [apiKey, styleDescription, customPrompt]);

  const handleCreateCover = useCallback(() => {
    console.log('[CoverPanel] Create cover', {
      imageSource,
      titleKo,
      titleEn,
      keyColorA,
      keyColorB,
    });
  }, [imageSource, titleKo, titleEn, keyColorA, keyColorB]);

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

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };

  const noteStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
    lineHeight: 1.4,
    marginBottom: 6,
  };

  const radioRowStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 8,
  };

  const radioLabelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    cursor: 'pointer',
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 60,
    padding: '6px 8px',
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: 'inherit',
    color: '#333',
    resize: 'vertical',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    fontSize: 12,
    fontFamily: 'inherit',
    color: '#333',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#666',
    fontWeight: 600,
    marginBottom: 4,
  };

  const inputGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 8,
  };

  const smallBtnStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    background: '#18A0FB',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  };

  const previewBoxStyle: React.CSSProperties = {
    width: 280,
    height: 140,
    borderRadius: 6,
    backgroundColor: keyColorA,
    border: `2px solid ${keyColorB}`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
    margin: '0 auto',
  };

  const previewTitleKoStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
    textShadow: '0 1px 3px rgba(0,0,0,0.3)',
    textAlign: 'center',
    padding: '0 12px',
    wordBreak: 'keep-all',
  };

  const previewTitleEnStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.85)',
    textShadow: '0 1px 2px rgba(0,0,0,0.2)',
    textAlign: 'center',
    padding: '0 12px',
  };

  const primaryBtnStyle: React.CSSProperties = {
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

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 18: 표지 제작</div>

      {/* Cover Image Selection */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>표지 이미지 선택</div>

        <div style={radioRowStyle}>
          <label style={radioLabelStyle}>
            <input
              type="radio"
              name="imageSource"
              checked={imageSource === 'existing'}
              onChange={() => setImageSource('existing')}
            />
            기존 이미지에서 선택
          </label>
          {imageSource === 'existing' && (
            <div style={noteStyle}>
              Figma에서 기존 생성 이미지 중 표지 후보를 선택하세요
            </div>
          )}

          <label style={radioLabelStyle}>
            <input
              type="radio"
              name="imageSource"
              checked={imageSource === 'generate'}
              onChange={() => setImageSource('generate')}
            />
            새 이미지 생성
          </label>
          {imageSource === 'generate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 20 }}>
              <textarea
                style={textareaStyle}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="표지 이미지를 위한 프롬프트를 입력하세요..."
              />
              <div style={noteStyle}>
                2:1 비율로 표지용 이미지를 생성합니다
              </div>
              <button type="button" style={smallBtnStyle} onClick={handleGenerateImage}>
                생성
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Title Input */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>제목 입력</div>

        <div style={inputGroupStyle}>
          <div style={labelStyle}>한국어 제목</div>
          <input
            type="text"
            style={inputStyle}
            value={titleKo}
            onChange={(e) => setTitleKo(e.target.value)}
            placeholder="동화책 한국어 제목"
          />
        </div>

        <div style={inputGroupStyle}>
          <div style={labelStyle}>영어 제목</div>
          <input
            type="text"
            style={inputStyle}
            value={titleEn}
            onChange={(e) => setTitleEn(e.target.value)}
            placeholder="English title"
          />
        </div>
      </div>

      {/* Cover Preview */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>표지 미리보기</div>

        <div style={previewBoxStyle}>
          <div style={previewTitleKoStyle}>
            {titleKo || '한국어 제목'}
          </div>
          <div style={previewTitleEnStyle}>
            {titleEn || 'English Title'}
          </div>
        </div>
      </div>

      {/* Create Cover Button */}
      <button type="button" style={primaryBtnStyle} onClick={handleCreateCover}>
        표지 생성
      </button>
    </div>
  );
};

export default CoverPanel;
