import React, { useMemo } from 'react';

interface ImageHoverPreviewProps {
  imageBase64: string | null;
  mouseX: number;
  mouseY: number;
}

const PREVIEW_SIZE = 240;
const OFFSET = 16;

const ImageHoverPreview: React.FC<ImageHoverPreviewProps> = ({
  imageBase64,
  mouseX,
  mouseY,
}) => {
  const position = useMemo(() => {
    // Position the preview near the cursor, but keep it on-screen.
    // In Figma plugin iframe the viewport is the plugin window itself.
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let left = mouseX + OFFSET;
    let top = mouseY + OFFSET;

    // If preview would overflow right, show on the left side of cursor
    if (left + PREVIEW_SIZE > viewportW) {
      left = mouseX - PREVIEW_SIZE - OFFSET;
    }
    // If preview would overflow bottom, move up
    if (top + PREVIEW_SIZE > viewportH) {
      top = mouseY - PREVIEW_SIZE - OFFSET;
    }
    // Clamp to viewport
    if (left < 4) left = 4;
    if (top < 4) top = 4;

    return { left, top };
  }, [mouseX, mouseY]);

  if (!imageBase64) return null;

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.left,
    top: position.top,
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    zIndex: 9999,
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
    border: '1px solid #E5E5E5',
    backgroundColor: '#FFF',
    pointerEvents: 'none',
  };

  const imgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
  };

  return (
    <div style={containerStyle}>
      <img
        src={`data:image/png;base64,${imageBase64}`}
        alt="Preview"
        style={imgStyle}
      />
    </div>
  );
};

export default ImageHoverPreview;
