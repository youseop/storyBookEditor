import React, { useState, useCallback } from 'react';
import { postToPlugin, usePluginMessage } from '../hooks/useFigmaMessages';
import type { StoryPage } from '../../shared/pipeline';

interface Part2PagesPanelProps {
  pages: StoryPage[];
  translations: Record<number, string[][]>;
  onPart2Created: () => void;
}

type CreateStatus = 'idle' | 'creating' | 'done';

const Part2PagesPanel: React.FC<Part2PagesPanelProps> = ({
  pages,
  translations,
  onPart2Created,
}) => {
  const [status, setStatus] = useState<CreateStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [createdPageCount, setCreatedPageCount] = useState(0);

  const nonEmptyPages = pages.filter((p) => !p.isEmpty);
  const translatedCount = nonEmptyPages.filter((p) => translations[p.pageIndex]?.length > 0).length;
  const allTranslated = translatedCount === nonEmptyPages.length && nonEmptyPages.length > 0;

  usePluginMessage((msg) => {
    if (msg.type === 'PART2_PAGES_CREATED') {
      setCreatedPageCount(msg.pageCount);
      setStatus('done');
      onPart2Created();
    }
    if (msg.type === 'ERROR') {
      setError(msg.message);
      setStatus('idle');
    }
  });

  const handleCreatePart2 = useCallback(() => {
    if (!allTranslated) return;

    setStatus('creating');
    setError(null);

    const translationEntries = Object.entries(translations).map(([pageIdx, blocks]) => ({
      pageIndex: Number(pageIdx),
      englishTextBlocks: blocks,
    }));

    postToPlugin({
      type: 'CREATE_PART2_PAGES',
      translations: translationEntries,
    });
  }, [allTranslated, translations]);

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

  const warningStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#E53935',
    padding: '6px 8px',
    background: '#FFF3F3',
    borderRadius: 4,
    marginTop: 6,
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#E53935',
    padding: '6px 8px',
    background: '#FFF3F3',
    borderRadius: 4,
    marginBottom: 4,
  };

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
      <style>{`
        @keyframes indeterminate {
          0% { margin-left: -30%; }
          100% { margin-left: 100%; }
        }
      `}</style>
      <div style={headerStyle}>Step 12: Part 2 페이지 생성</div>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Summary section */}
      <div style={sectionStyle}>
        <div style={summaryRowStyle}>
          <span style={summaryLabelStyle}>Part 1 페이지 수</span>
          <span style={summaryValueStyle}>{nonEmptyPages.length}</span>
        </div>
        <div style={{ ...summaryRowStyle, borderBottom: 'none' }}>
          <span style={summaryLabelStyle}>번역 완료</span>
          <span style={{
            ...summaryValueStyle,
            color: allTranslated ? '#1BC47D' : '#F5A623',
          }}>
            {translatedCount} / {nonEmptyPages.length} 페이지
          </span>
        </div>

        {!allTranslated && nonEmptyPages.length > 0 && (
          <div style={warningStyle}>
            모든 페이지의 번역이 완료되어야 Part 2를 생성할 수 있습니다.
          </div>
        )}
      </div>

      {/* Part 2 structure preview */}
      <div style={previewSectionStyle}>
        <div style={previewTitleStyle}>Part 2 구조 미리보기</div>

        <div style={previewItemStyle}>
          <div style={dotStyle('#18A0FB')} />
          <span>Part 1 복사</span>
        </div>
        <div style={previewItemStyle}>
          <div style={dotStyle('#CCC')} />
          <span>빈 페이지 2개 (구분선)</span>
        </div>
        <div style={previewItemStyle}>
          <div style={dotStyle('#1BC47D')} />
          <span>Part 2 페이지 {nonEmptyPages.length}개 (한국어 + 영어)</span>
        </div>
      </div>

      {/* Create button or success state */}
      {status === 'done' ? (
        <div style={successStyle}>
          Part 2 생성 완료 ({createdPageCount} 페이지)
        </div>
      ) : (
        <button
          type="button"
          style={{
            ...btnPrimaryStyle,
            ...((!allTranslated || status === 'creating') ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
          }}
          onClick={handleCreatePart2}
          disabled={!allTranslated || status === 'creating'}
        >
          {status === 'creating' ? '생성 중...' : 'Part 2 생성'}
        </button>
      )}

      {status === 'creating' && (
        <div style={{
          width: '100%',
          height: 4,
          background: '#E5E5E5',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            width: '30%',
            height: '100%',
            background: '#18A0FB',
            borderRadius: 2,
            animation: 'indeterminate 1.5s ease-in-out infinite',
          }} />
        </div>
      )}

      <div style={noteStyle}>
        Part 2 생성 후 디자이너가 영어 텍스트 위치를 확인합니다
      </div>
    </div>
  );
};

export default Part2PagesPanel;
