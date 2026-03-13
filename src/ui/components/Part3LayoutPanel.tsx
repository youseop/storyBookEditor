import React, { useState, useCallback } from 'react';
import { postToPlugin, usePluginMessage } from '../hooks/useFigmaMessages';
import type { StoryPage } from '../../shared/pipeline';

interface Part3LayoutPanelProps {
  pages: StoryPage[];
  keyColorA: string;
  onPart3Created: () => void;
}

type CreateStatus = 'idle' | 'creating' | 'done';

const Part3LayoutPanel: React.FC<Part3LayoutPanelProps> = ({
  pages,
  keyColorA,
  onPart3Created,
}) => {
  const [status, setStatus] = useState<CreateStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [createdPageCount, setCreatedPageCount] = useState(0);

  const nonEmptyPages = pages.filter((p) => !p.isEmpty);

  usePluginMessage((msg) => {
    if (msg.type === 'PART3_LAYOUT_CREATED') {
      setCreatedPageCount(msg.pageCount);
      setStatus('done');
      onPart3Created();
    }
    if (msg.type === 'ERROR') {
      setError(msg.message);
      setStatus('idle');
    }
  });

  const handleCreateLayout = useCallback(() => {
    setStatus('creating');
    setError(null);

    postToPlugin({
      type: 'CREATE_PART3_LAYOUT',
      colorA: keyColorA,
    });
  }, [keyColorA]);

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

  const summaryRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    padding: '6px 0',
    borderBottom: '1px solid #F0F0F0',
  };

  const summaryLabelStyle: React.CSSProperties = {
    color: '#666',
    fontWeight: 500,
  };

  const summaryValueStyle: React.CSSProperties = {
    fontWeight: 700,
    color: '#333',
  };

  const swatchStyle: React.CSSProperties = {
    display: 'inline-block',
    width: 16,
    height: 16,
    borderRadius: 3,
    border: '1px solid #DDD',
    marginRight: 6,
    verticalAlign: 'middle',
    background: keyColorA,
  };

  const previewSectionStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    borderRadius: 6,
    padding: 10,
  };

  const previewTitleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };

  const previewItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11,
    color: '#555',
    padding: '4px 0',
  };

  const dotStyle = (color: string): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  });

  const btnPrimaryStyle: React.CSSProperties = {
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 700,
    color: '#fff',
    background: '#18A0FB',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    width: '100%',
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#E53935',
    padding: '6px 8px',
    background: '#FFF3F3',
    borderRadius: 4,
    marginBottom: 4,
  };

  const successStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '10px 12px',
    background: '#E8F8F0',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    color: '#1BC47D',
  };

  const noteStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
    padding: '4px 0',
    fontStyle: 'italic',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 14: Part 3 기본 레이아웃</div>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Summary section */}
      <div style={sectionStyle}>
        <div style={summaryRowStyle}>
          <span style={summaryLabelStyle}>Part 1 페이지 수</span>
          <span style={summaryValueStyle}>{nonEmptyPages.length}</span>
        </div>
        <div style={summaryRowStyle}>
          <span style={summaryLabelStyle}>Part 3 페이지 수</span>
          <span style={summaryValueStyle}>{nonEmptyPages.length} (동일)</span>
        </div>
        <div style={{ ...summaryRowStyle, borderBottom: 'none' }}>
          <span style={summaryLabelStyle}>키컬러 A</span>
          <span style={summaryValueStyle}>
            <span style={swatchStyle} />
            {keyColorA}
          </span>
        </div>
      </div>

      {/* Layout description */}
      <div style={previewSectionStyle}>
        <div style={previewTitleStyle}>각 Part 3 페이지 구성</div>

        <div style={previewItemStyle}>
          <div style={dotStyle(keyColorA)} />
          <span>키컬러 A ({keyColorA}) 배경</span>
        </div>
        <div style={previewItemStyle}>
          <div style={dotStyle('#18A0FB')} />
          <span>Part 1 이미지 (높이 축소)</span>
        </div>
        <div style={previewItemStyle}>
          <div style={dotStyle('#666')} />
          <span>대사 재배치</span>
        </div>
        <div style={previewItemStyle}>
          <div style={dotStyle('#CCC')} />
          <span>Key Expression 빈 공간</span>
        </div>
      </div>

      {/* Create button or success state */}
      {status === 'done' ? (
        <div style={successStyle}>
          Part 3 레이아웃 생성 완료 ({createdPageCount} 페이지)
        </div>
      ) : (
        <button
          type="button"
          style={{
            ...btnPrimaryStyle,
            ...((nonEmptyPages.length === 0 || status === 'creating')
              ? { opacity: 0.5, cursor: 'not-allowed' }
              : {}),
          }}
          onClick={handleCreateLayout}
          disabled={nonEmptyPages.length === 0 || status === 'creating'}
        >
          {status === 'creating' ? '생성 중...' : 'Part 3 레이아웃 생성'}
        </button>
      )}

      <div style={noteStyle}>
        생성 후 디자이너가 축소된 이미지/텍스트 상태를 검수합니다
      </div>
    </div>
  );
};

export default Part3LayoutPanel;
