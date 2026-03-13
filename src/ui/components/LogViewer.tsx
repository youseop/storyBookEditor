import React, { useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Module-level log storage
// ---------------------------------------------------------------------------

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  step?: number;
  message: string;
}

const logs: LogEntry[] = [];
let listeners: Array<() => void> = [];

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

/**
 * Append a log entry. Can be called from anywhere that imports this module.
 */
export function addLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  step?: number,
): void {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  logs.push({ timestamp: `${hh}:${mm}:${ss}`, level, step, message });
  notifyListeners();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LogViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  info: '#333333',
  warn: '#B8860B',
  error: '#D32F2F',
};

function LogViewer({ isOpen, onClose }: LogViewerProps) {
  const [, setTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Subscribe to log changes so the component re-renders on new entries.
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  // Listen for ERROR messages coming from the sandbox.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data?.pluginMessage;
      if (!msg) return;
      if (msg.type === 'ERROR') {
        addLog('error', msg.message ?? 'Unknown error', msg.step);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Auto-scroll to bottom when new logs arrive.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs.length]);

  if (!isOpen) return null;

  const handleCopy = () => {
    const text = logs
      .map((e) => {
        const stepLabel = e.step != null ? ` [Step ${e.step}]` : '';
        return `[${e.timestamp}] [${e.level.toUpperCase()}]${stepLabel} ${e.message}`;
      })
      .join('\n');
    navigator.clipboard.writeText(text).catch(() => {
      /* clipboard may be unavailable in plugin context */
    });
  };

  const handleClear = () => {
    logs.length = 0;
    notifyListeners();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 8,
          width: 480,
          maxWidth: '90%',
          boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #e0e0e0',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>Activity Log</span>
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

        {/* Log list */}
        <div
          ref={listRef}
          style={{
            maxHeight: 400,
            overflowY: 'auto',
            padding: '8px 16px',
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {logs.length === 0 && (
            <div style={{ color: '#999', textAlign: 'center', padding: 24 }}>
              로그가 없습니다.
            </div>
          )}
          {logs.map((entry, idx) => {
            const stepLabel = entry.step != null ? ` [Step ${entry.step}]` : '';
            return (
              <div key={idx} style={{ color: LEVEL_COLORS[entry.level] }}>
                [{entry.timestamp}] [{entry.level.toUpperCase()}]
                {stepLabel} {entry.message}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '8px 16px',
            borderTop: '1px solid #e0e0e0',
          }}
        >
          <button
            onClick={handleCopy}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid #ccc',
              background: '#fafafa',
              cursor: 'pointer',
            }}
          >
            복사
          </button>
          <button
            onClick={handleClear}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid #ccc',
              background: '#fafafa',
              cursor: 'pointer',
            }}
          >
            지우기
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogViewer;
