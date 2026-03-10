import React, { useState } from 'react';
import type { PluginSettings } from '../../shared/messageTypes';
import { postToPlugin } from '../hooks/useFigmaMessages';

interface SettingsPanelProps {
  settings: PluginSettings;
  onChange: (settings: PluginSettings) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onChange }) => {
  const [showApiKey, setShowApiKey] = useState(false);

  const update = <K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div>
      {/* API Key */}
      <div className="form-group">
        <label>API Key</label>
        <div className="password-wrapper">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={settings.apiKey}
            onChange={(e) => update('apiKey', e.target.value)}
            placeholder="Enter your API key"
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowApiKey(!showApiKey)}
          >
            {showApiKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Background Color */}
      <div className="form-group">
        <label>Background Color</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="color"
            value={settings.bgColor}
            onChange={(e) => update('bgColor', e.target.value)}
            style={{ width: 48, flexShrink: 0 }}
          />
          <input
            type="text"
            value={settings.bgColor}
            onChange={(e) => update('bgColor', e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
      </div>

      {/* Font Family */}
      <div className="form-group">
        <label>Font Family</label>
        <input
          type="text"
          value={settings.fontFamily}
          onChange={(e) => update('fontFamily', e.target.value)}
          placeholder="Leave empty for default"
        />
      </div>

      {/* Font Size */}
      <div className="form-group">
        <label>Font Size</label>
        <input
          type="number"
          value={settings.fontSize}
          onChange={(e) => update('fontSize', parseInt(e.target.value, 10) || 0)}
          min={8}
          max={200}
        />
      </div>

      {/* Reference Frame Name */}
      <div className="form-group">
        <label>Reference Frame Name</label>
        <input
          type="text"
          value={settings.refFrameName}
          onChange={(e) => update('refFrameName', e.target.value)}
          placeholder="Frame name for style reference"
        />
      </div>

      {/* Utilities */}
      <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-light)' }}>
          Utilities
        </label>
        <button
          className="btn"
          style={{ width: '100%' }}
          onClick={() => postToPlugin({ type: 'CLEANUP_TEMP' })}
        >
          Remove Temp Guidelines
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;
