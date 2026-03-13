import React, { useState } from 'react';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onOpenLog: () => void;
}

function SettingsDrawer({
  isOpen,
  onClose,
  apiKey,
  onApiKeyChange,
  onOpenLog,
}: SettingsDrawerProps) {
  const [showKey, setShowKey] = useState(false);

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 9998,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 280,
          backgroundColor: '#ffffff',
          boxShadow: '-2px 0 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid #e0e0e0',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>설정</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
              color: '#666',
            }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {/* --- API Key section --- */}
          <section style={{ marginBottom: 24 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#444',
                marginBottom: 6,
              }}
            >
              Gemini API Key
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="API 키를 입력하세요"
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: 12,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  outline: 'none',
                }}
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  borderRadius: 4,
                  border: '1px solid #ccc',
                  background: '#fafafa',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {showKey ? '숨기기' : '표시'}
              </button>
            </div>
          </section>

          {/* --- Log section --- */}
          <section style={{ marginBottom: 24 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#444',
                marginBottom: 6,
              }}
            >
              로그
            </label>
            <button
              onClick={onOpenLog}
              style={{
                width: '100%',
                padding: '8px 0',
                fontSize: 12,
                borderRadius: 4,
                border: '1px solid #ccc',
                background: '#fafafa',
                cursor: 'pointer',
              }}
            >
              활동 로그 보기
            </button>
          </section>

          {/* --- Info section --- */}
          <section>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#444',
                marginBottom: 6,
              }}
            >
              정보
            </label>
            <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7 }}>
              <div>Pronounce Korean Storybook Editor v1.0</div>
              <div style={{ color: '#888' }}>
                문의: 슬랙 또는 GitHub Issues
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export default SettingsDrawer;
