import React, { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ExpressionCard,
  PluginSettings,
  CardPlacement,
  ImageMeta,
  SandboxToUIMessage,
  ContentIdMap,
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

/** Normalize text for contentIdMap keys (same logic as plugin side). */
function normalizeText(lines: string[]): string {
  return lines.map(l => l.trim()).filter(l => l.length > 0).join('\n');
}

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
  const [retranslatingId, setRetranslatingId] = useState<string | null>(null);

  // Card detail view (when user selects a single card in Figma)
  const [selectedCard, setSelectedCard] = useState<{
    frameId: string;
    expressionId: string;
    korean: string;
    en: string;
  } | null>(null);
  const [cardRegenPrompt, setCardRegenPrompt] = useState('');
  const [isCardRegenerating, setIsCardRegenerating] = useState(false);
  const [isCardRetranslating, setIsCardRetranslating] = useState(false);

  // English translations map: expressionId string → enLines
  const [enLinesMap, setEnLinesMap] = useState<Map<string, string[]>>(new Map());

  // Persistent content→ID mapping from Storage frame
  const [contentIdMap, setContentIdMap] = useState<ContentIdMap | undefined>();

  // Unified storage readiness
  const [storageReady, setStorageReady] = useState(false);

  // Guide lines toggle
  const [hasGuides, setHasGuides] = useState(false);

  // Gemini API hook
  const gemini = useGeminiApi();

  // Load saved API key and check storage on startup
  useEffect(() => {
    postToPlugin({ type: 'LOAD_API_KEY' });
    postToPlugin({ type: 'CHECK_STORAGE' });
  }, []);

  // Save API key when it changes (skip empty on first load)
  const apiKeyRef = useRef(settings.apiKey);
  useEffect(() => {
    if (settings.apiKey && settings.apiKey !== apiKeyRef.current) {
      apiKeyRef.current = settings.apiKey;
      postToPlugin({ type: 'SAVE_API_KEY', apiKey: settings.apiKey });
    }
  }, [settings.apiKey]);

  // Ref to track latest parsed cards and enLines for live updates
  const parsedCardsRef = useRef<ExpressionCard[]>([]);
  const enLinesMapRef = useRef<Map<string, string[]>>(new Map());
  useEffect(() => {
    parsedCardsRef.current = parsedCards;
  }, [parsedCards]);
  useEffect(() => {
    enLinesMapRef.current = enLinesMap;
  }, [enLinesMap]);

  // Handle restored English translations from contentIdMap
  const handleRestoredEn = useCallback((restoredEnMap: Map<string, string[]>) => {
    setEnLinesMap(prev => {
      const next = new Map(prev);
      restoredEnMap.forEach((enLines, cardId) => {
        // Only restore if card doesn't already have a translation
        if (!next.has(cardId) || next.get(cardId)!.every(l => l === CARD_EN_PLACEHOLDER || l === '')) {
          next.set(cardId, enLines);
        }
      });
      return next;
    });
  }, []);

  // Handle restored image selections from contentIdMap
  const handleRestoredImage = useCallback((restoredImageMap: Map<string, number>) => {
    setGeneratedImages(prev => {
      const next = new Map(prev);
      restoredImageMap.forEach((preferredIndex, cardId) => {
        const images = next.get(cardId);
        if (images && images.some(img => img.index === preferredIndex)) {
          next.set(cardId, images.map(img => ({
            ...img,
            isActive: img.index === preferredIndex,
          })));
        }
      });
      return next;
    });
  }, []);

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
        if (msg.contentIdMap) setContentIdMap(msg.contentIdMap);
        // Skip placement updates when this is a contentIdMap-only update
        if (msg.placements.length > 0) {
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
        }
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

          // Update contentIdMap with this expression's selected image index
          const card = parsedCardsRef.current.find(c => c.id === msg.expressionId);
          if (card) {
            postToPlugin({
              type: 'UPDATE_CONTENT_ID_MAP',
              entries: [{
                normalizedText: normalizeText(card.lines),
                expressionId: parseInt(card.id),
                imageIndex: msg.index,
              }],
              frameId: activeFrameId || undefined,
            });
          }
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

      case 'CARD_SELECTED': {
        setSelectedCard({
          frameId: msg.frameId,
          expressionId: msg.expressionId,
          korean: msg.korean,
          en: msg.en,
        });
        setActiveFrameId(msg.frameId);
        setCardRegenPrompt('');
        // Restore stored images for this expression
        if (msg.storedImages && msg.storedImages.length > 0) {
          setGeneratedImages(prev => {
            const next = new Map(prev);
            const images: ImageMeta[] = msg.storedImages.map(img => ({
              expressionId: img.expressionId,
              imageHash: img.imageHash,
              prompt: img.prompt,
              isActive: img.isActive,
              index: img.index,
            }));
            next.set(msg.expressionId, images);
            return next;
          });
        }
        break;
      }

      case 'FRAME_SELECTED': {
        setSelectedCard(null);
        setActiveFrameId(msg.frameId);
        setExpressions(msg.expressionText);
        // Restore content→ID mapping from storage (parser uses this for expressionId assignment)
        setContentIdMap(msg.contentIdMap);
        // Restore English translations from canvas cards
        const newEnMap = new Map<string, string[]>();
        if (msg.enTextPairs && msg.enTextPairs.length > 0) {
          for (const pair of msg.enTextPairs) {
            if (pair.en && pair.en !== CARD_EN_PLACEHOLDER && !newEnMap.has(pair.expressionId)) {
              newEnMap.set(pair.expressionId, [pair.en]);
            }
          }
        }
        setEnLinesMap(newEnMap);
        // Restore generated images from Image Storage
        if (msg.storedImages && msg.storedImages.length > 0) {
          // Build expressionId → preferred imageIndex from contentIdMap
          const preferredIndex = new Map<string, number>();
          if (msg.contentIdMap) {
            for (const entry of Object.values(msg.contentIdMap)) {
              if (entry.imageIndex !== undefined) {
                preferredIndex.set(String(entry.expressionId), entry.imageIndex);
              }
            }
          }

          const restoredMap = new Map<string, ImageMeta[]>();
          for (const img of msg.storedImages) {
            const existing = restoredMap.get(img.expressionId) || [];
            // Use contentIdMap's imageIndex to determine active state
            const preferred = preferredIndex.get(img.expressionId);
            existing.push({
              expressionId: img.expressionId,
              imageHash: img.imageHash,
              prompt: img.prompt,
              isActive: preferred !== undefined ? img.index === preferred : img.isActive,
              index: img.index,
            });
            restoredMap.set(img.expressionId, existing);
          }
          setGeneratedImages(restoredMap);
        } else {
          setGeneratedImages(new Map());
        }
        setPlacements([]);
        break;
      }

      case 'NEW_PAGE_CREATED':
        setActiveFrameId(msg.frameId);
        setExpressions('');
        setGeneratedImages(new Map());
        setPlacements([]);
        setParsedCards([]);
        setEnLinesMap(new Map());
        break;

      case 'IMAGE_THUMBNAIL': {
        setGeneratedImages(prev => {
          const next = new Map(prev);
          const images = next.get(msg.expressionId);
          if (images) {
            next.set(msg.expressionId, images.map(img =>
              img.imageHash === msg.imageHash
                ? { ...img, imageBase64: msg.imageBase64 }
                : img
            ));
          }
          return next;
        });
        break;
      }

      case 'STORAGE_STATUS':
        setStorageReady(msg.ready);
        if (msg.contentIdMap) setContentIdMap(msg.contentIdMap);
        if (msg.hasGuides !== undefined) setHasGuides(msg.hasGuides);
        break;

      case 'GUIDES_STATUS':
        setHasGuides(msg.hasGuides);
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
    // Also skip cards whose Korean text already has images via contentIdMap
    const cardsWithoutImages = parsedCards.filter(card => {
      // Already has images in the UI state
      if (generatedImages.has(card.id) && generatedImages.get(card.id)!.length > 0) return false;
      // Check contentIdMap: if this text already has an imageIndex, images exist in storage
      if (contentIdMap) {
        const key = normalizeText(card.lines);
        const entry = contentIdMap[key];
        if (entry && entry.imageIndex !== undefined) return false;
      }
      return true;
    });
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
        koreanText: card.lines.map(l => l.split('=')[0].trim()).join(' '),
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

        // Update contentIdMap with translations
        const entries = cardsToTranslate
          .filter(card => translationMap.has(card.id))
          .map(card => ({
            normalizedText: normalizeText(card.lines),
            expressionId: parseInt(card.id),
            en: translationMap.get(card.id)!.join(' '),
          }));
        if (entries.length > 0) {
          postToPlugin({
            type: 'UPDATE_CONTENT_ID_MAP',
            entries,
            frameId: activeFrameId || undefined,
          });
        }
      }
    } catch (err: any) {
      setError('Translation failed: ' + (err.message || String(err)));
    } finally {
      setIsTranslating(false);
    }
  };

  const handleRetranslateCard = async (cardId: string) => {
    const card = parsedCards.find(c => c.id === cardId);
    if (!card || !settings.apiKey) return;

    setRetranslatingId(cardId);
    setError(null);

    try {
      const koreanText = card.lines.map(l => l.split('=')[0].trim()).join(' ');
      const translationMap = await gemini.translate(settings.apiKey, [{ id: cardId, koreanText }]);
      const enLines = translationMap.get(cardId);
      if (!enLines) return;

      // Update enLinesMap
      setEnLinesMap(prev => {
        const next = new Map(prev);
        next.set(cardId, enLines);
        return next;
      });

      // Trigger layout update
      const cards = parsedCardsRef.current;
      const updatedMap = new Map(enLinesMapRef.current);
      updatedMap.set(cardId, enLines);
      const cardsWithEn = cards.map(c => ({
        ...c,
        enLines: updatedMap.get(c.id),
      }));
      postToPlugin({
        type: 'UPDATE_LAYOUT',
        expressions: cardsWithEn,
        settings,
        frameId: activeFrameId || undefined,
      });

      // Update contentIdMap
      postToPlugin({
        type: 'UPDATE_CONTENT_ID_MAP',
        entries: [{
          normalizedText: normalizeText(card.lines),
          expressionId: parseInt(card.id),
          en: enLines.join(' '),
        }],
        frameId: activeFrameId || undefined,
      });
    } catch (err: any) {
      setError('Re-translation failed: ' + (err.message || String(err)));
    } finally {
      setRetranslatingId(null);
    }
  };

  // Build a synthetic ExpressionCard from selectedCard data (independent of parsedCards)
  const buildCardFromSelection = (): ExpressionCard | null => {
    if (!selectedCard) return null;
    const lines = selectedCard.korean.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    return {
      id: selectedCard.expressionId,
      lines,
      colSpan: 2,
      rowSpan: 2,
    };
  };

  // Card detail: retranslate selected card
  const handleCardRetranslate = async () => {
    if (!selectedCard || !settings.apiKey) return;
    setIsCardRetranslating(true);
    setError(null);
    try {
      const koreanLines = selectedCard.korean.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const koreanText = koreanLines.map(l => l.split('=')[0].trim()).join(' ');
      const translationMap = await gemini.translate(settings.apiKey, [{ id: selectedCard.expressionId, koreanText }]);
      const enLines = translationMap.get(selectedCard.expressionId);
      if (enLines) {
        const enText = enLines.join(' ');
        setSelectedCard(prev => prev ? { ...prev, en: enText } : null);
        setEnLinesMap(prev => { const next = new Map(prev); next.set(selectedCard.expressionId, enLines); return next; });
        // Directly update the card's English text on canvas
        postToPlugin({
          type: 'UPDATE_CARD_EN',
          expressionId: selectedCard.expressionId,
          enText,
          frameId: selectedCard.frameId || undefined,
        });
        // Update contentIdMap (uses korean text directly, no parsedCards dependency)
        postToPlugin({
          type: 'UPDATE_CONTENT_ID_MAP',
          entries: [{ normalizedText: normalizeText(koreanLines), expressionId: parseInt(selectedCard.expressionId), en: enText }],
          frameId: selectedCard.frameId || undefined,
        });
      }
    } catch (err: any) {
      setError('Re-translation failed: ' + (err.message || String(err)));
    } finally {
      setIsCardRetranslating(false);
    }
  };

  // Card detail: regenerate images for selected card
  const handleCardRegenerate = async () => {
    if (!selectedCard || !settings.apiKey) return;
    const card = buildCardFromSelection();
    if (!card) return;
    setIsCardRegenerating(true);
    setError(null);
    try {
      // Ensure reference image
      if (settings.refFrameName && !refImageRef.current) {
        postToPlugin({ type: 'EXPORT_REF_FRAME', frameName: settings.refFrameName });
        await new Promise<void>(resolve => {
          const check = setInterval(() => { if (refImageRef.current) { clearInterval(check); resolve(); } }, 200);
          setTimeout(() => { clearInterval(check); resolve(); }, 10000);
        });
      }
      const existingCount = generatedImages.get(selectedCard.expressionId)?.length || 0;
      // Generate 2 new variants
      await gemini.generateSingle(settings.apiKey, card, cardRegenPrompt || undefined, refImageRef.current, existingCount, selectedCard.frameId || undefined);
      await gemini.generateSingle(settings.apiKey, card, cardRegenPrompt || undefined, refImageRef.current, existingCount + 1, selectedCard.frameId || undefined);
    } catch (err: any) {
      setError('Image generation failed: ' + (err.message || String(err)));
    } finally {
      setIsCardRegenerating(false);
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

  // Swap image from card detail view
  const handleCardSwap = (imageHash: string) => {
    if (!selectedCard) return;
    postToPlugin({
      type: 'SWAP_IMAGE',
      expressionId: selectedCard.expressionId,
      newImageHash: imageHash,
      frameId: selectedCard.frameId || undefined,
    });
    setGeneratedImages(prev => {
      const next = new Map(prev);
      const images = next.get(selectedCard.expressionId);
      if (images) {
        next.set(selectedCard.expressionId, images.map(img => ({
          ...img,
          isActive: img.imageHash === imageHash,
        })));
      }
      return next;
    });
    const koreanLines = selectedCard.korean.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const images = generatedImages.get(selectedCard.expressionId);
    const swappedImg = images?.find(img => img.imageHash === imageHash);
    if (swappedImg) {
      postToPlugin({
        type: 'UPDATE_CONTENT_ID_MAP',
        entries: [{ normalizedText: normalizeText(koreanLines), expressionId: parseInt(selectedCard.expressionId), imageIndex: swappedImg.index }],
        frameId: selectedCard.frameId || undefined,
      });
    }
  };

  return (
    <div className="container">
      {/* Error Banner */}
      {error && (
        <div className="error-banner" onClick={() => setError(null)} style={{ margin: '8px 16px 0' }}>
          {error}
        </div>
      )}

      {selectedCard ? (
        /* ── Card Detail View ── */
        <>
          <div className="tab-content card-detail">
            <div className="card-detail-header">
              <span className="card-detail-badge">Card #{selectedCard.expressionId}</span>
              <button className="btn-icon" onClick={() => setSelectedCard(null)} title="Back">&times;</button>
            </div>

            {/* Regen prompt */}
            <div className="card-detail-regen">
              <textarea
                value={cardRegenPrompt}
                onChange={e => setCardRegenPrompt(e.target.value)}
                placeholder="Custom prompt for regeneration (optional)"
                rows={2}
              />
              <button
                className="btn btn-primary"
                onClick={handleCardRegenerate}
                disabled={isCardRegenerating || !settings.apiKey}
              >
                {isCardRegenerating ? 'Generating...' : 'Regenerate (2 images)'}
              </button>
            </div>

            {/* Korean / English text */}
            <div className="card-detail-texts">
              <div className="card-detail-ko">{selectedCard.korean}</div>
              <div className="card-detail-en-row">
                <span className="card-detail-en">
                  {selectedCard.en && selectedCard.en !== CARD_EN_PLACEHOLDER ? selectedCard.en : '(no translation)'}
                </span>
                <button
                  className="btn btn-sm"
                  onClick={handleCardRetranslate}
                  disabled={isCardRetranslating || !settings.apiKey}
                >
                  {isCardRetranslating ? '...' : 'Re-translate'}
                </button>
              </div>
            </div>

            {/* Image candidates */}
            {(() => {
              const images = generatedImages.get(selectedCard.expressionId) || [];
              if (images.length === 0) {
                return (
                  <div className="card-detail-no-images">
                    <button
                      className="btn btn-primary btn-lg"
                      onClick={handleCardRegenerate}
                      disabled={isCardRegenerating || !settings.apiKey}
                    >
                      {isCardRegenerating ? 'Generating...' : 'Generate Images'}
                    </button>
                  </div>
                );
              }
              return (
                <div className="card-detail-images">
                  <div className="card-detail-images-label">Image Variants ({images.length})</div>
                  <div className="card-detail-thumbs">
                    {images.map((img, idx) => (
                      <div
                        key={img.imageHash}
                        className={`card-detail-thumb ${img.isActive ? 'active' : ''}`}
                        onClick={() => handleCardSwap(img.imageHash)}
                        title={img.isActive ? `#${idx + 1} (active)` : `#${idx + 1} — click to select`}
                      >
                        {img.imageBase64 ? (
                          <img src={`data:image/png;base64,${img.imageBase64}`} alt={`#${idx + 1}`} />
                        ) : (
                          <div className="card-detail-thumb-ph">#{idx + 1}</div>
                        )}
                        {img.isActive && <div className="card-detail-thumb-badge">Active</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </>
      ) : (
        /* ── Normal Tab View ── */
        <>
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

          <div className="tab-content">
            {activeTab === 'expressions' && (
              <>
                <ExpressionInput
                  value={expressions}
                  onChange={setExpressions}
                  onParsed={setParsedCards}
                  onRestoredEn={handleRestoredEn}
                  onRestoredImage={handleRestoredImage}
                  onTriggerUpdate={handleLiveUpdate}
                  activeFrameId={activeFrameId}
                  contentIdMap={contentIdMap}
                />
                {parsedCards.length > 0 && enLinesMap.size > 0 && (
                  <div className="translation-list">
                    <div className="translation-list-header">Translations</div>
                    {parsedCards
                      .filter((card, idx) => parsedCards.findIndex(c => c.id === card.id) === idx)
                      .map(card => {
                        const en = enLinesMap.get(card.id);
                        const hasEn = en && en.some(l => l !== '' && l !== CARD_EN_PLACEHOLDER);
                        return (
                          <div key={card.id} className="translation-row">
                            <div className="translation-texts">
                              <span className="translation-ko">{card.lines.join(' / ')}</span>
                              <span className="translation-en">{hasEn ? en!.join(' ') : '—'}</span>
                            </div>
                            <button
                              className="btn-icon"
                              onClick={() => handleRetranslateCard(card.id)}
                              disabled={isTranslating || retranslatingId === card.id}
                              title="Re-translate"
                            >
                              {retranslatingId === card.id ? '...' : '\u21BB'}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
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
                  const card = parsedCardsRef.current.find(c => c.id === expressionId);
                  const images = generatedImages.get(expressionId);
                  const swappedImg = images?.find(img => img.imageHash === imageHash);
                  if (card && swappedImg) {
                    postToPlugin({
                      type: 'UPDATE_CONTENT_ID_MAP',
                      entries: [{
                        normalizedText: normalizeText(card.lines),
                        expressionId: parseInt(card.id),
                        imageIndex: swappedImg.index,
                      }],
                      frameId: activeFrameId || undefined,
                    });
                  }
                }}
                onRegen={async (expressionId, customPrompt) => {
                  const card = parsedCards.find(c => c.id === expressionId);
                  if (!card || !settings.apiKey) return;
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
        </>
      )}

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
                {pendingGenCards.slice(0, 8).map((card, idx) => (
                  <li key={idx} style={{ marginBottom: 2 }}>{card.lines.join(' ')}</li>
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
        {storageReady ? (
          <>
            <div className="action-row">
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
                Gen Images
              </button>
            </div>
            <div className="action-row">
              <button className="btn" onClick={handleNewPage}>
                + New Page
              </button>
              {hasGuides ? (
                <button
                  className="btn"
                  onClick={() => postToPlugin({ type: 'CLEANUP_GUIDES' })}
                >
                  Remove Guides
                </button>
              ) : (
                <button
                  className="btn"
                  onClick={() => postToPlugin({ type: 'ADD_GUIDES' })}
                >
                  Guide Lines
                </button>
              )}
            </div>
          </>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => postToPlugin({ type: 'INIT_STORAGE' })}
            style={{ width: '100%' }}
          >
            Init Storage
          </button>
        )}
      </div>
    </div>
  );
};

export default App;
