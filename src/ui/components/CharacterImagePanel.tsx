import React, { useState, useCallback } from 'react';
import type { Character, KeyObject } from '../../shared/pipeline';
import { usePipelineImages, type GeneratedImage } from '../hooks/usePipelineImages';
import { postToPlugin } from '../hooks/useFigmaMessages';
import ImageStrip from './ImageStrip';
import ImageHoverPreview from './ImageHoverPreview';

interface CharacterImagePanelProps {
  characters: Character[];
  onCharacterImageSelect: (characterId: string, imageBase64: string) => void;
  onCharactersChange?: (characters: Character[]) => void;
  keyObjects: KeyObject[];
  onKeyObjectImageSelect: (objectId: string, imageBase64: string) => void;
  styleDescription: string;
  referenceImageBase64?: string;
  apiKey: string;
}

const CharacterImagePanel: React.FC<CharacterImagePanelProps> = ({
  characters,
  onCharacterImageSelect,
  onCharactersChange,
  keyObjects,
  onKeyObjectImageSelect,
  styleDescription,
  referenceImageBase64,
  apiKey,
}) => {
  // Per-character image list (append-only, newest first)
  const [charImages, setCharImages] = useState<Record<string, GeneratedImage[]>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>({});
  // Per-key-object image list
  const [objectImages, setObjectImages] = useState<Record<string, GeneratedImage[]>>({});
  const [selectedObjectIds, setSelectedObjectIds] = useState<Record<string, string>>({});
  // Per-character editable fields for re-generation
  const [editedChars, setEditedChars] = useState<Record<string, { name: string; appearance: string }>>({});
  const [error, setError] = useState<string | null>(null);
  // Hover preview
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const { isGenerating, progress, generateCharacterImages, cancel } = usePipelineImages();

  // Get editable character data (local edits override original)
  const getCharData = (char: Character) => {
    const edited = editedChars[char.id];
    return {
      name: edited?.name ?? char.name,
      appearance: edited?.appearance ?? char.appearance,
    };
  };

  // Stream callback: prepend image, auto-select first
  const makeImageReadyHandler = (charId: string) => (img: GeneratedImage) => {
    setCharImages(prev => ({
      ...prev,
      [charId]: [img, ...(prev[charId] || [])],
    }));
    // Save to gallery
    const charName = characters.find(c => c.id === charId)?.name || 'Unknown';
    const bytes = Uint8Array.from(atob(img.base64), c => c.charCodeAt(0));
    postToPlugin({
      type: 'SAVE_TO_GALLERY',
      category: 'character',
      imageId: img.id,
      imageBytes: Array.from(bytes),
      label: charName,
      metadata: charId,
    });
    // Auto-select first image for this character
    setSelectedIds(prev => {
      if (!prev[charId]) {
        onCharacterImageSelect(charId, img.base64);
        return { ...prev, [charId]: img.id };
      }
      return prev;
    });
  };

  // Generate 4 images for ALL characters in parallel
  const handleGenerateAll = useCallback(async () => {
    if (!apiKey) { setError('API Key가 설정되지 않았습니다.'); return; }
    if (!styleDescription.trim()) { setError('스타일 설명이 필요합니다.'); return; }
    setError(null);

    // Fire off all characters in parallel
    const promises = characters.map(char => {
      const data = getCharData(char);
      return generateCharacterImages(apiKey, data, styleDescription, 4, makeImageReadyHandler(char.id), referenceImageBase64);
    });
    await Promise.allSettled(promises);
  }, [apiKey, styleDescription, characters, generateCharacterImages, editedChars, referenceImageBase64]);

  // Generate 2 more images for a single character
  const handleGenerateMore = useCallback(async (charId: string) => {
    if (!apiKey) return;
    setError(null);
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const data = getCharData(char);
    await generateCharacterImages(apiKey, data, styleDescription, 2, makeImageReadyHandler(charId), referenceImageBase64);
  }, [apiKey, styleDescription, characters, generateCharacterImages, editedChars, referenceImageBase64]);

  const handleSelectImage = useCallback((charId: string, imageId: string) => {
    setSelectedIds(prev => ({ ...prev, [charId]: imageId }));
    const images = charImages[charId];
    const img = images?.find(i => i.id === imageId);
    if (img) onCharacterImageSelect(charId, img.base64);
  }, [charImages, onCharacterImageSelect]);

  // --- Key Object Image Generation ---
  const makeObjectImageReadyHandler = (objId: string) => (img: GeneratedImage) => {
    setObjectImages(prev => ({
      ...prev,
      [objId]: [img, ...(prev[objId] || [])],
    }));
    // Save to gallery
    const objName = keyObjects.find(o => o.id === objId)?.name || 'Unknown';
    const bytes = Uint8Array.from(atob(img.base64), c => c.charCodeAt(0));
    postToPlugin({
      type: 'SAVE_TO_GALLERY',
      category: 'character',
      imageId: img.id,
      imageBytes: Array.from(bytes),
      label: `[Obj] ${objName}`,
      metadata: objId,
    });
    // Auto-select first image for this object
    setSelectedObjectIds(prev => {
      if (!prev[objId]) {
        onKeyObjectImageSelect(objId, img.base64);
        return { ...prev, [objId]: img.id };
      }
      return prev;
    });
  };

  // Generate 2 images for ALL key objects in parallel
  const handleGenerateAllObjects = useCallback(async () => {
    if (!apiKey) { setError('API Key가 설정되지 않았습니다.'); return; }
    if (!styleDescription.trim()) { setError('스타일 설명이 필요합니다.'); return; }
    setError(null);

    const styleDesc = styleDescription;
    const promises = keyObjects.map(obj => {
      const prompt = `레퍼런스 이미지의 그림 스타일을 그대로 따라서 그려줘. ${obj.category === 'space' ? '장소' : '사물'}: ${obj.name}. 외형: ${obj.description}. 스타일: ${styleDesc}. 깨끗한 흰색 배경. 텍스트 없이 그려줘.`;
      const charData = { name: obj.name, appearance: prompt };
      return generateCharacterImages(apiKey, charData, styleDesc, 2, makeObjectImageReadyHandler(obj.id), referenceImageBase64);
    });
    await Promise.allSettled(promises);
  }, [apiKey, styleDescription, keyObjects, generateCharacterImages, referenceImageBase64]);

  // Generate 2 more images for a single key object
  const handleGenerateMoreObject = useCallback(async (objId: string) => {
    if (!apiKey) return;
    setError(null);
    const obj = keyObjects.find(o => o.id === objId);
    if (!obj) return;
    const styleDesc = styleDescription;
    const prompt = `레퍼런스 이미지의 그림 스타일을 그대로 따라서 그려줘. ${obj.category === 'space' ? '장소' : '사물'}: ${obj.name}. 외형: ${obj.description}. 스타일: ${styleDesc}. 깨끗한 흰색 배경. 텍스트 없이 그려줘.`;
    const charData = { name: obj.name, appearance: prompt };
    await generateCharacterImages(apiKey, charData, styleDesc, 2, makeObjectImageReadyHandler(objId), referenceImageBase64);
  }, [apiKey, styleDescription, keyObjects, generateCharacterImages, referenceImageBase64]);

  const handleSelectObjectImage = useCallback((objId: string, imageId: string) => {
    setSelectedObjectIds(prev => ({ ...prev, [objId]: imageId }));
    const images = objectImages[objId];
    const img = images?.find(i => i.id === imageId);
    if (img) onKeyObjectImageSelect(objId, img.base64);
  }, [objectImages, onKeyObjectImageSelect]);

  // Edit character fields (auto-propagate to parent)
  const handleEditChar = useCallback((charId: string, field: 'name' | 'appearance', value: string) => {
    setEditedChars(prev => ({
      ...prev,
      [charId]: { ...(prev[charId] || { name: '', appearance: '' }), [field]: value },
    }));
    // Auto-save to parent
    if (onCharactersChange) {
      const updated = characters.map(c => {
        if (c.id === charId) {
          return { ...c, [field]: value };
        }
        return c;
      });
      onCharactersChange(updated);
      postToPlugin({ type: 'SAVE_CHARACTERS', characters: updated });
    }
  }, [characters, onCharactersChange]);

  const handleHoverImage = useCallback((base64: string | null, event: React.MouseEvent | null) => {
    setHoverImage(base64);
    if (event) setHoverPos({ x: event.clientX, y: event.clientY });
  }, []);

  const s = {
    container: { display: 'flex', flexDirection: 'column' as const, gap: 12, padding: 12, fontSize: 12, color: '#333' },
    header: { fontSize: 13, fontWeight: 700 as const, marginBottom: 4 },
    section: { border: '1px solid #E5E5E5', borderRadius: 6, padding: 10 },
    sectionTitle: { fontSize: 11, fontWeight: 600 as const, color: '#666', marginBottom: 8 },
    btnPrimary: { padding: '6px 12px', fontSize: 11, fontWeight: 600 as const, color: '#fff', background: '#18A0FB', border: 'none', borderRadius: 4, cursor: 'pointer', width: '100%' },
    btnOutline: { padding: '4px 10px', fontSize: 10, fontWeight: 600 as const, color: '#18A0FB', background: '#fff', border: '1px solid #18A0FB', borderRadius: 4, cursor: 'pointer' },
    disabled: { opacity: 0.5, cursor: 'not-allowed' as const },
    error: { fontSize: 11, color: '#E53E3E', padding: '4px 0' },
    input: { width: '100%', padding: '4px 8px', border: '1px solid #E5E5E5', borderRadius: 4, fontSize: 11, boxSizing: 'border-box' as const },
    charCard: { border: '1px solid #E5E5E5', borderRadius: 6, padding: 10, marginBottom: 8 },
    charName: { fontSize: 12, fontWeight: 600 as const, color: '#333', marginBottom: 4 },
  };

  return (
    <div style={s.container}>
      <div style={s.header}>Step 4: 등장인물 이미지 생성</div>

      {/* Generate all button */}
      <button
        type="button"
        style={{ ...s.btnPrimary, ...(isGenerating || !apiKey || characters.length === 0 ? s.disabled : {}) }}
        onClick={handleGenerateAll}
        disabled={isGenerating || !apiKey || characters.length === 0}
      >
        {isGenerating ? `생성 중... (${progress.current}/${progress.total})` : `전체 인물 이미지 생성 (${characters.length}명 × 4장)`}
      </button>

      {isGenerating && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1, height: 4, background: '#F0F0F0', borderRadius: 2, overflow: 'hidden', marginRight: 8 }}>
            <div style={{ height: '100%', background: '#18A0FB', borderRadius: 2, transition: 'width 0.3s', width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }} />
          </div>
          <button type="button" onClick={cancel} style={{ fontSize: 10, color: '#E53E3E', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
        </div>
      )}

      {(error || false) && <div style={s.error}>{error}</div>}

      {/* Per-character cards */}
      {characters.map(char => {
        const data = getCharData(char);
        const images = charImages[char.id] || [];
        const selectedId = selectedIds[char.id];

        return (
          <div key={char.id} style={s.charCard}>
            <div style={s.charName}>{data.name || '(이름 없음)'}</div>

            {/* Editable character info */}
            <div style={{ marginBottom: 6 }}>
              <input
                type="text"
                value={data.name}
                onChange={(e) => handleEditChar(char.id, 'name', e.target.value)}
                placeholder="이름"
                style={{ ...s.input, marginBottom: 4, fontWeight: 600 }}
              />
              <input
                type="text"
                value={data.appearance}
                onChange={(e) => handleEditChar(char.id, 'appearance', e.target.value)}
                placeholder="외형 설명"
                style={s.input}
              />
            </div>

            {/* Image strip (horizontal scroll, newest first) */}
            {images.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <ImageStrip
                  images={images}
                  selectedId={selectedId}
                  onSelect={(id) => handleSelectImage(char.id, id)}
                  imageSize={68}
                  onHoverImage={handleHoverImage}
                />
                <div style={{ fontSize: 9, color: '#999', marginTop: 2 }}>{images.length}장 생성됨</div>
              </div>
            )}

            {/* Add 2 more button */}
            {!isGenerating && (
              <button
                type="button"
                style={{ ...s.btnOutline, ...((!apiKey) ? s.disabled : {}) }}
                onClick={() => handleGenerateMore(char.id)}
                disabled={!apiKey}
              >
                +2장 추가 생성
              </button>
            )}
          </div>
        );
      })}

      {characters.length === 0 && (
        <div style={{ textAlign: 'center', color: '#AAA', padding: 20, fontSize: 11 }}>
          Step 3에서 등장인물을 먼저 설정해주세요
        </div>
      )}

      {/* Key Objects Image Section */}
      {keyObjects.length > 0 && (
        <>
          <div style={{ ...s.header, marginTop: 8 }}>핵심 사물/공간 이미지</div>

          {/* Generate all key object images button */}
          <button
            type="button"
            style={{ ...s.btnPrimary, background: '#8B5CF6', ...(isGenerating || !apiKey || keyObjects.length === 0 ? s.disabled : {}) }}
            onClick={handleGenerateAllObjects}
            disabled={isGenerating || !apiKey || keyObjects.length === 0}
          >
            {isGenerating ? `생성 중...` : `전체 사물/공간 이미지 생성 (${keyObjects.length}개 × 2장)`}
          </button>

          {/* Per-key-object cards */}
          {keyObjects.map(obj => {
            const images = objectImages[obj.id] || [];
            const selectedId = selectedObjectIds[obj.id];

            return (
              <div key={obj.id} style={s.charCard}>
                <div style={s.charName}>{obj.name || '(이름 없음)'}</div>
                <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>
                  [{obj.category === 'space' ? '공간' : '사물'}] {obj.description}
                </div>

                {/* Image strip */}
                {images.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <ImageStrip
                      images={images}
                      selectedId={selectedId}
                      onSelect={(id) => handleSelectObjectImage(obj.id, id)}
                      imageSize={68}
                      onHoverImage={handleHoverImage}
                    />
                    <div style={{ fontSize: 9, color: '#999', marginTop: 2 }}>{images.length}장 생성됨</div>
                  </div>
                )}

                {/* Add 2 more button */}
                {!isGenerating && (
                  <button
                    type="button"
                    style={{ ...s.btnOutline, borderColor: '#8B5CF6', color: '#8B5CF6', ...((!apiKey) ? s.disabled : {}) }}
                    onClick={() => handleGenerateMoreObject(obj.id)}
                    disabled={!apiKey}
                  >
                    +2장 추가 생성
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}

      <ImageHoverPreview imageBase64={hoverImage} mouseX={hoverPos.x} mouseY={hoverPos.y} />
    </div>
  );
};

export default CharacterImagePanel;
