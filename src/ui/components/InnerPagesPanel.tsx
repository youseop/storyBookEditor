import React, { useState, useCallback, useEffect } from 'react';

interface InnerPagesPanelProps {
  keyColorA: string;
  keyColorB: string;
}

interface InnerPageItem {
  id: string;
  label: string;
  checked: boolean;
}

const DEFAULT_INNER_PAGES: InnerPageItem[] = [
  { id: 'intro', label: 'Pronounce Korean 소개 페이지', checked: true },
  { id: 'index', label: 'Index (목차)', checked: true },
  { id: 'qr-title', label: 'QR Resource 타이틀 페이지', checked: true },
  { id: 'qr-guide', label: 'QR Resource 안내 페이지', checked: true },
  { id: 'characters', label: '메인 등장인물 설명 페이지', checked: true },
  { id: 'part1-title', label: 'Part 1 타이틀 페이지 ("Korean")', checked: true },
  { id: 'part2-title', label: 'Part 2 타이틀 페이지 ("Korean + English")', checked: true },
  { id: 'part3-title', label: 'Part 3 타이틀 페이지 ("Korean + Key Expressions")', checked: true },
  { id: 'blank-back', label: '뒷장 여백 페이지', checked: true },
  { id: 'class-info', label: '대화 수업 신청 안내 + QR 페이지', checked: true },
];

const InnerPagesPanel: React.FC<InnerPagesPanelProps> = ({
  keyColorA,
  keyColorB,
}) => {
  const [pages, setPages] = useState<InnerPageItem[]>(DEFAULT_INNER_PAGES);
  const [bookTitle, setBookTitle] = useState('');
  const [bookTitleEn, setBookTitleEn] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  const handleToggle = useCallback((id: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p))
    );
  }, []);

  const handleGenerate = useCallback(() => {
    const selected = pages.filter((p) => p.checked);
    if (selected.length === 0) return;

    setIsCreating(true);
    setCreatedCount(null);

    parent.postMessage(
      {
        pluginMessage: {
          type: 'CREATE_INNER_PAGES',
          pages: selected.map((p) => p.id),
          keyColorA,
          keyColorB,
          bookTitle: bookTitle || undefined,
          bookTitleEn: bookTitleEn || undefined,
        },
      },
      '*'
    );
  }, [pages, keyColorA, keyColorB, bookTitle, bookTitleEn]);

  // Listen for response
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;
      if (msg.type === 'INNER_PAGES_CREATED') {
        setIsCreating(false);
        setCreatedCount(msg.pageCount);
      }
      if (msg.type === 'ERROR' && isCreating) {
        setIsCreating(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [isCreating]);

  const selectedCount = pages.filter((p) => p.checked).length;

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

  const checklistStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  };

  const checkItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: 4,
    transition: 'background 0.15s',
  };

  const checkboxStyle = (checked: boolean): React.CSSProperties => ({
    width: 16,
    height: 16,
    borderRadius: 3,
    border: checked ? `2px solid ${keyColorA}` : '2px solid #CCC',
    background: checked ? keyColorA : '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  const checkmarkStyle: React.CSSProperties = {
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
  };

  const summaryStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#18A0FB',
    padding: '8px 10px',
    background: '#F0F8FF',
    borderRadius: 4,
    textAlign: 'center',
  };

  const primaryBtnStyle: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    background: isCreating ? '#999' : '#18A0FB',
    border: 'none',
    borderRadius: 6,
    cursor: selectedCount > 0 && !isCreating ? 'pointer' : 'not-allowed',
    width: '100%',
    opacity: selectedCount > 0 ? 1 : 0.5,
  };

  const noteStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
    padding: '4px 0',
    fontStyle: 'italic',
  };

  const inputLabelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#555',
    marginBottom: 4,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    fontSize: 12,
    border: '1px solid #DDD',
    borderRadius: 4,
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const inputGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 6,
  };

  const successStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#1B9E5A',
    padding: '8px 10px',
    background: '#EEFBF3',
    borderRadius: 4,
    textAlign: 'center',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 19: 내지 제작</div>

      {/* Book Title Inputs */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>도서 정보</div>
        <div style={inputGroupStyle}>
          <label style={inputLabelStyle}>도서 제목 (한글)</label>
          <input
            type="text"
            style={inputStyle}
            value={bookTitle}
            onChange={(e) => setBookTitle(e.target.value)}
            placeholder="예: 프로나운스 코리안"
          />
        </div>
        <div style={inputGroupStyle}>
          <label style={inputLabelStyle}>도서 제목 (영문)</label>
          <input
            type="text"
            style={inputStyle}
            value={bookTitleEn}
            onChange={(e) => setBookTitleEn(e.target.value)}
            placeholder="예: Pronounce Korean"
          />
        </div>
      </div>

      {/* Inner Pages Checklist */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>내지 목록</div>

        <div style={checklistStyle}>
          {pages.map((page) => (
            <div
              key={page.id}
              style={{
                ...checkItemStyle,
                background: page.checked ? '#FAFAFA' : 'transparent',
              }}
              onClick={() => handleToggle(page.id)}
            >
              <div style={checkboxStyle(page.checked)}>
                {page.checked && <span style={checkmarkStyle}>&#10003;</span>}
              </div>
              <span style={{ color: page.checked ? '#333' : '#999' }}>
                {page.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div style={summaryStyle}>
        {selectedCount}개 내지 선택됨
      </div>

      {/* Success Message */}
      {createdCount !== null && (
        <div style={successStyle}>
          {createdCount}개 내지 프레임이 생성되었습니다
        </div>
      )}

      {/* Generate Button */}
      <button
        type="button"
        style={primaryBtnStyle}
        onClick={handleGenerate}
        disabled={selectedCount === 0 || isCreating}
      >
        {isCreating ? '생성 중...' : '선택 내지 생성'}
      </button>

      <div style={noteStyle}>
        각 내지 템플릿에서 내용을 수정하고 이미지를 선택할 수 있습니다
      </div>
    </div>
  );
};

export default InnerPagesPanel;
