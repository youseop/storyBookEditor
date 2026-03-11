# Card Selection Actions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable re-translation and image regeneration for single and multi-selected cards in the Figma plugin.

**Architecture:** Extend sandbox selection handler to detect multi-card selection and send `CARDS_SELECTED` message. Add `MultiCardPanel` component for multi-card actions. Extend existing single card detail view with re-translate confirmation and prompt-based image regen.

**Tech Stack:** TypeScript, React, Figma Plugin API, Gemini API

---

## File Structure

- **Modify:** `src/shared/messageTypes.ts` — Add `CardsSelectedMessage` and `UpdateCardTranslationsMessage` types
- **Modify:** `src/plugin/code.ts:1170-1240` — Multi-card selection detection in `handleSelectionChange`
- **Modify:** `src/ui/App.tsx` — Add `selectedCards` state, message handler, render branch
- **Create:** `src/ui/components/MultiCardPanel.tsx` — Multi-card panel component
- **Modify:** `src/ui/styles/globals.css` — Styles for multi-card panel

---

### Task 1: Add Message Types

**Files:**
- Modify: `src/shared/messageTypes.ts`

- [ ] **Step 1: Add CardsSelectedMessage interface**

Add after `CardSelectedMessage` (line ~276):

```ts
export interface CardsSelectedMessage {
  type: 'CARDS_SELECTED';
  frameId: string;
  cards: Array<{
    expressionId: string;
    korean: string;
    en: string;
  }>;
  storedImages: StoredImageInfo[];
}
```

- [ ] **Step 2: Add UpdateCardTranslationsMessage interface**

Add after `UpdateCardEnMessage` (line ~171):

```ts
export interface UpdateCardTranslationsMessage {
  type: 'UPDATE_CARD_TRANSLATIONS';
  cards: Array<{ expressionId: string; enText: string }>;
  frameId?: string;
}
```

- [ ] **Step 3: Add to union types**

Add `CardsSelectedMessage` to `SandboxToUIMessage` union.
Add `UpdateCardTranslationsMessage` to `UIToSandboxMessage` union.

- [ ] **Step 4: Build to verify types compile**

Run: `npm run build`
Expected: Build succeeds

---

### Task 2: Multi-Card Selection in Sandbox

**Files:**
- Modify: `src/plugin/code.ts:1170-1240`

- [ ] **Step 1: Modify handleSelectionChange to detect multi-card selection**

Replace the current `handleSelectionChange` function. The key change: instead of `if (selection.length !== 1) return;`, filter selection for `[card:*]` frames. If multiple cards found, call new `handleMultiCardSelected`. If exactly one card, call existing `handleCardSelected`. If zero cards, check for KeyExpr frame.

```ts
async function handleSelectionChange(seq: number): Promise<void> {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return;

  // Filter for [card:*] frames in selection
  var cardNodes: FrameNode[] = [];
  for (var i = 0; i < selection.length; i++) {
    var n = selection[i];
    if (n.type === 'FRAME' && n.name.startsWith('[card:')) {
      cardNodes.push(n as FrameNode);
    }
  }

  if (cardNodes.length === 1) {
    handleCardSelected(cardNodes[0], seq);
    return;
  }

  if (cardNodes.length > 1) {
    handleMultiCardSelected(cardNodes, seq);
    return;
  }

  // No cards selected — check for KeyExpr frame (single selection only)
  if (selection.length !== 1) return;
  const node = selection[0];
  if (node.type !== 'FRAME' || !node.name.startsWith('[KeyExpr] Key Expressions')) return;

  // ... rest of existing FRAME_SELECTED logic stays the same ...
}
```

- [ ] **Step 2: Add handleMultiCardSelected function**

Add before `handleSelectionChange`:

```ts
async function handleMultiCardSelected(cards: FrameNode[], seq: number): Promise<void> {
  // Sort by position (top→bottom, left→right)
  var sorted = cards.slice().sort(function(a, b) {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  // Find parent KeyExpr frame from first card
  var parent = sorted[0].parent;
  while (parent && parent.type === 'FRAME' && !(parent as FrameNode).name.startsWith(MAIN_FRAME_PREFIX)) {
    parent = parent.parent;
  }
  var frameId = (parent && parent.type === 'FRAME') ? parent.id : '';

  // Extract card data
  var cardData: Array<{ expressionId: string; korean: string; en: string }> = [];
  var expressionIds = new Set<string>();

  for (var i = 0; i < sorted.length; i++) {
    var card = sorted[i];
    var expressionId = card.getPluginData('expressionId');
    if (!expressionId) continue;

    var koNode = card.findOne(function(n) { return n.name === 'card-text' && n.type === 'TEXT'; }) as TextNode | null;
    var enNode = card.findOne(function(n) { return n.name === 'card-text-en' && n.type === 'TEXT'; }) as TextNode | null;

    // Skip duplicate expressionIds (same expression in multiple cards)
    if (expressionIds.has(expressionId)) continue;
    expressionIds.add(expressionId);

    cardData.push({
      expressionId: expressionId,
      korean: koNode ? koNode.characters : '',
      en: enNode ? enNode.characters : '',
    });
  }

  // Gather stored images for all selected expressions
  var storedImages: Array<{ expressionId: string; imageHash: string; prompt: string; index: number; isActive: boolean }> = [];
  var storageFrame = findStorage();
  var storageRects: RectangleNode[] = [];

  if (storageFrame) {
    // Build active hash set from cards
    var activeHashes = new Set<string>();
    for (var ci = 0; ci < sorted.length; ci++) {
      var imgRect = sorted[ci].findOne(
        function(n) { return n.type === 'RECTANGLE' && n.name.startsWith('[image:'); }
      ) as RectangleNode | null;
      if (imgRect) {
        var h = imgRect.getPluginData('imageHash');
        if (h) activeHashes.add(h);
      }
    }

    // Find stored images for all selected expressionIds
    expressionIds.forEach(function(exprId) {
      var rects = storageFrame!.findAll(
        function(n) { return n.type === 'RECTANGLE' && n.getPluginData('expressionId') === exprId && n.getPluginData('imageHash') !== ''; }
      ) as RectangleNode[];
      for (var ri = 0; ri < rects.length; ri++) {
        var rect = rects[ri];
        var hash = rect.getPluginData('imageHash');
        storageRects.push(rect);
        storedImages.push({
          expressionId: exprId,
          imageHash: hash,
          prompt: rect.getPluginData('prompt'),
          index: parseInt(rect.getPluginData('imageIndex') || '0', 10),
          isActive: activeHashes.has(hash),
        });
      }
    });
  }

  figma.ui.postMessage({
    type: 'CARDS_SELECTED',
    frameId: frameId,
    cards: cardData,
    storedImages: storedImages,
  });

  // Async: send thumbnails
  for (var ti = 0; ti < storageRects.length; ti++) {
    if (seq !== selectionSeq) return;
    try {
      var tRect = storageRects[ti];
      var tBytes = await tRect.exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: 160 } });
      if (seq !== selectionSeq) return;
      figma.ui.postMessage({
        type: 'IMAGE_THUMBNAIL',
        expressionId: tRect.getPluginData('expressionId'),
        imageHash: tRect.getPluginData('imageHash'),
        imageBase64: uint8ToBase64(tBytes),
      });
    } catch {}
  }
}
```

- [ ] **Step 3: Add UPDATE_CARD_TRANSLATIONS message handler**

Add to the message `switch` statement in `figma.ui.onmessage`:

```ts
case 'UPDATE_CARD_TRANSLATIONS': {
  var translationCards = (msg as any).cards as Array<{ expressionId: string; enText: string }>;
  var translationFrameId = (msg as any).frameId as string | undefined;

  // Find target frame
  var targetFrame: FrameNode | null = null;
  if (translationFrameId) {
    try { targetFrame = figma.getNodeById(translationFrameId) as FrameNode; } catch {}
  }
  if (!targetFrame) {
    // Find any KeyExpr frame
    targetFrame = figma.currentPage.findOne(
      function(n) { return n.type === 'FRAME' && n.name.startsWith(MAIN_FRAME_PREFIX); }
    ) as FrameNode | null;
  }
  if (!targetFrame) break;

  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  for (var tci = 0; tci < translationCards.length; tci++) {
    var tc = translationCards[tci];
    // Find all cards with this expressionId
    var matchingCards = targetFrame.findAll(
      function(n) { return n.type === 'FRAME' && n.getPluginData('expressionId') === tc.expressionId; }
    ) as FrameNode[];

    for (var mci = 0; mci < matchingCards.length; mci++) {
      var enTextNode = matchingCards[mci].findOne(
        function(n) { return n.name === 'card-text-en' && n.type === 'TEXT'; }
      ) as TextNode | null;
      if (enTextNode) {
        enTextNode.characters = tc.enText;
      }
    }
  }
  break;
}
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 3: App.tsx State & Message Handling

**Files:**
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Add selectedCards state**

Add after `selectedCard` state (line ~58):

```ts
// Multi-card selection view
const [selectedCards, setSelectedCards] = useState<Array<{
  expressionId: string;
  korean: string;
  en: string;
}> | null>(null);
const [multiCardFrameId, setMultiCardFrameId] = useState<string>('');
```

- [ ] **Step 2: Add CARDS_SELECTED message handler**

Add to `handlePluginMessage` switch, after `CARD_SELECTED` case:

```ts
case 'CARDS_SELECTED': {
  setSelectedCard(null); // clear single selection
  setSelectedCards(msg.cards);
  setMultiCardFrameId(msg.frameId);
  setActiveFrameId(msg.frameId);
  // Restore stored images for selected expressions
  if (msg.storedImages && msg.storedImages.length > 0) {
    setGeneratedImages(prev => {
      const next = new Map(prev);
      for (const img of msg.storedImages) {
        const existing = next.get(img.expressionId) || [];
        // Only add if not already present
        if (!existing.some(e => e.imageHash === img.imageHash)) {
          existing.push({
            expressionId: img.expressionId,
            imageHash: img.imageHash,
            prompt: img.prompt,
            isActive: img.isActive,
            index: img.index,
          });
          next.set(img.expressionId, existing);
        }
      }
      return next;
    });
  }
  break;
}
```

- [ ] **Step 3: Clear selectedCards on other selections**

In `CARD_SELECTED` handler, add `setSelectedCards(null);` at the top.
In `FRAME_SELECTED` handler, add `setSelectedCards(null);` at the top.

- [ ] **Step 4: Add render branch for multi-card panel**

Modify the render logic (line ~745) to add a branch:

```tsx
{selectedCards ? (
  <MultiCardPanel
    cards={selectedCards}
    frameId={multiCardFrameId}
    generatedImages={generatedImages}
    apiKey={settings.apiKey}
    refFrameName={settings.refFrameName}
    onRetranslate={handleMultiCardRetranslate}
    onRegenerateImages={handleMultiCardRegenerate}
    onSwap={handleMultiCardSwap}
    onClose={() => setSelectedCards(null)}
  />
) : selectedCard ? (
  /* existing card detail view */
) : (
  /* existing tab view */
)}
```

- [ ] **Step 5: Add handler functions for multi-card operations**

```ts
// Multi-card: batch re-translate
const handleMultiCardRetranslate = async (cards: Array<{ expressionId: string; korean: string }>) => {
  if (!settings.apiKey) return;
  setError(null);

  try {
    const translateInput = cards.map(c => ({
      id: c.expressionId,
      koreanText: c.korean.split('\n').map(l => l.split('=')[0].trim()).join(' '),
    }));
    const translationMap = await gemini.translate(settings.apiKey, translateInput);

    // Update selectedCards with new translations
    setSelectedCards(prev => prev?.map(c => {
      const en = translationMap.get(c.expressionId);
      return en ? { ...c, en: en.join(' ') } : c;
    }) || null);

    // Update canvas
    const updates = cards.map(c => {
      const en = translationMap.get(c.expressionId);
      return { expressionId: c.expressionId, enText: en ? en.join(' ') : '' };
    }).filter(u => u.enText);

    postToPlugin({
      type: 'UPDATE_CARD_TRANSLATIONS',
      cards: updates,
      frameId: multiCardFrameId || undefined,
    });

    // Update contentIdMap
    const entries = cards.map(c => {
      const en = translationMap.get(c.expressionId);
      if (!en) return null;
      const koreanLines = c.korean.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      return {
        normalizedText: normalizeText(koreanLines),
        expressionId: parseInt(c.expressionId),
        en: en.join(' '),
      };
    }).filter(Boolean) as any[];

    if (entries.length > 0) {
      postToPlugin({
        type: 'UPDATE_CONTENT_ID_MAP',
        entries,
        frameId: multiCardFrameId || undefined,
      });
    }
  } catch (err: any) {
    setError('Batch translation failed: ' + (err.message || String(err)));
  }
};

// Multi-card: batch image regeneration
const handleMultiCardRegenerate = async (
  cards: Array<{ expressionId: string; korean: string; prompt: string }>
) => {
  if (!settings.apiKey) return;
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

    for (const card of cards) {
      const lines = card.korean.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const exprCard: ExpressionCard = {
        id: card.expressionId,
        lines,
        colSpan: 2,
        rowSpan: 2,
      };
      const existingCount = generatedImages.get(card.expressionId)?.length || 0;
      const customPrompt = card.prompt !== lines.join(' ') ? card.prompt : undefined;
      await gemini.generateSingle(
        settings.apiKey, exprCard, customPrompt,
        refImageRef.current, existingCount,
        multiCardFrameId || undefined
      );
    }
  } catch (err: any) {
    setError('Batch image generation failed: ' + (err.message || String(err)));
  }
};

// Multi-card: swap image
const handleMultiCardSwap = (expressionId: string, imageHash: string) => {
  postToPlugin({
    type: 'SWAP_IMAGE',
    expressionId,
    newImageHash: imageHash,
    frameId: multiCardFrameId || undefined,
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
};
```

- [ ] **Step 6: Import MultiCardPanel**

Add import at top of App.tsx:
```ts
import MultiCardPanel from './components/MultiCardPanel';
```

- [ ] **Step 7: Build to verify (will fail until MultiCardPanel exists)**

---

### Task 4: MultiCardPanel Component

**Files:**
- Create: `src/ui/components/MultiCardPanel.tsx`

- [ ] **Step 1: Create MultiCardPanel component**

```tsx
import React, { useState } from 'react';
import type { ImageMeta } from '../../shared/messageTypes';

interface MultiCardPanelProps {
  cards: Array<{ expressionId: string; korean: string; en: string }>;
  frameId: string;
  generatedImages: Map<string, ImageMeta[]>;
  apiKey: string;
  refFrameName: string;
  onRetranslate: (cards: Array<{ expressionId: string; korean: string }>) => Promise<void>;
  onRegenerateImages: (cards: Array<{ expressionId: string; korean: string; prompt: string }>) => Promise<void>;
  onSwap: (expressionId: string, imageHash: string) => void;
  onClose: () => void;
}

const MultiCardPanel: React.FC<MultiCardPanelProps> = ({
  cards, frameId, generatedImages, apiKey, refFrameName,
  onRetranslate, onRegenerateImages, onSwap, onClose,
}) => {
  const [isRetranslating, setIsRetranslating] = useState(false);
  const [showRetranslateConfirm, setShowRetranslateConfirm] = useState(false);
  const [showRegenPrompts, setShowRegenPrompts] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [prompts, setPrompts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    cards.forEach(c => {
      initial[c.expressionId] = c.korean.split('\n').map(l => l.split('=')[0].trim()).join(' ');
    });
    return initial;
  });

  const handleRetranslate = async () => {
    setShowRetranslateConfirm(false);
    setIsRetranslating(true);
    try {
      await onRetranslate(cards.map(c => ({ expressionId: c.expressionId, korean: c.korean })));
    } finally {
      setIsRetranslating(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerateImages(
        cards.map(c => ({
          expressionId: c.expressionId,
          korean: c.korean,
          prompt: prompts[c.expressionId] || '',
        }))
      );
    } finally {
      setIsRegenerating(false);
      setShowRegenPrompts(false);
    }
  };

  return (
    <div className="tab-content multi-card-panel">
      {/* Header */}
      <div className="multi-card-header">
        <span className="multi-card-badge">{cards.length} cards selected</span>
        <button className="btn-icon" onClick={onClose} title="Close">&times;</button>
      </div>

      {/* Tag bar */}
      <div className="multi-card-tags">
        {cards.map(c => (
          <span key={c.expressionId} className="multi-card-tag">
            {c.korean.split('\n')[0].substring(0, 20)}{c.korean.length > 20 ? '...' : ''}
          </span>
        ))}
      </div>

      {/* Translations section */}
      <div className="multi-card-section">
        <div className="multi-card-section-label">Translations</div>
        <div className="multi-card-translations">
          {cards.map(c => (
            <div key={c.expressionId} className="multi-card-translation-row">
              <span className="translation-ko">{c.korean.split('\n').join(' / ')}</span>
              <span className="translation-en">{c.en || '—'}</span>
            </div>
          ))}
        </div>
        {showRetranslateConfirm ? (
          <div className="multi-card-confirm">
            <span className="multi-card-confirm-text">
              {cards.length}개 카드를 재번역할까요?
            </span>
            <div className="multi-card-confirm-actions">
              <button className="btn btn-primary btn-sm" onClick={handleRetranslate} disabled={isRetranslating}>
                {isRetranslating ? '번역 중...' : '확인'}
              </button>
              <button className="btn btn-sm" onClick={() => setShowRetranslateConfirm(false)} disabled={isRetranslating}>
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-sm"
            onClick={() => setShowRetranslateConfirm(true)}
            disabled={isRetranslating || !apiKey}
            style={{ marginTop: 8, width: '100%' }}
          >
            {isRetranslating ? '번역 중...' : '일괄 재번역'}
          </button>
        )}
      </div>

      {/* Images section */}
      <div className="multi-card-section">
        <div className="multi-card-section-label">Images</div>
        {cards.map(c => {
          const images = generatedImages.get(c.expressionId) || [];
          return (
            <div key={c.expressionId} className="multi-card-image-row">
              <div className="multi-card-image-label">
                {c.korean.split('\n')[0].substring(0, 30)}{c.korean.length > 30 ? '...' : ''}
              </div>
              {images.length > 0 ? (
                <div className="multi-card-image-scroll">
                  {images.map((img, idx) => (
                    <div
                      key={img.imageHash}
                      className={`multi-card-thumb ${img.isActive ? 'active' : ''}`}
                      onClick={() => onSwap(c.expressionId, img.imageHash)}
                      title={img.isActive ? `#${idx + 1} (active)` : `#${idx + 1}`}
                    >
                      {img.imageBase64 ? (
                        <img src={`data:image/png;base64,${img.imageBase64}`} alt={`#${idx + 1}`} />
                      ) : (
                        <div className="multi-card-thumb-ph">#{idx + 1}</div>
                      )}
                      {img.isActive && <div className="multi-card-thumb-badge">Active</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="multi-card-no-images">No images</div>
              )}
            </div>
          );
        })}

        {/* Regen prompts area */}
        {showRegenPrompts ? (
          <div className="multi-card-regen-prompts">
            {cards.map(c => (
              <div key={c.expressionId} className="multi-card-regen-prompt-row">
                <label className="multi-card-regen-label">
                  {c.korean.split('\n')[0].substring(0, 25)}{c.korean.length > 25 ? '...' : ''}
                </label>
                <input
                  type="text"
                  value={prompts[c.expressionId] || ''}
                  onChange={e => setPrompts(prev => ({ ...prev, [c.expressionId]: e.target.value }))}
                  placeholder="Image prompt"
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleRegenerate}
                disabled={isRegenerating}
                style={{ flex: 1 }}
              >
                {isRegenerating ? '생성 중...' : '생성 시작'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setShowRegenPrompts(false)}
                disabled={isRegenerating}
                style={{ flex: 1 }}
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-sm"
            onClick={() => setShowRegenPrompts(true)}
            disabled={isRegenerating || !apiKey}
            style={{ marginTop: 8, width: '100%' }}
          >
            일괄 이미지 재생성
          </button>
        )}
      </div>
    </div>
  );
};

export default MultiCardPanel;
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 5: CSS Styles for MultiCardPanel

**Files:**
- Modify: `src/ui/styles/globals.css`

- [ ] **Step 1: Add multi-card panel styles**

Append to end of `globals.css`:

```css
/* Multi-Card Panel */
.multi-card-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.multi-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.multi-card-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-light);
  background: var(--bg);
  padding: 3px 8px;
  border-radius: 4px;
}

.multi-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.multi-card-tag {
  font-size: 10px;
  padding: 2px 8px;
  background: #EEF2FF;
  color: #4338CA;
  border-radius: 10px;
  white-space: nowrap;
}

.multi-card-section {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
}

.multi-card-section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-light);
  margin-bottom: 8px;
}

.multi-card-translations {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.multi-card-translation-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
}

.multi-card-translation-row:last-child {
  border-bottom: none;
}

.multi-card-confirm {
  margin-top: 8px;
  padding: 8px;
  background: #FFF8E1;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.multi-card-confirm-text {
  font-size: 12px;
  color: var(--text);
}

.multi-card-confirm-actions {
  display: flex;
  gap: 6px;
}

.multi-card-image-row {
  margin-bottom: 10px;
}

.multi-card-image-row:last-child {
  margin-bottom: 0;
}

.multi-card-image-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 4px;
}

.multi-card-image-scroll {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.multi-card-image-scroll::-webkit-scrollbar {
  height: 4px;
}

.multi-card-image-scroll::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 2px;
}

.multi-card-thumb {
  position: relative;
  width: 64px;
  height: 64px;
  min-width: 64px;
  border: 2px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s;
}

.multi-card-thumb:hover {
  border-color: var(--primary-dark);
}

.multi-card-thumb.active {
  border-color: var(--success);
}

.multi-card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.multi-card-thumb-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--text-light);
  background: var(--bg);
}

.multi-card-thumb-badge {
  position: absolute;
  bottom: 1px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 8px;
  background: var(--success);
  color: white;
  padding: 0px 4px;
  border-radius: 3px;
}

.multi-card-no-images {
  font-size: 11px;
  color: var(--text-light);
  padding: 8px 0;
}

.multi-card-regen-prompts {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.multi-card-regen-prompt-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.multi-card-regen-label {
  font-size: 10px;
  color: var(--text-light);
  font-weight: 500;
}

.multi-card-regen-prompt-row input {
  font-size: 11px;
  padding: 5px 8px;
}
```

- [ ] **Step 2: Build and verify everything compiles**

Run: `npm run build`
Expected: Build succeeds with no errors

---

### Task 6: Final Integration & Testing

- [ ] **Step 1: Build final**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 2: Manual test checklist**

1. Open Figma, run plugin
2. Create some cards with expressions
3. Select single card → verify card detail view shows with re-translate button and prompt input
4. Click re-translate → confirm dialog → translation updates
5. Modify prompt → regenerate → new images appear
6. Select multiple cards (shift+click or drag) → verify multi-card panel shows
7. Verify tag bar shows selected card Korean text
8. Verify translations listed for all selected cards
9. Click "일괄 재번역" → confirm → all cards re-translated
10. Click "일괄 이미지 재생성" → prompt inputs appear → modify → "생성 시작" → images generated sequentially
11. Verify images appear in horizontal scroll rows as they generate
12. Click image thumb to swap active image
13. Select non-card elements mixed with cards → only cards processed
14. Select KeyExpr frame → back to normal FRAME_SELECTED flow
