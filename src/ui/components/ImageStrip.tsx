import React, { useRef, useCallback } from 'react';

export interface ImageStripItem {
  id: string;
  base64: string;
  prompt?: string;
}

interface ImageStripProps {
  images: ImageStripItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  imageSize?: number;
  onHoverImage?: (base64: string | null, event: React.MouseEvent | null) => void;
}

const ImageStrip: React.FC<ImageStripProps> = ({
  images,
  selectedId,
  onSelect,
  imageSize = 72,
  onHoverImage,
}) => {
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(
    (base64: string, event: React.MouseEvent) => {
      if (!onHoverImage) return;
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      const clientX = event.clientX;
      const clientY = event.clientY;
      hoverTimerRef.current = setTimeout(() => {
        // Create a synthetic-like position object for the preview
        onHoverImage(base64, { clientX, clientY } as unknown as React.MouseEvent);
      }, 1000);
    },
    [onHoverImage],
  );

  const handleMouseMove = useCallback(
    (base64: string, event: React.MouseEvent) => {
      // If already showing preview (timer fired), update position
      if (!onHoverImage) return;
      // We don't update during the delay, only after the 1s delay fires
    },
    [onHoverImage],
  );

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    onHoverImage?.(null, null);
  }, [onHoverImage]);

  if (images.length === 0) return null;

  const containerStyle: React.CSSProperties = {
    overflowX: 'auto',
    whiteSpace: 'nowrap',
    display: 'flex',
    gap: 6,
    padding: '4px 0',
  };

  const thumbStyle = (isSelected: boolean): React.CSSProperties => ({
    width: imageSize,
    height: imageSize,
    borderRadius: 6,
    cursor: 'pointer',
    flexShrink: 0,
    border: isSelected ? '2px solid #18A0FB' : '1px solid #E5E5E5',
    overflow: 'hidden',
    position: 'relative',
    display: 'inline-block',
    boxSizing: 'border-box',
  });

  const imgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  };

  const selectedLabelStyle: React.CSSProperties = {
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
  };

  return (
    <div style={containerStyle}>
      {images.map((img) => (
        <div
          key={img.id}
          style={thumbStyle(selectedId === img.id)}
          onClick={() => onSelect(img.id)}
          onMouseEnter={(e) => handleMouseEnter(img.base64, e)}
          onMouseLeave={handleMouseLeave}
        >
          <img
            src={`data:image/png;base64,${img.base64}`}
            alt={img.prompt || 'Generated image'}
            style={imgStyle}
          />
          {selectedId === img.id && (
            <div style={selectedLabelStyle}>선택됨</div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ImageStrip;
