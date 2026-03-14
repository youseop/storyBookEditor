import React, { useState, useCallback } from 'react';
import { postToPlugin, usePluginMessage } from '../hooks/useFigmaMessages';
import type { StoryPage } from '../../shared/pipeline';

interface ImagePlacementPanelProps {
  pages: StoryPage[];
  onImageRegenerate: (pageIndex: number, prompt: string, bgType: 'white' | 'full') => void;
}

const ImagePlacementPanel: React.FC<ImagePlacementPanelProps> = ({
  pages,
}) => {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  usePluginMessage(useCallback((msg) => {
    if (msg.type === 'IMAGE_PLACEMENT_SAVED') {
      setSaved(true);
      setSaving(false);
    }
  }, []));

  const handleSavePlacement = useCallback(() => {
    setSaving(true);
    setSaved(false);
    postToPlugin({
      type: 'SAVE_IMAGE_PLACEMENT',
      pageIndices: pages.filter(p => !p.isEmpty).map(p => p.pageIndex),
    });
  }, [pages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 12, fontSize: 12, color: '#333' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Step 8: 이미지 배치</div>

      <div style={{ padding: 16, background: '#F8F9FA', borderRadius: 8, lineHeight: 1.8, fontSize: 12, color: '#555' }}>
        <p style={{ margin: 0 }}>
          이미지 배치를 점검하고 수정이 필요한 경우 Figma에서 직접 수정해주세요.
        </p>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 11, color: '#777' }}>
          <li>각 페이지의 이미지 크기와 위치를 확인하세요</li>
          <li>Figma에서 드래그하여 이미지를 이동하거나 크기를 조정할 수 있습니다</li>
          <li>수정이 완료되면 아래 버튼으로 현재 배치를 저장하세요</li>
        </ul>
      </div>

      <button
        type="button"
        onClick={handleSavePlacement}
        disabled={saving}
        style={{
          padding: '12px 16px',
          fontSize: 13,
          fontWeight: 700,
          color: '#fff',
          background: saving ? '#AAA' : '#18A0FB',
          border: 'none',
          borderRadius: 6,
          cursor: saving ? 'not-allowed' : 'pointer',
          width: '100%',
        }}
      >
        {saving ? '저장 중...' : '현재 이미지 배치 저장'}
      </button>

      {saved && (
        <div style={{ textAlign: 'center', fontSize: 11, color: '#1BC47D', fontWeight: 600 }}>
          이미지 배치가 저장되었습니다
        </div>
      )}
    </div>
  );
};

export default ImagePlacementPanel;
