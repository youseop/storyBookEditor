import React, { useState, useCallback } from 'react';
import { postToPlugin, usePluginMessage } from '../hooks/useFigmaMessages';
import type { SandboxToUIMessage } from '../../shared/messageTypes';
import type { StoryPage } from '../../shared/pipeline';

interface FinalOutputPanelProps {
  pages: StoryPage[];
  onComplete: () => void;
}

const FinalOutputPanel: React.FC<FinalOutputPanelProps> = ({
  pages,
  onComplete,
}) => {
  const [brandText, setBrandText] = useState('Pronounce Korean');
  const [spreadView, setSpreadView] = useState(true);
  const [individualView, setIndividualView] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [pageNumbersInserted, setPageNumbersInserted] = useState(false);

  // Listen for plugin responses
  usePluginMessage(useCallback((msg: SandboxToUIMessage) => {
    switch (msg.type) {
      case 'PAGE_NUMBERS_INSERTED':
        setPageNumbersInserted(true);
        break;
      case 'FINAL_OUTPUT_GENERATED':
        setIsGenerating(false);
        setIsComplete(true);
        break;
    }
  }, []));

  const handleInsertPageNumbers = useCallback(() => {
    postToPlugin({
      type: 'INSERT_PAGE_NUMBERS',
      brandText,
    });
  }, [brandText]);

  const handleGenerateFinalOutput = useCallback(() => {
    setIsGenerating(true);
    const outputType: 'spread' | 'individual' | 'both' =
      spreadView && individualView ? 'both' :
      spreadView ? 'spread' : 'individual';
    postToPlugin({
      type: 'GENERATE_FINAL_OUTPUT',
      outputType,
    });
  }, [spreadView, individualView]);

  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

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

  const ruleStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#888',
    lineHeight: 1.6,
    padding: '6px 8px',
    background: '#F8F8F8',
    borderRadius: 4,
    marginBottom: 8,
  };

  const checkItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    cursor: 'pointer',
    padding: '4px 0',
  };

  const checkboxStyle = (checked: boolean): React.CSSProperties => ({
    width: 16,
    height: 16,
    borderRadius: 3,
    border: checked ? '2px solid #18A0FB' : '2px solid #CCC',
    background: checked ? '#18A0FB' : '#fff',
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

  const btnStyle = (variant: 'primary' | 'secondary'): React.CSSProperties => ({
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    background: variant === 'primary' ? '#18A0FB' : '#555',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    width: '100%',
  });

  const doneBtnStyle: React.CSSProperties = {
    ...btnStyle('primary'),
    background: pageNumbersInserted ? '#1BC47D' : '#18A0FB',
    opacity: pageNumbersInserted ? 0.85 : 1,
  };

  const orderStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#555',
    lineHeight: 1.6,
    padding: '8px 10px',
    background: '#FFF8E7',
    borderRadius: 4,
    borderLeft: '3px solid #FFCF66',
  };

  const progressStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#18A0FB',
    padding: '8px 10px',
    background: '#F0F8FF',
    borderRadius: 4,
    textAlign: 'center',
  };

  const successStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '16px 12px',
    background: '#E8F8F0',
    borderRadius: 8,
    border: '1px solid #B8E8D0',
  };

  const successTitleStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 700,
    color: '#1BC47D',
  };

  const successSubStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#666',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 20: 최종 산출물</div>

      {/* Page Numbers */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>페이지 번호 삽입</div>

        <div style={inputGroupStyle}>
          <div style={labelStyle}>브랜드 텍스트</div>
          <input
            type="text"
            style={inputStyle}
            value={brandText}
            onChange={(e) => setBrandText(e.target.value)}
            placeholder="Pronounce Korean"
          />
        </div>

        <div style={ruleStyle}>
          <div>왼쪽 페이지: [번호] {brandText} (좌측 정렬)</div>
          <div>오른쪽 페이지: {brandText} [번호] (우측 정렬)</div>
        </div>

        <button
          type="button"
          style={doneBtnStyle}
          onClick={handleInsertPageNumbers}
        >
          {pageNumbersInserted ? '페이지 번호 삽입 완료' : '페이지 번호 삽입'}
        </button>
      </div>

      {/* Final Output Generation */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>최종 결과물 생성</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          <div
            style={checkItemStyle}
            onClick={() => setSpreadView(!spreadView)}
          >
            <div style={checkboxStyle(spreadView)}>
              {spreadView && <span style={checkmarkStyle}>✓</span>}
            </div>
            <span>스프레드 뷰 (2:1 비율, 양 페이지 합침)</span>
          </div>

          <div
            style={checkItemStyle}
            onClick={() => setIndividualView(!individualView)}
          >
            <div style={checkboxStyle(individualView)}>
              {individualView && <span style={checkmarkStyle}>✓</span>}
            </div>
            <span>개별 페이지 뷰 (1:1 비율)</span>
          </div>
        </div>

        {isGenerating && (
          <div style={progressStyle}>
            최종 결과물 생성 중...
          </div>
        )}

        {!isGenerating && !isComplete && (
          <button
            type="button"
            style={{
              ...btnStyle('primary'),
              opacity: spreadView || individualView ? 1 : 0.5,
              cursor: spreadView || individualView ? 'pointer' : 'not-allowed',
            }}
            onClick={handleGenerateFinalOutput}
            disabled={!spreadView && !individualView}
          >
            최종 결과물 생성
          </button>
        )}

        {isComplete && (
          <div style={progressStyle}>
            최종 결과물 생성 완료
          </div>
        )}
      </div>

      {/* Final Order Info */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>최종 순서 확인</div>
        <div style={orderStyle}>
          표지 &gt; 내지(소개/목차) &gt; Part 1 &gt; Part 2 &gt; Part 3 &gt; 뒷내지 &gt; 뒷표지
        </div>
      </div>

      {/* Completion */}
      {isComplete && (
        <div style={successStyle}>
          <div style={successTitleStyle}>동화책 제작 완료!</div>
          <div style={successSubStyle}>
            총 {pages.length}페이지 동화책이 생성되었습니다
          </div>
          <button
            type="button"
            style={{
              ...btnStyle('primary'),
              background: '#1BC47D',
              width: 'auto',
              padding: '8px 24px',
            }}
            onClick={handleComplete}
          >
            완료
          </button>
        </div>
      )}
    </div>
  );
};

export default FinalOutputPanel;
