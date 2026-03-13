import React, { useState, useCallback } from 'react';

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
  { id: 'pronounce-intro', label: 'Pronounce Korean 소개 페이지', checked: true },
  { id: 'index', label: 'Index (목차)', checked: true },
  { id: 'qr-title', label: 'QR Resource 타이틀 페이지', checked: true },
  { id: 'qr-guide', label: 'QR Resource 안내 페이지', checked: true },
  { id: 'main-characters', label: '메인 등장인물 설명 페이지', checked: true },
  { id: 'part1-title', label: 'Part 1 타이틀 페이지 ("Korean")', checked: true },
  { id: 'part2-title', label: 'Part 2 타이틀 페이지 ("Korean + English")', checked: true },
  { id: 'part3-title', label: 'Part 3 타이틀 페이지 ("Korean + Key Expressions")', checked: true },
  { id: 'back-blank', label: '뒷장 여백 페이지', checked: true },
  { id: 'class-qr', label: '대화 수업 신청 안내 + QR 페이지', checked: true },
];

const InnerPagesPanel: React.FC<InnerPagesPanelProps> = ({
  keyColorA,
  keyColorB,
}) => {
  const [pages, setPages] = useState<InnerPageItem[]>(DEFAULT_INNER_PAGES);

  const handleToggle = useCallback((id: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p))
    );
  }, []);

  const handleGenerate = useCallback(() => {
    const selected = pages.filter((p) => p.checked);
    console.log('[InnerPagesPanel] Generate inner pages', {
      selectedCount: selected.length,
      selectedIds: selected.map((p) => p.id),
      keyColorA,
      keyColorB,
    });
  }, [pages, keyColorA, keyColorB]);

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
    background: '#18A0FB',
    border: 'none',
    borderRadius: 6,
    cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
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

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 19: 내지 제작</div>

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
                {page.checked && <span style={checkmarkStyle}>✓</span>}
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

      {/* Generate Button */}
      <button
        type="button"
        style={primaryBtnStyle}
        onClick={handleGenerate}
        disabled={selectedCount === 0}
      >
        선택 내지 생성
      </button>

      <div style={noteStyle}>
        각 내지 템플릿에서 내용을 수정하고 이미지를 선택할 수 있습니다
      </div>
    </div>
  );
};

export default InnerPagesPanel;
