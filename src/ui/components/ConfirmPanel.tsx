import React, { useState, useCallback } from 'react';

interface ConfirmPanelProps {
  partName: string;
  partNameKo: string;
  pageCount: number;
  onConfirm: () => void;
  description?: string;
}

const CHECKLIST_ITEMS = [
  '모든 이미지가 적절히 배치되었습니다',
  '대사가 올바르게 표시됩니다',
  '페이지 순서가 맞습니다',
];

const ConfirmPanel: React.FC<ConfirmPanelProps> = ({
  partName,
  partNameKo,
  pageCount,
  onConfirm,
  description,
}) => {
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = useCallback(() => {
    setConfirmed(true);
    onConfirm();
  }, [onConfirm]);

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
    padding: 12,
  };

  const partNameStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 700,
    color: '#333',
    marginBottom: 4,
  };

  const partNameKoStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  };

  const descriptionStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#666',
    lineHeight: 1.5,
    marginBottom: 8,
  };

  const summaryStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#18A0FB',
    padding: '8px 10px',
    background: '#F0F8FF',
    borderRadius: 4,
    marginBottom: 12,
  };

  const checklistStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 12,
  };

  const checklistTitleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };

  const checkItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11,
    color: '#555',
  };

  const checkboxStyle: React.CSSProperties = {
    width: 14,
    height: 14,
    border: '1px solid #CCC',
    borderRadius: 3,
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  const checkDotStyle: React.CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#DDD',
  };

  const btnConfirmStyle: React.CSSProperties = {
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 700,
    color: '#fff',
    background: confirmed ? '#1BC47D' : '#18A0FB',
    border: 'none',
    borderRadius: 6,
    cursor: confirmed ? 'default' : 'pointer',
    width: '100%',
    transition: 'background 0.2s',
    ...(confirmed ? { opacity: 0.8 } : {}),
  };

  const noteStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
    padding: '4px 0',
    fontStyle: 'italic',
  };

  const confirmedBadgeStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 12px',
    background: '#E8F8F0',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    color: '#1BC47D',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>{partNameKo} 확정</div>

      <div style={sectionStyle}>
        {/* Part name and description */}
        <div style={partNameStyle}>{partName}</div>
        <div style={partNameKoStyle}>{partNameKo}</div>

        {description && <div style={descriptionStyle}>{description}</div>}

        {/* Summary */}
        <div style={summaryStyle}>
          총 {pageCount} 페이지
        </div>

        {/* Checklist */}
        <div style={checklistTitleStyle}>확인 사항</div>
        <div style={checklistStyle}>
          {CHECKLIST_ITEMS.map((item, idx) => (
            <div key={idx} style={checkItemStyle}>
              <div style={checkboxStyle}>
                <div style={checkDotStyle} />
              </div>
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* Confirm button */}
        {!confirmed ? (
          <button
            type="button"
            style={{
              ...btnConfirmStyle,
              ...(pageCount === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
            }}
            onClick={handleConfirm}
            disabled={pageCount === 0}
          >
            {partName} 확정
          </button>
        ) : (
          <div style={confirmedBadgeStyle}>
            {partName} 확정 완료
          </div>
        )}
      </div>

      <div style={noteStyle}>확정 후 자동으로 스냅샷이 저장됩니다</div>
    </div>
  );
};

export default ConfirmPanel;
