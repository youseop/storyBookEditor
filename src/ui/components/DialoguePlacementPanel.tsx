import React, { useState, useCallback } from 'react';
import { postToPlugin } from '../hooks/useFigmaMessages';
import type { StoryPage } from '../../shared/pipeline';

type DialogueTemplate = 'plain' | 'border-a' | 'border-b';

interface DialoguePlacementPanelProps {
  pages: StoryPage[];
  keyColorA: string;
  keyColorB: string;
}

function getPageTextPreview(page: StoryPage, maxLen = 40): string {
  if (page.isEmpty) return '[빈 페이지]';
  const allText = page.textBlocks.map((b) => b.join(' ')).join(' ');
  return allText.length > maxLen ? allText.slice(0, maxLen) + '…' : allText;
}

const TEMPLATE_OPTIONS: { value: DialogueTemplate; label: string }[] = [
  { value: 'plain', label: '텍스트만' },
  { value: 'border-b', label: '키컬러 B 테두리' },
  { value: 'border-a', label: '키컬러 A 테두리' },
];

const DialoguePlacementPanel: React.FC<DialoguePlacementPanelProps> = ({
  pages,
  keyColorA,
  keyColorB,
}) => {
  const [defaultTemplate, setDefaultTemplate] = useState<DialogueTemplate>('plain');
  const [pageOverrides, setPageOverrides] = useState<Record<number, DialogueTemplate>>({});

  const nonEmptyPages = pages.filter((p) => !p.isEmpty);

  const getTemplateForPage = useCallback(
    (pageIndex: number): DialogueTemplate => {
      return pageOverrides[pageIndex] ?? defaultTemplate;
    },
    [pageOverrides, defaultTemplate],
  );

  const handlePageOverride = useCallback((pageIndex: number, template: DialogueTemplate) => {
    setPageOverrides((prev) => ({ ...prev, [pageIndex]: template }));
  }, []);

  const handlePlaceSingle = useCallback(
    (pageIndex: number) => {
      const template = getTemplateForPage(pageIndex);
      postToPlugin({
        type: 'PLACE_DIALOGUE',
        pageIndex,
        template,
      });
    },
    [getTemplateForPage],
  );

  const handlePlaceAll = useCallback(() => {
    nonEmptyPages.forEach((page) => {
      const template = getTemplateForPage(page.pageIndex);
      postToPlugin({
        type: 'PLACE_DIALOGUE',
        pageIndex: page.pageIndex,
        template,
      });
    });
  }, [nonEmptyPages, getTemplateForPage]);

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

  const templateRadioGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  };

  const templateOptionStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    fontSize: 11,
  };

  const previewBoxBase: React.CSSProperties = {
    width: 40,
    height: 20,
    borderRadius: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 8,
    color: '#666',
  };

  const getPreviewStyle = (template: DialogueTemplate): React.CSSProperties => {
    switch (template) {
      case 'plain':
        return { ...previewBoxBase, background: '#F5F5F5', border: '1px solid #E5E5E5' };
      case 'border-b':
        return { ...previewBoxBase, background: '#fff', border: `2px solid ${keyColorB}` };
      case 'border-a':
        return { ...previewBoxBase, background: '#fff', border: `2px solid ${keyColorA}` };
    }
  };

  const pageCardStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  };

  const pageHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  };

  const pageNumStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#666',
  };

  const textPreviewStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    marginBottom: 6,
  };

  const selectStyle: React.CSSProperties = {
    padding: '4px 6px',
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    fontSize: 11,
    outline: 'none',
    background: '#fff',
    cursor: 'pointer',
  };

  const btnOutlineStyle: React.CSSProperties = {
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: '#18A0FB',
    background: '#fff',
    border: '1px solid #18A0FB',
    borderRadius: 4,
    cursor: 'pointer',
  };

  const btnPrimaryStyle: React.CSSProperties = {
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

  const noteStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
    padding: '4px 0',
    fontStyle: 'italic',
  };

  const pageRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 9: 대사 배치</div>

      {/* Template selection (global default) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>기본 템플릿</div>
        <div style={templateRadioGroupStyle}>
          {TEMPLATE_OPTIONS.map((opt) => (
            <label key={opt.value} style={templateOptionStyle}>
              <input
                type="radio"
                name="default-template"
                checked={defaultTemplate === opt.value}
                onChange={() => setDefaultTemplate(opt.value)}
              />
              <div style={getPreviewStyle(opt.value)}>Aa</div>
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Page list */}
      <div style={{ maxHeight: 350, overflowY: 'auto' }}>
        {nonEmptyPages.map((page) => {
          const currentTemplate = getTemplateForPage(page.pageIndex);
          return (
            <div key={page.pageIndex} style={pageCardStyle}>
              <div style={pageHeaderStyle}>
                <span style={pageNumStyle}>Page {page.pageIndex + 1}</span>
              </div>
              <div style={textPreviewStyle}>{getPageTextPreview(page)}</div>

              <div style={pageRowStyle}>
                <select
                  style={selectStyle}
                  value={currentTemplate}
                  onChange={(e) =>
                    handlePageOverride(page.pageIndex, e.target.value as DialogueTemplate)
                  }
                >
                  <option value="">기본 사용</option>
                  {TEMPLATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  style={btnOutlineStyle}
                  onClick={() => handlePlaceSingle(page.pageIndex)}
                >
                  배치
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Place all */}
      <button
        type="button"
        style={{
          ...btnPrimaryStyle,
          ...(nonEmptyPages.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        }}
        onClick={handlePlaceAll}
        disabled={nonEmptyPages.length === 0}
      >
        전체 대사 배치
      </button>

      <div style={noteStyle}>디자이너가 최종 위치를 조정합니다</div>
    </div>
  );
};

export default DialoguePlacementPanel;
