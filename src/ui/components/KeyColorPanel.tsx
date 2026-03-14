import React, { useState, useCallback, useEffect } from 'react';
import { postToPlugin } from '../hooks/useFigmaMessages';

interface KeyColorPanelProps {
  colorA: string;
  colorB: string;
  onColorsChange: (colorA: string, colorB: string) => void;
}

const KeyColorPanel: React.FC<KeyColorPanelProps> = ({
  colorA,
  colorB,
  onColorsChange,
}) => {
  const [localColorA, setLocalColorA] = useState(colorA);
  const [localColorB, setLocalColorB] = useState(colorB);

  useEffect(() => {
    setLocalColorA(colorA);
    setLocalColorB(colorB);
  }, [colorA, colorB]);

  const handleApply = useCallback(() => {
    onColorsChange(localColorA, localColorB);
    postToPlugin({
      type: 'SAVE_KEY_COLORS',
      colorA: localColorA,
      colorB: localColorB,
    });
  }, [localColorA, localColorB, onColorsChange]);

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

  const colorRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  };

  const colorSwatchStyle = (color: string): React.CSSProperties => ({
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: color,
    border: '1px solid #E5E5E5',
    flexShrink: 0,
  });

  const colorInputGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#666',
    fontWeight: 600,
  };

  const hexInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "'SF Mono', 'Menlo', 'Consolas', monospace",
    color: '#333',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const colorPickerStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    borderRadius: 4,
    backgroundColor: 'transparent',
  };

  const colorInputRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };

  const previewCardStyle: React.CSSProperties = {
    width: '100%',
    height: 100,
    borderRadius: 8,
    backgroundColor: localColorA,
    border: `3px solid ${localColorB}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  };

  const previewTextStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    textShadow: '0 1px 3px rgba(0,0,0,0.3)',
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
      <div style={headerStyle}>Step 2: 키컬러 확정</div>

      {/* Current key colors */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>현재 키컬러</div>

        {/* Color A */}
        <div style={colorRowStyle}>
          <div style={colorSwatchStyle(localColorA)} />
          <div style={colorInputGroupStyle}>
            <div style={labelStyle}>Color A (주요 배경색)</div>
            <div style={colorInputRowStyle}>
              <input
                type="text"
                value={localColorA}
                onChange={(e) => setLocalColorA(e.target.value)}
                style={hexInputStyle}
                placeholder="#FFCF66"
              />
              <input
                type="color"
                value={localColorA}
                onChange={(e) => setLocalColorA(e.target.value)}
                style={colorPickerStyle}
              />
            </div>
          </div>
        </div>

        {/* Color B */}
        <div style={colorRowStyle}>
          <div style={colorSwatchStyle(localColorB)} />
          <div style={colorInputGroupStyle}>
            <div style={labelStyle}>Color B (강조/보더색)</div>
            <div style={colorInputRowStyle}>
              <input
                type="text"
                value={localColorB}
                onChange={(e) => setLocalColorB(e.target.value)}
                style={hexInputStyle}
                placeholder="#FFF69B"
              />
              <input
                type="color"
                value={localColorB}
                onChange={(e) => setLocalColorB(e.target.value)}
                style={colorPickerStyle}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>미리보기</div>
        <div style={previewCardStyle}>
          <div style={previewTextStyle}>Sample Card</div>
        </div>
      </div>

      {/* Apply button */}
      <button
        type="button"
        style={primaryBtnStyle}
        onClick={handleApply}
      >
        키컬러 적용
      </button>
    </div>
  );
};

export default KeyColorPanel;
