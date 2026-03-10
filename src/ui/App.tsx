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

  // Gemini API hook
  const gemini = useGeminiApi();

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

  // Ref to track latest parsed cards for live updates
  const parsedCardsRef = useRef<ExpressionCard[]>([]);
  useEffect(() => {
    parsedCardsRef.current = parsedCards;
  }, [parsedCards]);

  // Live update: send UPDATE_LAYOUT on spacebar / double-enter triggers
  const handleLiveUpdate = useCallback(() => {
    // Small delay to ensure state is updated after the keystroke
    setTimeout(() => {
      const cards = parsedCardsRef.current;
      if (cards.length === 0) return;
      postToPlugin({
        type: 'UPDATE_LAYOUT',
        expressions: cards,
        settings,
      });
    }, 50);
  }, [settings]);

  // Handle messages from the sandbox
  const handlePluginMessage = useCallback((msg: SandboxToUIMessage) => {
    switch (msg.type) {
      case 'LAYOUT_CREATED':
        setPlacements(msg.placements);
        setIsGeneratingLayout(false);
        // Update parsedCards with actual colSpan/rowSpan from sandbox measurement
        setParsedCards(prev => prev.map(card => {
          var placement = msg.placements.find(function(p) { return p.id === card.id; });
          if (placement) {
            return {
              ...card,
              colSpan: placement.colSpan as 1 | 2,
              rowSpan: placement.rowSpan as 1 | 2,
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
        setGeneratedImages((prev) => {
          const next = new Map(prev);
          const existing = next.get(msg.expressionId) || [];
          const meta: ImageMeta = {
            expressionId: msg.expressionId,
            imageHash: msg.imageHash,
            prompt: '',
            isActive: isFirstVariant,
            index: msg.index,
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
        // Clear generated images state when switching frames
        setGeneratedImages(new Map());
        setPlacements([]);
        break;

      case 'NEW_PAGE_CREATED':
        setActiveFrameId(msg.frameId);
        setExpressions('');
        setGeneratedImages(new Map());
        setPlacements([]);
        setParsedCards([]);
        break;

      case 'ERROR':
        setError(msg.message + (msg.detail ? `: ${msg.detail}` : ''));
        setIsGeneratingLayout(false);
        break;

      default:
        break;
    }
  }, []);

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
      expressions: parsedCards,
      settings,
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

    gemini.generateAll(settings.apiKey, cards, refImageRef.current);
  };

  const handleCancelGeneration = () => {
    gemini.cancel();
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
            onRegen={(expressionId, customPrompt) => {
              const card = parsedCards.find(c => c.id === expressionId);
              if (!card || !settings.apiKey) return;
              const existingCount = generatedImages.get(expressionId)?.length || 0;
              gemini.generateSingle(settings.apiKey, card, customPrompt, refImageRef.current, existingCount);
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
