import React, { useState, useCallback, useEffect, useRef } from 'react';
import { postToPlugin } from '../hooks/useFigmaMessages';
import { callGemini, extractJson } from '../utils/geminiApi';
import type { Character, KeyObject } from '../../shared/pipeline';

interface CharacterPanelProps {
  storyText: string;
  characters: Character[];
  onCharactersChange: (characters: Character[]) => void;
  keyObjects: KeyObject[];
  onKeyObjectsChange: (keyObjects: KeyObject[]) => void;
  apiKey: string;
}

const CharacterPanel: React.FC<CharacterPanelProps> = ({
  storyText,
  characters,
  onCharactersChange,
  keyObjects,
  onKeyObjectsChange,
  apiKey,
}) => {
  const [localCharacters, setLocalCharacters] = useState<Character[]>(characters);
  const [localKeyObjects, setLocalKeyObjects] = useState<KeyObject[]>(keyObjects);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isInitialMount = useRef(true);
  const isInitialMountObjects = useRef(true);

  useEffect(() => {
    isInitialMount.current = true;
    setLocalCharacters(characters);
  }, [characters]);

  useEffect(() => {
    isInitialMountObjects.current = true;
    setLocalKeyObjects(keyObjects);
  }, [keyObjects]);

  // Auto-save with debounce (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (localCharacters.length === 0) return;

    const timer = setTimeout(() => {
      onCharactersChange(localCharacters);
      postToPlugin({
        type: 'SAVE_CHARACTERS',
        characters: localCharacters,
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [localCharacters, onCharactersChange]);

  // Auto-save key objects with debounce (skip initial mount)
  useEffect(() => {
    if (isInitialMountObjects.current) {
      isInitialMountObjects.current = false;
      return;
    }

    const timer = setTimeout(() => {
      onKeyObjectsChange(localKeyObjects);
    }, 500);

    return () => clearTimeout(timer);
  }, [localKeyObjects, onKeyObjectsChange]);

  const handleAnalyze = useCallback(async () => {
    if (!storyText.trim()) {
      setError('이야기 텍스트가 없습니다. Step 1에서 입력해주세요.');
      return;
    }
    if (!apiKey) {
      setError('API Key가 설정되지 않았습니다.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const prompt = `다음 동화에서 등장하는 인물과 핵심 사물/공간을 분석해주세요.

JSON으로 응답해주세요:
{
  "characters": [{"name": string, "personality": string, "appearance": string}],
  "keyObjects": [{"name": string, "description": string, "category": "object" | "space"}]
}

인물의 외형이 명시되지 않은 경우 이야기 분위기에 맞게 적절히 제안해주세요.
사물/공간은 이야기에서 반복 등장하거나 중요한 역할을 하는 것만 포함하세요.

동화:
${storyText}`;

      const result = await callGemini(apiKey, prompt, 'gemini-2.5-flash');

      if (!result) {
        throw new Error('AI 응답에서 텍스트를 찾을 수 없습니다.');
      }

      const parsed = JSON.parse(extractJson(result));
      // Handle both new { characters, keyObjects } format and old Character[] array format
      const charArray = Array.isArray(parsed) ? parsed : parsed.characters || [];
      const objArray = Array.isArray(parsed) ? [] : parsed.keyObjects || [];

      const newCharacters: Character[] = charArray.map((c: any) => {
        // Preserve existing character data (referenceImageBase64, confirmed) if name matches
        const existing = localCharacters.find(
          (ec) => ec.name.toLowerCase() === (c.name || '').toLowerCase()
        );
        return {
          id: existing?.id || (Date.now().toString() + Math.random().toString(36).slice(2, 8)),
          name: c.name || '',
          personality: c.personality || '',
          appearance: c.appearance || '',
          referenceImageBase64: existing?.referenceImageBase64,
          confirmed: existing?.confirmed || false,
        };
      });

      const newKeyObjects: KeyObject[] = objArray.map((o: any) => {
        const existing = localKeyObjects.find(
          (eo) => eo.name.toLowerCase() === (o.name || '').toLowerCase()
        );
        return {
          id: existing?.id || (Date.now().toString() + Math.random().toString(36).slice(2, 8)),
          name: o.name || '',
          description: o.description || '',
          category: o.category === 'space' ? 'space' : 'object',
          referenceImageBase64: existing?.referenceImageBase64,
          confirmed: existing?.confirmed || false,
        };
      });

      setLocalCharacters(newCharacters);
      setLocalKeyObjects(newKeyObjects);
    } catch (err: any) {
      setError(err.message || '인물 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [storyText, apiKey]);

  const handleUpdateCharacter = useCallback((id: string, field: keyof Character, value: string) => {
    setLocalCharacters(prev =>
      prev.map(c => c.id === id ? { ...c, [field]: value } : c)
    );
  }, []);

  const handleDeleteCharacter = useCallback((id: string) => {
    setLocalCharacters(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleAddCharacter = useCallback(() => {
    const newChar: Character = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
      name: '',
      personality: '',
      appearance: '',
      confirmed: false,
    };
    setLocalCharacters(prev => [...prev, newChar]);
  }, []);

  const handleSave = useCallback(() => {
    onCharactersChange(localCharacters);
    postToPlugin({
      type: 'SAVE_CHARACTERS',
      characters: localCharacters,
    });
    onKeyObjectsChange(localKeyObjects);
  }, [localCharacters, onCharactersChange, localKeyObjects, onKeyObjectsChange]);

  // Key objects handlers
  const handleUpdateKeyObject = useCallback((id: string, field: keyof KeyObject, value: string) => {
    setLocalKeyObjects(prev =>
      prev.map(o => o.id === id ? { ...o, [field]: value } : o)
    );
  }, []);

  const handleDeleteKeyObject = useCallback((id: string) => {
    setLocalKeyObjects(prev => prev.filter(o => o.id !== id));
  }, []);

  const handleAddKeyObject = useCallback(() => {
    const newObj: KeyObject = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
      name: '',
      description: '',
      category: 'object',
      confirmed: false,
    };
    setLocalKeyObjects(prev => [...prev, newObj]);
  }, []);

  // --- Inline Styles ---

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

  const outlineBtnStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: '#18A0FB',
    background: '#fff',
    border: '1px solid #18A0FB',
    borderRadius: 4,
    cursor: 'pointer',
    width: '100%',
  };

  const primaryBtnStyle: React.CSSProperties = {
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

  const disabledBtnStyle: React.CSSProperties = {
    opacity: 0.5,
    cursor: 'not-allowed',
  };

  const charCardStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    position: 'relative',
  };

  const charHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    fontSize: 12,
    color: '#333',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const smallTextareaStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    fontSize: 11,
    lineHeight: 1.4,
    color: '#333',
    boxSizing: 'border-box',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  };

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#999',
    marginBottom: 2,
    marginTop: 6,
  };

  const deleteBtnStyle: React.CSSProperties = {
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #E5E5E5',
    borderRadius: 4,
    background: '#fff',
    color: '#999',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    flexShrink: 0,
  };

  const addBtnStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: '#666',
    background: '#FAFAFA',
    border: '1px dashed #CCC',
    borderRadius: 4,
    cursor: 'pointer',
    width: '100%',
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#E53E3E',
    padding: '4px 0',
  };

  const emptyStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#AAA',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '16px 0',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Step 3: 등장인물 설정</div>

      {/* AI Analysis button */}
      <button
        type="button"
        style={{
          ...outlineBtnStyle,
          ...(isAnalyzing || !storyText.trim() ? disabledBtnStyle : {}),
        }}
        onClick={handleAnalyze}
        disabled={isAnalyzing || !storyText.trim()}
      >
        {isAnalyzing ? '분석 중...' : 'AI 분석'}
      </button>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Character list */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>인물 목록 ({localCharacters.length}명)</div>

        {localCharacters.length === 0 && (
          <div style={emptyStyle}>AI 분석 또는 수동 추가로 인물을 등록하세요.</div>
        )}

        {localCharacters.map((char) => (
          <div key={char.id} style={charCardStyle}>
            <div style={charHeaderStyle}>
              <input
                type="text"
                value={char.name}
                onChange={(e) => handleUpdateCharacter(char.id, 'name', e.target.value)}
                style={{ ...inputStyle, fontWeight: 600, flex: 1, marginRight: 8 }}
                placeholder="이름"
              />
              <button
                type="button"
                style={deleteBtnStyle}
                onClick={() => handleDeleteCharacter(char.id)}
                title="삭제"
              >
                x
              </button>
            </div>

            <div style={fieldLabelStyle}>성격</div>
            <textarea
              rows={2}
              value={char.personality}
              onChange={(e) => handleUpdateCharacter(char.id, 'personality', e.target.value)}
              style={smallTextareaStyle}
              placeholder="성격 설명..."
            />

            <div style={fieldLabelStyle}>외형</div>
            <textarea
              rows={2}
              value={char.appearance}
              onChange={(e) => handleUpdateCharacter(char.id, 'appearance', e.target.value)}
              style={smallTextareaStyle}
              placeholder="외형 설명..."
            />
          </div>
        ))}

        <button
          type="button"
          style={addBtnStyle}
          onClick={handleAddCharacter}
        >
          + 인물 추가
        </button>
      </div>

      {/* Key Objects list */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>핵심 사물/공간 ({localKeyObjects.length}개)</div>

        {localKeyObjects.length === 0 && (
          <div style={emptyStyle}>AI 분석 또는 수동 추가로 사물/공간을 등록하세요.</div>
        )}

        {localKeyObjects.map((obj) => (
          <div key={obj.id} style={charCardStyle}>
            <div style={charHeaderStyle}>
              <input
                type="text"
                value={obj.name}
                onChange={(e) => handleUpdateKeyObject(obj.id, 'name', e.target.value)}
                style={{ ...inputStyle, fontWeight: 600, flex: 1, marginRight: 8 }}
                placeholder="이름"
              />
              <select
                value={obj.category}
                onChange={(e) => handleUpdateKeyObject(obj.id, 'category', e.target.value)}
                style={{ ...inputStyle, width: 70, flex: 'none', marginRight: 8, fontSize: 11 }}
              >
                <option value="object">사물</option>
                <option value="space">공간</option>
              </select>
              <button
                type="button"
                style={deleteBtnStyle}
                onClick={() => handleDeleteKeyObject(obj.id)}
                title="삭제"
              >
                x
              </button>
            </div>

            <div style={fieldLabelStyle}>외형 설명</div>
            <textarea
              rows={2}
              value={obj.description}
              onChange={(e) => handleUpdateKeyObject(obj.id, 'description', e.target.value)}
              style={smallTextareaStyle}
              placeholder="외형/모습 설명..."
            />
          </div>
        ))}

        <button
          type="button"
          style={addBtnStyle}
          onClick={handleAddKeyObject}
        >
          + 사물/공간 추가
        </button>
      </div>

      {/* Save button */}
      <button
        type="button"
        style={{
          ...primaryBtnStyle,
          ...(localCharacters.length === 0 ? disabledBtnStyle : {}),
        }}
        onClick={handleSave}
        disabled={localCharacters.length === 0}
      >
        저장
      </button>
    </div>
  );
};

export default CharacterPanel;
