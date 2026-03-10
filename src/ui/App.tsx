import React, { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ExpressionCard,
  PluginSettings,
  CardPlacement,
  ImageMeta,
  SandboxToUIMessage,
} from '../shared/messageTypes';
import {
  DEFAULT_BG_COLOR,
  DEFAULT_FONT_SIZE,
  CARD_EN_PLACEHOLDER,
} from '../shared/constants';
import ExpressionInput from './components/ExpressionInput';
import SettingsPanel from './components/SettingsPanel';
import ImageGallery from './components/ImageGallery';
import GenerationProgress from './components/GenerationProgress';
import { usePluginMessage, postToPlugin } from './hooks/useFigmaMessages';
import { useGeminiApi } from './hooks/useGeminiApi';

type TabId = 'expressions' | 'settings' | 'images';

const defaultSettings: PluginSettings = {
  bgColor: DEFAULT_BG_COLOR,
  fontFamily: '',
  fontSize: DEFAULT_FONT_SIZE,
  apiKey: '',
  refFrameName: 'ref_img',
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('expressions');
  const [expressions, setExpressions] = useState('');
  const [settings, setSettings] = useState<PluginSettings>(defaultSettings);
  const [parsedCards, setParsedCards] = useState<ExpressionCard[]>([]);
  const [placements, setPlacements] = useState<CardPlacement[]>([]);
  const [isGeneratingLayout, setIsGeneratingLayout] = useState(false);
  const [refImageBase64, setRefImageBase64] = useState<string | undefined>();
  const [generatedImages, setGeneratedImages] = useState<Map<string, ImageMeta[]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // English translations map: cardId → enLines
  const [enLinesMap, setEnLinesMap] = useState<Map<string, string[]>>(new Map());

  // Figma-sourced card IDs: ensures parser uses IDs matching the canvas
  const [figmaCardIds, setFigmaCardIds] = useState<{ cardId: string; korean: string }[] | undefined>();

  // Gemini API hook
  const gemini = useGeminiApi();

  // Pending English texts from frame selection (applied after parsing)
  const pendingEnTextsRef = useRef<{ cardId: string; korean: string; en: string }[] | null>(null);

  // Load saved API key on startup
  useEffect(() => {
    postToPlugin({ type: 'LOAD_API_KEY' });
  }, []);

  // Save API key when it changes (skip empty on first load)
  const apiKeyRef = useRef(settings.apiKey);
  useEffect(() => {
    if (settings.apiKey && settings.apiKey !== apiKeyRef.current) {
      apiKeyRef.current = settings.apiKey;
      postToPlugin({ type: 'SAVE_API_KEY', apiKey: settings.apiKey });
    }
  }, [settings.apiKey]);

  // Apply pending enTextPairs from frame selection to enLinesMap
  // (Card ID sync is handled by the parser via figmaCardIds)
  useEffect(() => {
    if (pendingEnTextsRef.current && parsedCards.length > 0) {
      const pairs = pendingEnTextsRef.current;
      pendingEnTextsRef.current = null;

      // Build enLinesMap using Figma-sourced cardIds
      const newMap = new Map<string, string[]>();
      for (const pair of pairs) {
        if (pair.en && pair.en !== CARD_EN_PLACEHOLDER) {
          newMap.set(pair.cardId, [pair.en]);
        }
      }
      setEnLinesMap(newMap);
    }
  }, [parsedCards]);

  // Ref to track latest parsed cards and enLines for live updates
  const parsedCardsRef = useRef<ExpressionCard[]>([]);
  const enLinesMapRef = useRef<Map<string, string[]>>(new Map());
  useEffect(() => {
    parsedCardsRef.current = parsedCards;
  }, [parsedCards]);
  useEffect(() => {
    enLinesMapRef.current = enLinesMap;
  }, [enLinesMap]);

  // Merge enLines into cards before sending to plugin
  const mergeEnLines = useCallback((cards: ExpressionCard[]): ExpressionCard[] => {
    const map = enLinesMapRef.current;
    return cards.map(card => ({
      ...card,
      enLines: map.get(card.id),
    }));
  }, []);

  // Live update: debounced to prevent race conditions from rapid input
  const liveUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLiveUpdate = useCallback(() => {
    if (liveUpdateTimerRef.current) {
      clearTimeout(liveUpdateTimerRef.current);
    }
    liveUpdateTimerRef.current = setTimeout(() => {
      liveUpdateTimerRef.current = null;
      const cards = parsedCardsRef.current;
      if (cards.length === 0) return;
      postToPlugin({
        type: 'UPDATE_LAYOUT',
        expressions: mergeEnLines(cards),
        settings,
        frameId: activeFrameId || undefined,
      });
    }, 400);
  }, [settings, activeFrameId, mergeEnLines]);

  // Handle messages from the sandbox
  const handlePluginMessage = useCallback((msg: SandboxToUIMessage) => {
    switch (msg.type) {
      case 'LAYOUT_CREATED':
        setPlacements(msg.placements);
        setIsGeneratingLayout(false);
        setActiveFrameId(msg.frameId);
        // Update parsedCards with actual colSpan/rowSpan from sandbox measurement
        setParsedCards(prev => prev.map(card => {
          var placement = msg.placements.find(function(p) { return p.id === card.id; });
          if (placement) {
            return {
              ...card,
              colSpan: placement.colSpan,
              rowSpan: placement.rowSpan,
            };
          }
          return card;
        }));
        break;

      case 'REF_FRAME_EXPORTED':
        setRefImageBase64(msg.imageBase64);
        break;

      case 'IMAGE_STORED': {
        const isFirstVariant = msg.index === 0;
        const thumbBase64 = gemini.getImageBase64(msg.expressionId, msg.index);
        setGeneratedImages((prev) => {
          const next = new Map(prev);
          const existing = next.get(msg.expressionId) || [];
          const meta: ImageMeta = {
            expressionId: msg.expressionId,
            imageHash: msg.imageHash,
            prompt: '',
            isActive: isFirstVariant,
            index: msg.index,
            imageBase64: thumbBase64,
          };
          next.set(msg.expressionId, [...existing, meta]);
          return next;
        });
        // Auto-assign first variant to the card
        if (isFirstVariant) {
          postToPlugin({
            type: 'ASSIGN_IMAGE',
            expressionId: msg.expressionId,
            imageHash: msg.imageHash,
            frameId: activeFrameId || undefined,
          });
        }
        break;
      }

      case 'IMAGE_ASSIGNED':
        break;

      case 'API_KEY_LOADED':
        if (msg.apiKey) {
          setSettings(prev => ({ ...prev, apiKey: msg.apiKey }));
        }
        break;

      case 'REF_FRAME_CHECKED': {
        const cards = pendingRefCheckCardsRef.current;
        if (msg.matchCount === 1) {
          // Exactly one match — proceed to confirmation
          setPendingGenCards(cards);
        } else if (msg.matchCount === 0) {
          setRefFrameWarning({
            message: `"${msg.frameName}" 프레임을 찾을 수 없습니다. 레퍼런스 이미지 없이 진행할까요?`,
            cards,
          });
        } else {
          setRefFrameWarning({
            message: `"${msg.frameName}" 이름의 프레임이 ${msg.matchCount}개 있습니다. 첫 번째 매칭 프레임을 사용합니다. 진행할까요?`,
            cards,
          });
        }
        break;
      }

      case 'FRAME_SELECTED':
        setActiveFrameId(msg.frameId);
        setExpressions(msg.expressionText);
        setEnLinesMap(new Map());
        if (msg.enTextPairs && msg.enTextPairs.length > 0) {
          pendingEnTextsRef.current = msg.enTextPairs;
          // Pass Figma card IDs to the parser so it assigns matching IDs
          setFigmaCardIds(msg.enTextPairs.map(p => ({ cardId: p.cardId, korean: p.korean })));
        } else {
          pendingEnTextsRef.current = null;
          setFigmaCardIds(undefined);
        }
        setGeneratedImages(new Map());
        setPlacements([]);
        break;

      case 'NEW_PAGE_CREATED':
        setActiveFrameId(msg.frameId);
        setExpressions('');
        setGeneratedImages(new Map());
        setPlacements([]);
        setParsedCards([]);
        setEnLinesMap(new Map());
        setFigmaCardIds(undefined);
        break;

      case 'ERROR':
        setError(msg.message + (msg.detail ? `: ${msg.detail}` : ''));
        setIsGeneratingLayout(false);
        break;

      default:
        break;
    }
  }, [gemini, activeFrameId]);

  usePluginMessage(handlePluginMessage);

  const handleGenerateLayout = () => {
    if (parsedCards.length === 0) {
      setError('No expressions to generate. Enter some text first.');
      return;
    }
    setError(null);
    setIsGeneratingLayout(true);
    postToPlugin({
      type: 'GENERATE_LAYOUT',
      expressions: mergeEnLines(parsedCards),
      settings,
      frameId: activeFrameId || undefined,
    });
  };

  // Track refImageBase64 with a ref to avoid stale closures
  const refImageRef = useRef<string | undefined>();
  useEffect(() => {
    refImageRef.current = refImageBase64;
  }, [refImageBase64]);

  // State for confirmation dialog
  const [pendingGenCards, setPendingGenCards] = useState<ExpressionCard[] | null>(null);
  // State for ref frame warning
  const [refFrameWarning, setRefFrameWarning] = useState<{ message: string; cards: ExpressionCard[] } | null>(null);

  const handleGenerateImages = () => {
    if (parsedCards.length === 0) {
      setError('No expressions to generate images for.');
      return;
    }
    if (!settings.apiKey) {
      setError('API key is required to generate images. Set it in Settings.');
      return;
    }
    // Filter: only expressions that don't have images yet
    const cardsWithoutImages = parsedCards.filter(
      card => !generatedImages.has(card.id) || generatedImages.get(card.id)!.length === 0
    );
    if (cardsWithoutImages.length === 0) {
      setError('All expressions already have images generated.');
      return;
    }
    setError(null);

    // If ref frame name is set, validate it first
    if (settings.refFrameName) {
      pendingRefCheckCardsRef.current = cardsWithoutImages;
      postToPlugin({ type: 'CHECK_REF_FRAME', frameName: settings.refFrameName });
    } else {
      // No ref frame configured — go straight to confirmation
      setPendingGenCards(cardsWithoutImages);
    }
  };

  // Ref to hold cards while waiting for ref frame check response
  const pendingRefCheckCardsRef = useRef<ExpressionCard[]>([]);

  const confirmGenerateImages = async () => {
    if (!pendingGenCards) return;
    const cards = pendingGenCards;
    setPendingGenCards(null);

    // Export reference frame first if specified
    if (settings.refFrameName && !refImageRef.current) {
      postToPlugin({ type: 'EXPORT_REF_FRAME', frameName: settings.refFrameName });
      await new Promise<void>(resolve => {
        const checkInterval = setInterval(() => {
          if (refImageRef.current) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 200);
        setTimeout(() => { clearInterval(checkInterval); resolve(); }, 10000);
      });
    }

    gemini.generateAll(settings.apiKey, cards, refImageRef.current, activeFrameId || undefined);
  };

  const handleCancelGeneration = () => {
    gemini.cancel();
  };

  const handleTranslate = async () => {
    if (parsedCards.length === 0) {
      setError('No expressions to translate.');
      return;
    }
    if (!settings.apiKey) {
      setError('API key is required for translation. Set it in Settings.');
      return;
    }

    // Filter: only cards that need translation (no enLines, or placeholder)
    const cardsToTranslate = parsedCards.filter(card => {
      const en = enLinesMap.get(card.id);
      if (!en || en.length === 0) return true;
      // Skip if already has real English text (not the placeholder)
      return en.every(line => line === CARD_EN_PLACEHOLDER || line === '');
    });

    if (cardsToTranslate.length === 0) {
      setError('All cards already have English translations.');
      return;
    }

    setError(null);
    setIsTranslating(true);

    try {
      const translateInput = cardsToTranslate.map(card => ({
        id: card.id,
        koreanText: card.lines.join(' '),
      }));

      const translationMap = await gemini.translate(settings.apiKey, translateInput);

      // Merge translations into enLinesMap
      setEnLinesMap(prev => {
        const next = new Map(prev);
        translationMap.forEach((enLines, cardId) => {
          next.set(cardId, enLines);
        });
        return next;
      });

      // Trigger layout update with new translations
      const cards = parsedCardsRef.current;
      if (cards.length > 0) {
        // Build updatedMap from current ref merged with new translations
        const updatedMap = new Map(enLinesMapRef.current);
        translationMap.forEach((enLines, cardId) => {
          updatedMap.set(cardId, enLines);
        });
        const cardsWithEn = cards.map(card => ({
          ...card,
          enLines: updatedMap.get(card.id),
        }));
        postToPlugin({
          type: 'UPDATE_LAYOUT',
          expressions: cardsWithEn,
          settings,
          frameId: activeFrameId || undefined,
        });
      }
    } catch (err: any) {
      setError('Translation failed: ' + (err.message || String(err)));
    } finally {
      setIsTranslating(false);
    }
  };

  const handleNewPage = () => {
    setError(null);
    postToPlugin({
      type: 'NEW_PAGE',
      settings,
    });
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'expressions', label: 'Expressions' },
    { id: 'settings', label: 'Settings' },
    { id: 'images', label: 'Images' },
  ];

  return (
    <div className="container">
      {/* Tab Navigation */}
      <nav className="tab-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Error Banner */}
      {error && (
        <div className="error-banner" onClick={() => setError(null)} style={{ margin: '8px 16px 0' }}>
          {error}
        </div>
      )}

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'expressions' && (
          <ExpressionInput
            value={expressions}
            onChange={setExpressions}
            onParsed={setParsedCards}
            onTriggerUpdate={handleLiveUpdate}
            figmaCardIds={figmaCardIds}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
          />
        )}
        {activeTab === 'images' && (
          <ImageGallery
            generatedImages={generatedImages}
            parsedCards={parsedCards}
            onSwap={(expressionId, imageHash) => {
              postToPlugin({
                type: 'SWAP_IMAGE',
                expressionId,
                newImageHash: imageHash,
                frameId: activeFrameId || undefined,
              });
              // Update active state locally
              setGeneratedImages(prev => {
                const next = new Map(prev);
                const images = next.get(expressionId);
                if (images) {
                  next.set(expressionId, images.map(img => ({
                    ...img,
                    isActive: img.imageHash === imageHash,
                  })));
                }
                return next;
              });
            }}
            onRegen={async (expressionId, customPrompt) => {
              const card = parsedCards.find(c => c.id === expressionId);
              if (!card || !settings.apiKey) return;
              // Ensure reference image is available
              if (settings.refFrameName && !refImageRef.current) {
                postToPlugin({ type: 'EXPORT_REF_FRAME', frameName: settings.refFrameName });
                await new Promise<void>(resolve => {
                  const check = setInterval(() => {
                    if (refImageRef.current) { clearInterval(check); resolve(); }
                  }, 200);
                  setTimeout(() => { clearInterval(check); resolve(); }, 10000);
                });
              }
              const existingCount = generatedImages.get(expressionId)?.length || 0;
              gemini.generateSingle(settings.apiKey, card, customPrompt, refImageRef.current, existingCount, activeFrameId || undefined);
            }}
          />
        )}
      </div>

      {/* Generation Progress */}
      {gemini.isGenerating && (
        <GenerationProgress
          current={gemini.current}
          total={gemini.total}
          isGenerating={gemini.isGenerating}
          onCancel={handleCancelGeneration}
        />
      )}

      {/* Ref Frame Warning Dialog */}
      {refFrameWarning && (
        <div className="modal-overlay" onClick={() => setRefFrameWarning(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reference Frame</h3>
              <button className="modal-close" onClick={() => setRefFrameWarning(null)}>X</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
                {refFrameWarning.message}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
                  const cards = refFrameWarning.cards;
                  setRefFrameWarning(null);
                  setPendingGenCards(cards);
                }}>
                  확인
                </button>
                <button className="btn" style={{ flex: 1 }} onClick={() => setRefFrameWarning(null)}>
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {pendingGenCards && (
        <div className="modal-overlay" onClick={() => setPendingGenCards(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Generate Images</h3>
              <button className="modal-close" onClick={() => setPendingGenCards(null)}>X</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12, lineHeight: 1.6 }}>
                {pendingGenCards.length}개 표현에 대한 이미지를 각 2개씩 생성할게요.
              </p>
              <ul style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 16, paddingLeft: 16 }}>
                {pendingGenCards.slice(0, 8).map(card => (
                  <li key={card.id} style={{ marginBottom: 2 }}>{card.lines.join(' ')}</li>
                ))}
                {pendingGenCards.length > 8 && (
                  <li>... +{pendingGenCards.length - 8}개 더</li>
                )}
              </ul>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmGenerateImages}>
                  Generate ({pendingGenCards.length * 2} images)
                </button>
                <button className="btn" style={{ flex: 1 }} onClick={() => setPendingGenCards(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="action-bar">
        <button
          className="btn btn-primary"
          onClick={handleGenerateLayout}
          disabled={isGeneratingLayout || parsedCards.length === 0}
        >
          {isGeneratingLayout ? 'Generating...' : 'Generate Layout'}
        </button>
        <button
          className="btn btn-primary"
          onClick={handleTranslate}
          disabled={isTranslating || parsedCards.length === 0}
        >
          {isTranslating ? 'Translating...' : 'Translate'}
        </button>
        <button
          className="btn btn-primary"
          onClick={handleGenerateImages}
          disabled={gemini.isGenerating || parsedCards.length === 0}
        >
          Generate Images
        </button>
        <button
          className="btn"
          onClick={handleNewPage}
          style={{ width: '100%', marginTop: 4 }}
        >
          + New Page
        </button>
      </div>
    </div>
  );
};

export default App;
