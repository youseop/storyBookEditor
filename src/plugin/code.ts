import { createMainFrame, hexToFigmaColor } from './frameBuilder';
import { buildCardGrid, applyCardLayout } from './cardGridBuilder';
import { createStorageFrame, storeImage, assignImage, assignImageToAllCards, swapImage } from './imageManager';
import { exportRefFrame } from './exportHelper';
import { handlePipelineMessage } from './pipelineHandler';
import type {
  UIToSandboxMessage,
  PluginSettings,
  ExpressionCard,
  ContentIdMap,
  ContentIdMapEntry,
  CardTransformMap,
  ImageTransform,
} from '../shared/messageTypes';
import {
  DEFAULT_FONT_FAMILY,
  FRAME_HEIGHT,
  HALF_PAGE_WIDTH,
  GUIDELINE_COLOR,
  CELL_WIDTH,
  CELL_HEIGHT,
  CELL_GAP,
  GRID_MARGIN_LEFT,
  GRID_START_Y,
  GRID_COLS,
  GRID_ROWS,
} from '../shared/constants';

const MAIN_FRAME_PREFIX = '[KeyExpr] Key Expressions';

function countGuides(): number {
  return figma.currentPage.findAll(
    function(n) { return n.name === 'center-guide-temp'; }
  ).length;
}

/**
 * Manual base64 encoder for Figma sandbox (no btoa available).
 */
function uint8ToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? chars[b2 & 63] : '=';
  }
  return result;
}

/**
 * Find the unified Image Storage frame on the current page.
 */
function findStorage(): FrameNode | null {
  // Primary: find by storageType marker
  const byMarker = figma.currentPage.findOne(
    (n) => n.type === 'FRAME' && n.getPluginData('storageType') === 'unified'
  ) as FrameNode | null;
  if (byMarker) return byMarker;

  // Legacy fallback: any frame starting with [KeyExpr] Storage or [KeyExpr] Image Storage
  return figma.currentPage.findOne(
    (n) => n.type === 'FRAME' && (n.name.startsWith('[KeyExpr] Storage') || n.name.startsWith('[KeyExpr] Image Storage'))
  ) as FrameNode | null;
}

/**
 * Find a KeyExpr frame by its Figma node ID, or fall back to first matching frame.
 */
function findKeyExprFrame(frameId?: string): FrameNode | null {
  if (frameId) {
    const node = figma.getNodeById(frameId);
    if (node && node.type === 'FRAME' && node.name.startsWith(MAIN_FRAME_PREFIX)) {
      return node as FrameNode;
    }
  }
  // Fallback: find first matching frame on current page
  return figma.currentPage.findOne(
    (n) => n.type === 'FRAME' && n.name.startsWith(MAIN_FRAME_PREFIX)
  ) as FrameNode | null;
}

/**
 * Normalize text for content→ID mapping: trim each line, remove empty, join with \n.
 */
function normalizeText(lines: string[]): string {
  return lines.map(l => l.trim()).filter(l => l.length > 0).join('\n');
}

/**
 * Auto-assign stored images to cards that don't have one yet.
 * Uses contentIdMap's imageIndex to pick the previously selected variant.
 * Falls back to the first stored image (index 0) if no selection recorded.
 * Image transforms are per-card (from cardTransforms), not per-expression.
 */
function autoAssignStoredImages(mainFrame: FrameNode): void {
  var storageFrame = findStorage();
  if (!storageFrame) return;

  var contentIdMap = readContentIdMap() || {};
  var cardTransforms = readCardTransforms();

  // Build map: expressionId → { index → imageHash }
  var storedMap = new Map<string, Map<number, string>>();
  var rects = storageFrame.findAll(
    function(n) { return n.type === 'RECTANGLE' && n.getPluginData('imageHash') !== ''; }
  ) as RectangleNode[];
  for (var i = 0; i < rects.length; i++) {
    var exprId = rects[i].getPluginData('expressionId');
    var hash = rects[i].getPluginData('imageHash');
    var idx = parseInt(rects[i].getPluginData('imageIndex') || '0', 10);
    if (exprId && hash) {
      var indexMap = storedMap.get(exprId) || new Map<number, string>();
      indexMap.set(idx, hash);
      storedMap.set(exprId, indexMap);
    }
  }
  if (storedMap.size === 0) return;

  // Build reverse lookups from contentIdMap
  var preferredMap = new Map<string, number>();
  var textToExprId = new Map<string, string>();
  var keys = Object.keys(contentIdMap);
  for (var ki = 0; ki < keys.length; ki++) {
    var entry = contentIdMap[keys[ki]];
    if (entry.imageIndex !== undefined) {
      preferredMap.set(String(entry.expressionId), entry.imageIndex);
    }
    textToExprId.set(keys[ki], String(entry.expressionId));
  }

  // Find cards without images and assign
  var cards = mainFrame.findAll(
    function(n) { return n.type === 'FRAME' && n.name.startsWith('[card:'); }
  ) as FrameNode[];

  for (var ci = 0; ci < cards.length; ci++) {
    var card = cards[ci];
    var cardExprId = card.getPluginData('expressionId');
    if (!cardExprId) continue;

    // Check if card already has an image
    var existingImg = card.findOne(
      function(n) { return n.type === 'RECTANGLE' && n.name.startsWith('[image:'); }
    );
    if (existingImg) continue;

    var indexMap = storedMap.get(cardExprId);
    var lookupExprId = cardExprId;

    // Fallback: if no stored images by expressionId, match by Korean text content
    if (!indexMap || indexMap.size === 0) {
      var textNode = card.findOne(
        function(n) { return n.name === 'card-text' && n.type === 'TEXT'; }
      ) as TextNode | null;
      if (textNode) {
        var koreanLines = textNode.characters.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
        var normalizedKey = koreanLines.join('\n');
        var mappedExprId = textToExprId.get(normalizedKey);
        if (mappedExprId && storedMap.has(mappedExprId)) {
          indexMap = storedMap.get(mappedExprId)!;
          lookupExprId = mappedExprId;
        }
      }
    }
    if (!indexMap || indexMap.size === 0) continue;

    // Pick preferred index from contentIdMap, fall back to 0
    var preferredIdx = preferredMap.get(lookupExprId);
    var targetHash = (preferredIdx !== undefined && indexMap.has(preferredIdx))
      ? indexMap.get(preferredIdx)!
      : indexMap.get(0) || indexMap.values().next().value;

    if (targetHash) {
      var imgFrame = card.findOne(
        function(n) { return n.type === 'FRAME' && (n.name === '[img:' + cardExprId + ']' || n.name === '[img]' || n.name.startsWith('[img:')); }
      ) as FrameNode | null;
      if (imgFrame) {
        imgFrame.name = '[img:' + cardExprId + ']';
        for (var ri = imgFrame.children.length - 1; ri >= 0; ri--) {
          imgFrame.children[ri].remove();
        }
        var newImgRect = figma.createRectangle();
        newImgRect.name = '[image:' + cardExprId + ']';
        newImgRect.resize(imgFrame.width, imgFrame.height);
        newImgRect.x = 0;
        newImgRect.y = 0;
        newImgRect.fills = [{ type: 'IMAGE', imageHash: targetHash, scaleMode: 'FIT' }];
        newImgRect.setPluginData('expressionId', cardExprId);
        newImgRect.setPluginData('imageHash', targetHash);
        imgFrame.fills = [];
        imgFrame.appendChild(newImgRect);

        // Apply saved per-card relative transform if available
        var savedTransform = cardTransforms[cardExprId];
        if (savedTransform) {
          applyTransformToRect(newImgRect, imgFrame, savedTransform);
        }
      }
    }
  }
}

/**
 * Read contentIdMap from storage frame.
 */
function readContentIdMap(): ContentIdMap | undefined {
  var storageFrame = findStorage();
  if (!storageFrame) return undefined;

  var mapJson = storageFrame.getPluginData('contentIdMap');
  if (!mapJson) return undefined;

  try {
    return JSON.parse(mapJson) as ContentIdMap;
  } catch {
    return undefined;
  }
}

/**
 * One-time migration: convert old card_N IDs to numeric expressionIds.
 * Updates contentIdMap, storage images, canvas cards, and cardTransforms.
 */
function migrateToNumericIds(): void {
  var storageFrame = findStorage();
  if (!storageFrame) return;
  if (storageFrame.getPluginData('migrationV2') === 'done') return;

  var mapJson = storageFrame.getPluginData('contentIdMap');
  if (!mapJson) {
    storageFrame.setPluginData('migrationV2', 'done');
    return;
  }

  var raw: Record<string, any>;
  try { raw = JSON.parse(mapJson); } catch { return; }

  // Detect if migration is needed
  var needsMigration = false;
  var keys = Object.keys(raw);
  for (var ki = 0; ki < keys.length; ki++) {
    var val = raw[keys[ki]];
    if (typeof val === 'string' || (val && val.cardId !== undefined)) {
      needsMigration = true;
      break;
    }
  }

  if (!needsMigration) {
    storageFrame.setPluginData('migrationV2', 'done');
    return;
  }

  // Build old→new mapping and migrate contentIdMap
  var oldToNew = new Map<string, string>();
  var migrated: ContentIdMap = {};
  var nextId = 0;

  for (var mi = 0; mi < keys.length; mi++) {
    var mval = raw[keys[mi]];
    var oldId: string;
    var en: string | undefined;
    var imageIndex: number | undefined;

    if (typeof mval === 'string') {
      oldId = mval;
    } else {
      oldId = mval.cardId || String(mval.expressionId || 0);
      en = mval.en;
      imageIndex = mval.imageIndex;
    }

    var newId = nextId++;
    oldToNew.set(oldId, String(newId));
    migrated[keys[mi]] = { expressionId: newId, en: en, imageIndex: imageIndex };
  }

  storageFrame.setPluginData('contentIdMap', JSON.stringify(migrated));

  // Migrate storage groups and rectangles
  var storeGroups = storageFrame.findAll(
    function(n) { return n.type === 'FRAME' && n.name.startsWith('[store:'); }
  ) as FrameNode[];

  for (var gi = 0; gi < storeGroups.length; gi++) {
    var group = storeGroups[gi];
    var oldGrpId = group.getPluginData('expressionId');
    var newGrpId = oldToNew.get(oldGrpId);
    if (newGrpId) {
      group.setPluginData('expressionId', newGrpId);
      group.name = group.name.replace('[store:' + oldGrpId + ']', '[store:' + newGrpId + ']');
    }
    // Update child rectangles
    for (var gci = 0; gci < group.children.length; gci++) {
      var child = group.children[gci];
      if (child.type === 'RECTANGLE') {
        var oldRectId = child.getPluginData('expressionId');
        var newRectId = oldToNew.get(oldRectId);
        if (newRectId) {
          child.setPluginData('expressionId', newRectId);
          child.name = child.name.replace('[store:' + oldRectId + ':', '[store:' + newRectId + ':');
        }
      }
    }
  }

  // Migrate canvas cards
  var allFrames = figma.currentPage.findAll(
    function(n) { return n.type === 'FRAME' && n.name.startsWith(MAIN_FRAME_PREFIX); }
  ) as FrameNode[];

  for (var fi = 0; fi < allFrames.length; fi++) {
    var cards = allFrames[fi].findAll(
      function(n) { return n.type === 'FRAME' && n.name.startsWith('[card:'); }
    ) as FrameNode[];

    for (var ci = 0; ci < cards.length; ci++) {
      var card = cards[ci];
      var oldCardId = card.getPluginData('expressionId');
      var newCardId = oldToNew.get(oldCardId);
      if (newCardId) {
        card.setPluginData('expressionId', newCardId);
        card.name = card.name.replace('[card:' + oldCardId + ']', '[card:' + newCardId + ']');

        var imgFrame = card.findOne(function(n) { return n.type === 'FRAME' && n.name.startsWith('[img:'); }) as FrameNode | null;
        if (imgFrame) {
          imgFrame.name = '[img:' + newCardId + ']';
          var imgRect = imgFrame.findOne(function(n) { return n.type === 'RECTANGLE' && n.name.startsWith('[image:'); }) as RectangleNode | null;
          if (imgRect) {
            imgRect.name = '[image:' + newCardId + ']';
            imgRect.setPluginData('expressionId', newCardId);
          }
        }
      }
    }
  }

  // Migrate cardTransforms
  var tJson = storageFrame.getPluginData('cardTransforms');
  if (tJson) {
    try {
      var oldT = JSON.parse(tJson);
      var newT: Record<string, any> = {};
      var tKeys = Object.keys(oldT);
      for (var ti = 0; ti < tKeys.length; ti++) {
        var newTKey = oldToNew.get(tKeys[ti]) || tKeys[ti];
        newT[newTKey] = oldT[tKeys[ti]];
      }
      storageFrame.setPluginData('cardTransforms', JSON.stringify(newT));
    } catch {}
  }

  storageFrame.setPluginData('migrationV2', 'done');
  updateContentIdMapDisplay(storageFrame, migrated);
}

/**
 * Read per-card image transforms from storage frame.
 * Each card instance gets its own position/size for its image.
 */
function readCardTransforms(): CardTransformMap {
  var storageFrame = findStorage();
  if (!storageFrame) return {};

  var json = storageFrame.getPluginData('cardTransforms');
  if (!json) return {};

  try {
    var raw = JSON.parse(json) as Record<string, any>;
    // Migrate old {scale} format → {scaleX, scaleY}
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) {
      var t = raw[keys[i]];
      if (t.scale !== undefined && t.scaleX === undefined) {
        t.scaleX = t.scale;
        t.scaleY = t.scale;
        delete t.scale;
      }
    }
    return raw as CardTransformMap;
  } catch {
    return {};
  }
}

/**
 * Save per-card image transforms to storage frame and update display.
 */
function saveCardTransforms(transforms: CardTransformMap): void {
  var storageFrame = findStorage();
  if (!storageFrame) return;
  storageFrame.setPluginData('cardTransforms', JSON.stringify(transforms));
  updateCardTransformsDisplay(storageFrame, transforms);
}

/**
 * Apply a relative transform to an image rectangle inside its parent frame.
 */
function applyTransformToRect(
  imgRect: RectangleNode,
  imgFrame: FrameNode,
  transform: ImageTransform,
): void {
  var fW = imgFrame.width;
  var fH = imgFrame.height;
  var newW = fW * transform.scaleX;
  var newH = fH * transform.scaleY;
  var newX = (fW - newW) / 2 + transform.offsetX * fW;
  var newY = (fH - newH) / 2 + transform.offsetY * fH;
  imgRect.resize(newW, newH);
  imgRect.x = newX;
  imgRect.y = newY;
}

/**
 * Re-apply saved transform to all cards with the given expressionId.
 * Called after image swap/assign to restore user's zoom/pan settings.
 */
function reapplyTransformToCards(expressionId: string): void {
  var cardTransforms = readCardTransforms();
  var transform = cardTransforms[expressionId];
  if (!transform) return;

  var allFrames = figma.currentPage.findAll(
    function(n) { return n.type === 'FRAME' && n.name.startsWith(MAIN_FRAME_PREFIX); }
  ) as FrameNode[];

  for (var fi = 0; fi < allFrames.length; fi++) {
    var cards = allFrames[fi].findAll(
      function(n) { return n.type === 'FRAME' && n.getPluginData('expressionId') === expressionId; }
    ) as FrameNode[];

    for (var ci = 0; ci < cards.length; ci++) {
      var imgFrame = cards[ci].findOne(
        function(n) { return n.type === 'FRAME' && n.name.startsWith('[img:'); }
      ) as FrameNode | null;
      if (!imgFrame) continue;

      var imgRect = imgFrame.findOne(
        function(n) { return n.type === 'RECTANGLE' && n.name.startsWith('[image:'); }
      ) as RectangleNode | null;
      if (!imgRect) continue;

      applyTransformToRect(imgRect, imgFrame, transform);
    }
  }
}

/**
 * Render cardTransforms as formatted text node inside the storage frame.
 */
function updateCardTransformsDisplay(
  storageFrame: FrameNode,
  transforms: CardTransformMap,
): void {
  const DISPLAY_NAME = '[cardTransforms]';

  var displayNode = storageFrame.findOne(
    function(n) { return n.type === 'TEXT' && n.name === DISPLAY_NAME; }
  ) as TextNode | null;

  var tKeys = Object.keys(transforms);
  var displayText: string;
  if (tKeys.length === 0) {
    displayText = '── cardTransforms ──\n{}';
  } else {
    var lines = ['── cardTransforms ──', '{'];
    for (var i = 0; i < tKeys.length; i++) {
      var t = transforms[tKeys[i]];
      var comma = i < tKeys.length - 1 ? ',' : '';
      lines.push('  "' + tKeys[i] + '": { sx:' + t.scaleX + ', sy:' + t.scaleY + ', x:' + t.offsetX + ', y:' + t.offsetY + ' }' + comma);
    }
    lines.push('}');
    displayText = lines.join('\n');
  }

  if (!displayNode) {
    displayNode = figma.createText();
    displayNode.name = DISPLAY_NAME;
    storageFrame.appendChild(displayNode);
  }

  // Position 500px to the right of contentIdMap display, same y
  var mapDisplay = storageFrame.findOne(
    function(n) { return n.type === 'TEXT' && n.name === '[contentIdMap]'; }
  ) as TextNode | null;
  var xPos = mapDisplay ? mapDisplay.x + 500 : 510;
  var yPos = mapDisplay ? mapDisplay.y : 10;

  figma.loadFontAsync({ family: 'Inter', style: 'Regular' }).then(function() {
    displayNode!.fontName = { family: 'Inter', style: 'Regular' };
    displayNode!.fontSize = 10;
    displayNode!.characters = displayText;
    displayNode!.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
    displayNode!.x = xPos;
    displayNode!.y = yPos;
  });
}

/**
 * Merge entries into contentIdMap in storage frame.
 * Only called on translation or image generation — NOT on every layout update.
 */
function mergeContentIdMap(
  entries: { normalizedText: string; expressionId: number; en?: string; imageIndex?: number }[],
): ContentIdMap | undefined {
  var storageFrame = findStorage();
  if (!storageFrame) return undefined;

  // Read existing map
  var existing = readContentIdMap() || {};

  // Merge new entries (preserve fields not provided)
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry.normalizedText) continue;
    var prev = existing[entry.normalizedText];
    existing[entry.normalizedText] = {
      expressionId: entry.expressionId,
      en: entry.en !== undefined ? entry.en : (prev ? prev.en : undefined),
      imageIndex: entry.imageIndex !== undefined ? entry.imageIndex : (prev ? prev.imageIndex : undefined),
    };
  }

  storageFrame.setPluginData('contentIdMap', JSON.stringify(existing));

  // Update visible display
  updateContentIdMapDisplay(storageFrame, existing);

  return existing;
}

/**
 * Render contentIdMap as formatted JSON text node inside the storage frame.
 */
function updateContentIdMapDisplay(
  storageFrame: FrameNode,
  map: ContentIdMap,
): void {
  const DISPLAY_NAME = '[contentIdMap]';

  var displayNode = storageFrame.findOne(
    (n) => n.type === 'TEXT' && n.name === DISPLAY_NAME
  ) as TextNode | null;

  // Build pretty JSON display
  var keys = Object.keys(map);
  var displayText: string;
  if (keys.length === 0) {
    displayText = '── contentIdMap ──\n{}';
  } else {
    var jsonLines = ['── contentIdMap ──', '{'];
    for (var i = 0; i < keys.length; i++) {
      var content = keys[i].replace(/\n/g, ' / ');
      var entry = map[keys[i]];
      var entryParts = [`"exprId": ${entry.expressionId}`];
      if (entry.en) entryParts.push(`"en": "${entry.en}"`);
      if (entry.imageIndex !== undefined) entryParts.push(`"img": #${entry.imageIndex}`);
      var comma = i < keys.length - 1 ? ',' : '';
      jsonLines.push(`  "${content}": { ${entryParts.join(', ')} }${comma}`);
    }
    jsonLines.push('}');
    displayText = jsonLines.join('\n');
  }

  if (!displayNode) {
    displayNode = figma.createText();
    displayNode.name = DISPLAY_NAME;
    storageFrame.insertChild(0, displayNode);
  }

  figma.loadFontAsync({ family: 'Inter', style: 'Regular' }).then(() => {
    displayNode!.fontName = { family: 'Inter', style: 'Regular' };
    displayNode!.fontSize = 10;
    displayNode!.characters = displayText;
    displayNode!.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
    displayNode!.x = 10;
    displayNode!.y = 10;
  });
}

figma.showUI(__html__, { width: 480, height: 640 });

// Run one-time migration from old card_N IDs to numeric expressionIds
migrateToNumericIds();

// ---- Document change listener for image transform tracking & card snap-to-grid ----
let docChangeTimer: ReturnType<typeof setTimeout> | null = null;
let cardSnapTimer: ReturnType<typeof setTimeout> | null = null;
var pendingSnapCardIds = new Set<string>();
let snapInProgress = false;

figma.on('documentchange', (event) => {
  var needImageUpdate = false;

  for (var ci = 0; ci < event.documentChanges.length; ci++) {
    var change = event.documentChanges[ci];
    if (change.type !== 'PROPERTY_CHANGE') continue;
    var props = (change as any).properties as string[] | undefined;
    // Quick check: any geometry or parent property changed?
    var hasGeometry = !props || props.indexOf('x') !== -1 || props.indexOf('y') !== -1 ||
        props.indexOf('width') !== -1 || props.indexOf('height') !== -1;
    var hasParentChange = props && props.indexOf('parent') !== -1;
    if (!hasGeometry && !hasParentChange) continue;

    var nodeId = (change as any).id as string;
    if (!nodeId) continue;
    var node: BaseNode | null;
    try { node = figma.getNodeById(nodeId); } catch { continue; }
    if (!node) continue;

    // Image transform tracking: [image:*] RECTANGLE
    if (node.type === 'RECTANGLE' && node.name.startsWith('[image:')) {
      needImageUpdate = true;
    }

    // Card snap-to-grid: [card:*] FRAME (position or parent changes)
    if (node.type === 'FRAME' && node.name.startsWith('[card:') && !snapInProgress) {
      var hasXY = !props || props.indexOf('x') !== -1 || props.indexOf('y') !== -1;
      var hasParent = !props || props.indexOf('parent') !== -1;
      if (hasXY || hasParent) {
        pendingSnapCardIds.add(node.id);
      }
    }
  }

  if (needImageUpdate) {
    if (docChangeTimer) clearTimeout(docChangeTimer);
    docChangeTimer = setTimeout(function() {
      docChangeTimer = null;
      updateImageTransforms();
    }, 500);
  }

  if (pendingSnapCardIds.size > 0) {
    if (cardSnapTimer) clearTimeout(cardSnapTimer);
    cardSnapTimer = setTimeout(function() {
      cardSnapTimer = null;
      var ids = pendingSnapCardIds;
      pendingSnapCardIds = new Set<string>();
      snapCardsToGrid(ids);
    }, 300);
  }
});

function updateImageTransforms(): void {
  // Find all [image:*] rectangles across all KeyExpr frames
  var keyExprFrames = figma.currentPage.findAll(
    function(n) { return n.type === 'FRAME' && n.name.startsWith(MAIN_FRAME_PREFIX); }
  ) as FrameNode[];

  var cardTransforms = readCardTransforms();
  var changed = false;

  for (var fi = 0; fi < keyExprFrames.length; fi++) {
    var imgRects = keyExprFrames[fi].findAll(
      function(n) { return n.type === 'RECTANGLE' && n.name.startsWith('[image:'); }
    ) as RectangleNode[];

    for (var ri = 0; ri < imgRects.length; ri++) {
      var imgRect = imgRects[ri];
      // Find parent [img:] frame
      var imgFrame = imgRect.parent;
      if (!imgFrame || imgFrame.type !== 'FRAME') continue;
      var cardFrame = imgFrame.parent;
      if (!cardFrame || cardFrame.type !== 'FRAME' || !cardFrame.name.startsWith('[card:')) continue;

      var cardExprId = (cardFrame as FrameNode).getPluginData('expressionId');
      if (!cardExprId) continue;

      var fW = (imgFrame as FrameNode).width;
      var fH = (imgFrame as FrameNode).height;
      if (fW === 0 || fH === 0) continue;

      // Compute relative transform
      var scaleX = imgRect.width / fW;
      var scaleY = imgRect.height / fH;
      var imgCenterX = imgRect.x + imgRect.width / 2;
      var imgCenterY = imgRect.y + imgRect.height / 2;
      var offsetX = (imgCenterX - fW / 2) / fW;
      var offsetY = (imgCenterY - fH / 2) / fH;

      // Round to 4 decimals to avoid noise
      scaleX = Math.round(scaleX * 10000) / 10000;
      scaleY = Math.round(scaleY * 10000) / 10000;
      offsetX = Math.round(offsetX * 10000) / 10000;
      offsetY = Math.round(offsetY * 10000) / 10000;

      // Only update if transform actually changed
      var existing = cardTransforms[cardExprId];
      if (existing && existing.scaleX === scaleX && existing.scaleY === scaleY &&
          existing.offsetX === offsetX && existing.offsetY === offsetY) continue;

      cardTransforms[cardExprId] = { scaleX, scaleY, offsetX, offsetY };
      changed = true;
    }
  }

  if (changed) {
    saveCardTransforms(cardTransforms);
  }
}

/**
 * Build a 2D occupancy grid for a given page within a parent frame.
 * Cells occupied by [card:*] children are marked true.
 * Cards in excludeNodeIds are skipped (they are being moved).
 */
function buildOccupancyGrid(
  parent: FrameNode,
  page: number,
  excludeNodeIds: Set<string>
): boolean[][] {
  var step_x = CELL_WIDTH + CELL_GAP;
  var step_y = CELL_HEIGHT + CELL_GAP;
  var pageOffsetX = page * HALF_PAGE_WIDTH;

  // Create GRID_COLS x GRID_ROWS grid initialized to false
  var grid: boolean[][] = [];
  for (var c = 0; c < GRID_COLS; c++) {
    grid[c] = [];
    for (var r = 0; r < GRID_ROWS; r++) {
      grid[c][r] = false;
    }
  }

  // Iterate over children and mark occupied cells
  for (var i = 0; i < parent.children.length; i++) {
    var child = parent.children[i];
    if (child.type !== 'FRAME') continue;
    if (child.name === 'center-guide-temp') continue;

    var childFrame = child as FrameNode;
    var isCard = child.name.startsWith('[card:');

    // Skip excluded cards (being moved), but never skip obstacles
    if (isCard && excludeNodeIds.has(child.id)) continue;

    if (isCard) {
      // Card: determine page by center, calculate grid position
      var childPage = (childFrame.x + childFrame.width / 2) >= HALF_PAGE_WIDTH ? 1 : 0;
      if (childPage !== page) continue;

      var localX = childFrame.x - pageOffsetX - GRID_MARGIN_LEFT;
      var localY = childFrame.y - GRID_START_Y;
      var col = Math.round(localX / step_x);
      var row = Math.round(localY / step_y);

      var colSpan = Math.max(1, Math.round((childFrame.width + CELL_GAP) / step_x));
      var rowSpan = Math.max(1, Math.round((childFrame.height + CELL_GAP) / step_y));

      for (var dc = 0; dc < colSpan; dc++) {
        for (var dr = 0; dr < rowSpan; dr++) {
          var gc = col + dc;
          var gr = row + dr;
          if (gc >= 0 && gc < GRID_COLS && gr >= 0 && gr < GRID_ROWS) {
            grid[gc][gr] = true;
          }
        }
      }
    } else {
      // Non-card obstacle frame: mark overlapping cells
      var localLeft = childFrame.x - pageOffsetX - GRID_MARGIN_LEFT;
      var localRight = childFrame.x + childFrame.width - pageOffsetX - GRID_MARGIN_LEFT;
      var localTop = childFrame.y - GRID_START_Y;
      var localBottom = childFrame.y + childFrame.height - GRID_START_Y;

      if (localRight <= 0 || localLeft >= GRID_COLS * step_x) continue;
      if (localBottom <= 0 || localTop >= GRID_ROWS * step_y) continue;

      for (var oc = 0; oc < GRID_COLS; oc++) {
        var cellLeft = oc * step_x;
        var cellRight = cellLeft + CELL_WIDTH;
        if (cellRight <= localLeft || cellLeft >= localRight) continue;

        for (var or2 = 0; or2 < GRID_ROWS; or2++) {
          var cellTop = or2 * step_y;
          var cellBottom = cellTop + CELL_HEIGHT;
          if (cellBottom <= localTop || cellTop >= localBottom) continue;

          grid[oc][or2] = true;
        }
      }
    }
  }

  return grid;
}

/**
 * Find the nearest empty position on the grid that can fit a card of given span.
 * Uses Manhattan distance expansion, preferring same row → right → below.
 * Returns null if no empty position found (grid full).
 */
function findNearestEmpty(
  grid: boolean[][],
  targetCol: number,
  targetRow: number,
  colSpan: number,
  rowSpan: number
): { col: number; row: number } | null {
  var maxDist = GRID_COLS + GRID_ROWS;

  for (var d = 0; d <= maxDist; d++) {
    // Collect candidates at Manhattan distance d, sorted by reading order
    var candidates: { col: number; row: number }[] = [];

    for (var dc = -d; dc <= d; dc++) {
      var drAbs = d - Math.abs(dc);
      // Two possible dr values for this dc (positive and negative), except when drAbs=0
      var drValues = drAbs === 0 ? [0] : [-drAbs, drAbs];

      for (var dri = 0; dri < drValues.length; dri++) {
        var c = targetCol + dc;
        var r = targetRow + drValues[dri];

        // Check bounds for the full span
        if (c < 0 || c + colSpan > GRID_COLS) continue;
        if (r < 0 || r + rowSpan > GRID_ROWS) continue;

        candidates.push({ col: c, row: r });
      }
    }

    // Sort candidates: same row first, then left-to-right, then top-to-bottom
    candidates.sort(function(a, b) {
      // Prefer same row as target
      var aOnRow = a.row === targetRow ? 0 : 1;
      var bOnRow = b.row === targetRow ? 0 : 1;
      if (aOnRow !== bOnRow) return aOnRow - bOnRow;
      // Then by row (top first)
      if (a.row !== b.row) return a.row - b.row;
      // Then by column (left first, preferring right of target)
      return a.col - b.col;
    });

    for (var ci = 0; ci < candidates.length; ci++) {
      var cand = candidates[ci];
      var fits = true;

      // Check all cells in the span are empty
      for (var sc = 0; sc < colSpan && fits; sc++) {
        for (var sr = 0; sr < rowSpan && fits; sr++) {
          if (grid[cand.col + sc][cand.row + sr]) {
            fits = false;
          }
        }
      }

      if (fits) return cand;
    }
  }

  return null;
}

/**
 * Convert a card's position to a linear index for ordering comparison.
 * Linear order: page → row → col (reading order).
 */
function cardLinearIndex(card: FrameNode): number {
  var step_x = CELL_WIDTH + CELL_GAP;
  var step_y = CELL_HEIGHT + CELL_GAP;
  var page = (card.x + card.width / 2) >= HALF_PAGE_WIDTH ? 1 : 0;
  var pageOffsetX = page * HALF_PAGE_WIDTH;
  var col = Math.round((card.x - pageOffsetX - GRID_MARGIN_LEFT) / step_x);
  var row = Math.round((card.y - GRID_START_Y) / step_y);
  col = Math.max(0, Math.min(GRID_COLS - 1, col));
  row = Math.max(0, Math.min(GRID_ROWS - 1, row));
  return page * GRID_ROWS * GRID_COLS + row * GRID_COLS + col;
}

/**
 * Rescue a card that got nested inside another card.
 * Reparents it back to the main KeyExpr frame with correct absolute position.
 * Returns the main frame, or null if rescue failed.
 */
function rescueNestedCard(card: FrameNode): FrameNode | null {
  var parent = card.parent;
  if (!parent || parent.type !== 'FRAME') return null;
  if ((parent as FrameNode).name.startsWith(MAIN_FRAME_PREFIX)) return parent as FrameNode;

  var absX = card.x;
  var absY = card.y;
  var ancestor: BaseNode | null = parent;
  var mainFrame: FrameNode | null = null;
  while (ancestor && ancestor.type === 'FRAME') {
    if ((ancestor as FrameNode).name.startsWith(MAIN_FRAME_PREFIX)) {
      mainFrame = ancestor as FrameNode;
      break;
    }
    absX += (ancestor as FrameNode).x;
    absY += (ancestor as FrameNode).y;
    ancestor = (ancestor as FrameNode).parent;
  }
  if (!mainFrame) return null;
  mainFrame.appendChild(card);
  card.x = absX;
  card.y = absY;
  return mainFrame;
}

/**
 * iPhone-style card reorder: insert moved card at its drop position,
 * push others right, wrap to next row.
 * Returns true if reorder was performed.
 */
function reorderCard(movedCard: FrameNode, mainFrame: FrameNode): boolean {
  // Collect all card frames
  var allCards: FrameNode[] = [];
  for (var i = 0; i < mainFrame.children.length; i++) {
    var child = mainFrame.children[i];
    if (child.type === 'FRAME' && child.name.startsWith('[card:')) {
      allCards.push(child as FrameNode);
    }
  }
  if (allCards.length <= 1) return false;

  // Get current order of OTHER cards (they're still at their grid positions)
  var otherCards = allCards.filter(function(c) { return c.id !== movedCard.id; });
  otherCards.sort(function(a, b) { return cardLinearIndex(a) - cardLinearIndex(b); });

  // Find insertion index based on the moved card's drop position
  var movedIdx = cardLinearIndex(movedCard);
  var insertIdx = otherCards.length;
  for (var i = 0; i < otherCards.length; i++) {
    if (movedIdx <= cardLinearIndex(otherCards[i])) {
      insertIdx = i;
      break;
    }
  }

  // Build new order
  var newOrder = otherCards.slice();
  newOrder.splice(insertIdx, 0, movedCard);

  // Check if order actually changed
  var origOrder = allCards.slice().sort(function(a, b) {
    return cardLinearIndex(a) - cardLinearIndex(b);
  });
  var orderChanged = false;
  for (var i = 0; i < newOrder.length; i++) {
    if (newOrder[i].id !== origOrder[i].id) { orderChanged = true; break; }
  }
  if (!orderChanged) return false;

  // Reflow all cards in new order
  reflowCards(newOrder);
  return true;
}

/**
 * Place cards sequentially on the grid: left→right, top→bottom.
 * Wraps to next row when a card doesn't fit, next page when rows overflow.
 */
function reflowCards(cards: FrameNode[]): void {
  var step_x = CELL_WIDTH + CELL_GAP;
  var step_y = CELL_HEIGHT + CELL_GAP;

  var page = 0;
  var gridRow = 0;
  var col = 0;
  var maxRowSpan = 0;

  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    var colSpan = Math.max(1, Math.round((card.width + CELL_GAP) / step_x));
    var rowSpan = Math.max(1, Math.round((card.height + CELL_GAP) / step_y));

    // Doesn't fit in current row → wrap to next row
    if (col + colSpan > GRID_COLS) {
      gridRow += maxRowSpan;
      col = 0;
      maxRowSpan = 0;
    }

    // Doesn't fit on current page → next page
    if (gridRow + rowSpan > GRID_ROWS) {
      page++;
      gridRow = 0;
      col = 0;
      maxRowSpan = 0;
    }

    var pageOffsetX = page * HALF_PAGE_WIDTH;
    card.x = pageOffsetX + GRID_MARGIN_LEFT + col * step_x;
    card.y = GRID_START_Y + gridRow * step_y;

    col += colSpan;
    maxRowSpan = Math.max(maxRowSpan, rowSpan);
  }
}

/**
 * Snap moved cards to the grid.
 * Single card: iPhone-style reorder (insert at drop position, reflow others).
 * Multi card or no reorder: snap to nearest empty grid cell.
 */
function snapCardsToGrid(cardIds: Set<string>): void {
  if (buildInProgress) return;
  snapInProgress = true;

  try {
    var step_x = CELL_WIDTH + CELL_GAP;
    var step_y = CELL_HEIGHT + CELL_GAP;

    // Phase 1: Resolve moved cards (rescue nested ones)
    var movedInfos: { card: FrameNode; mainFrame: FrameNode }[] = [];

    cardIds.forEach(function(cardId) {
      var node: BaseNode | null;
      try { node = figma.getNodeById(cardId); } catch { return; }
      if (!node || node.type !== 'FRAME') return;
      var card = node as FrameNode;
      if (!card.name.startsWith('[card:')) return;

      var mainFrame = rescueNestedCard(card);
      if (!mainFrame) return;

      movedInfos.push({ card: card, mainFrame: mainFrame });
    });

    if (movedInfos.length === 0) return;

    // Snap each card to nearest empty grid cell
    var movedNodeIds = new Set<string>();
    for (var i = 0; i < movedInfos.length; i++) {
      movedNodeIds.add(movedInfos[i].card.id);
    }

    var gridCache: { [key: string]: boolean[][] } = {};

    for (var i = 0; i < movedInfos.length; i++) {
      var info = movedInfos[i];
      var card = info.card;

      var colSpan = Math.max(1, Math.round((card.width + CELL_GAP) / step_x));
      var rowSpan = Math.max(1, Math.round((card.height + CELL_GAP) / step_y));

      var page = (card.x + card.width / 2) >= HALF_PAGE_WIDTH ? 1 : 0;
      var pageOffsetX = page * HALF_PAGE_WIDTH;

      var localX = card.x - pageOffsetX - GRID_MARGIN_LEFT;
      var localY = card.y - GRID_START_Y;
      var col = Math.round(localX / step_x);
      var row = Math.round(localY / step_y);

      col = Math.max(0, Math.min(GRID_COLS - colSpan, col));
      row = Math.max(0, Math.min(GRID_ROWS - rowSpan, row));

      var cacheKey = info.mainFrame.id + ':' + page;
      if (!gridCache[cacheKey]) {
        gridCache[cacheKey] = buildOccupancyGrid(info.mainFrame, page, movedNodeIds);
      }
      var grid = gridCache[cacheKey];

      var result = findNearestEmpty(grid, col, row, colSpan, rowSpan);
      var finalCol = result ? result.col : col;
      var finalRow = result ? result.row : row;

      // Mark placed card in occupancy grid (for multi-card moves)
      for (var dc = 0; dc < colSpan; dc++) {
        for (var dr = 0; dr < rowSpan; dr++) {
          var gc = finalCol + dc;
          var gr = finalRow + dr;
          if (gc >= 0 && gc < GRID_COLS && gr >= 0 && gr < GRID_ROWS) {
            grid[gc][gr] = true;
          }
        }
      }

      var snapX = pageOffsetX + GRID_MARGIN_LEFT + finalCol * step_x;
      var snapY = GRID_START_Y + finalRow * step_y;

      if (Math.abs(card.x - snapX) > 1 || Math.abs(card.y - snapY) > 1) {
        card.x = snapX;
        card.y = snapY;
      }
    }
  } finally {
    snapInProgress = false;
  }
}

// ---- Selection change listener ----
// Detect when user selects a KeyExpr frame and extract expressions from it
let selectionSeq = 0;

figma.on('selectionchange', () => {
  selectionSeq++;
  handleSelectionChange(selectionSeq);
});

async function handleCardSelected(card: FrameNode, seq: number): Promise<void> {
  var expressionId = card.getPluginData('expressionId');
  if (!expressionId) return;

  // Find parent KeyExpr frame
  var parent = card.parent;
  while (parent && parent.type === 'FRAME' && !(parent as FrameNode).name.startsWith(MAIN_FRAME_PREFIX)) {
    parent = parent.parent;
  }
  var frameId = (parent && parent.type === 'FRAME') ? parent.id : '';

  // Read Korean and English text
  var koNode = card.findOne(function(n) { return n.name === 'card-text' && n.type === 'TEXT'; }) as TextNode | null;
  var enNode = card.findOne(function(n) { return n.name === 'card-text-en' && n.type === 'TEXT'; }) as TextNode | null;
  var korean = koNode ? koNode.characters : '';
  var en = enNode ? enNode.characters : '';

  // Active image hash on this card
  var activeImgRect = card.findOne(function(n) { return n.type === 'RECTANGLE' && n.name.startsWith('[image:'); }) as RectangleNode | null;
  var activeImageHash = activeImgRect ? activeImgRect.getPluginData('imageHash') : undefined;

  // Stored images for this expressionId from storage
  var storedImages: { expressionId: string; imageHash: string; prompt: string; index: number; isActive: boolean }[] = [];
  var storageFrame = findStorage();
  var storageRects: RectangleNode[] = [];

  if (storageFrame) {
    storageRects = storageFrame.findAll(
      function(n) { return n.type === 'RECTANGLE' && n.getPluginData('expressionId') === expressionId && n.getPluginData('imageHash') !== ''; }
    ) as RectangleNode[];
    for (var ri = 0; ri < storageRects.length; ri++) {
      var rect = storageRects[ri];
      var hash = rect.getPluginData('imageHash');
      storedImages.push({
        expressionId: expressionId,
        imageHash: hash,
        prompt: rect.getPluginData('prompt'),
        index: parseInt(rect.getPluginData('imageIndex') || '0', 10),
        isActive: hash === activeImageHash,
      });
    }
  }

  figma.ui.postMessage({
    type: 'CARD_SELECTED',
    frameId: frameId,
    expressionId: expressionId,
    korean: korean,
    en: en,
    storedImages: storedImages,
    activeImageHash: activeImageHash || undefined,
  });

  // Async: send thumbnails
  for (var ti = 0; ti < storageRects.length; ti++) {
    if (seq !== selectionSeq) return;
    try {
      var tRect = storageRects[ti];
      var tBytes = await tRect.exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: 160 } });
      if (seq !== selectionSeq) return;
      var tBase64 = uint8ToBase64(tBytes);
      figma.ui.postMessage({
        type: 'IMAGE_THUMBNAIL',
        expressionId: expressionId,
        imageHash: tRect.getPluginData('imageHash'),
        imageBase64: tBase64,
      });
    } catch {}
  }
}

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

    // Skip duplicate expressionIds
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

  // Extract card text from the frame
  const cardFrames = node.findAll(
    (n) => n.type === 'FRAME' && n.name.startsWith('[card:')
  ) as FrameNode[];

  if (cardFrames.length === 0) {
    figma.ui.postMessage({
      type: 'FRAME_SELECTED',
      frameId: node.id,
      expressionText: '',
      enTextPairs: [],
      storedImages: [],
    });
    return;
  }

  const sorted = cardFrames.slice().sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  const expressions: string[] = [];
  const enTextPairs: { expressionId: string; korean: string; en: string }[] = [];
  for (var i = 0; i < sorted.length; i++) {
    var card = sorted[i];
    var textNode = card.findOne(
      (n) => n.name === 'card-text' && n.type === 'TEXT'
    ) as TextNode | null;
    var enTextNode = card.findOne(
      (n) => n.name === 'card-text-en' && n.type === 'TEXT'
    ) as TextNode | null;
    if (textNode) {
      var koreanText = textNode.characters;
      var exprId = card.getPluginData('expressionId') || String(i);
      expressions.push(koreanText);
      enTextPairs.push({
        expressionId: exprId,
        korean: koreanText,
        en: enTextNode ? enTextNode.characters : '',
      });
    }
  }

  var expressionText = expressions.join('\n\n');

  // Scan Image Storage for stored images (metadata only — thumbnails sent async)
  var storedImages: { expressionId: string; imageHash: string; prompt: string; index: number; isActive: boolean }[] = [];
  var storageFrame = findStorage();
  var storageRects: RectangleNode[] = [];

  if (storageFrame) {
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

    storageRects = storageFrame.findAll(
      function(n) { return n.type === 'RECTANGLE' && n.getPluginData('imageHash') !== ''; }
    ) as RectangleNode[];
    for (var ri = 0; ri < storageRects.length; ri++) {
      var rect = storageRects[ri];
      var hash = rect.getPluginData('imageHash');
      storedImages.push({
        expressionId: rect.getPluginData('expressionId'),
        imageHash: hash,
        prompt: rect.getPluginData('prompt'),
        index: parseInt(rect.getPluginData('imageIndex') || '0', 10),
        isActive: activeHashes.has(hash),
      });
    }
  }

  // Read persistent content→ID mapping from storage frame (with migration)
  var contentIdMap = readContentIdMap();

  // Send metadata immediately so UI can render structure
  figma.ui.postMessage({
    type: 'FRAME_SELECTED',
    frameId: node.id,
    expressionText: expressionText,
    enTextPairs: enTextPairs,
    storedImages: storedImages,
    contentIdMap: contentIdMap,
  });

  // Async: export thumbnails from storage rectangles
  for (var ti = 0; ti < storageRects.length; ti++) {
    if (seq !== selectionSeq) return; // selection changed, abort
    try {
      var tRect = storageRects[ti];
      var tBytes = await tRect.exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: 160 } });
      if (seq !== selectionSeq) return;
      // Manual base64 encode (Figma sandbox has no btoa)
      var tBase64 = uint8ToBase64(tBytes);
      figma.ui.postMessage({
        type: 'IMAGE_THUMBNAIL',
        expressionId: tRect.getPluginData('expressionId'),
        imageHash: tRect.getPluginData('imageHash'),
        imageBase64: tBase64,
      });
    } catch {
      // Skip failed exports silently
    }
  }
}

// Prevent concurrent UPDATE_LAYOUT / GENERATE_LAYOUT builds
let buildInProgress = false;
let pendingBuildMsg: UIToSandboxMessage | null = null;

async function handleMessage(msg: UIToSandboxMessage): Promise<void> {
  // Try pipeline handler first
  const handled = await handlePipelineMessage(msg);
  if (handled) return;

  switch (msg.type) {
    case 'GENERATE_LAYOUT': {
      try {
        const { expressions, settings, frameId } = msg;

        // Remove existing frame if targeting a specific one
        if (frameId) {
          const existingFrame = findKeyExprFrame(frameId);
          if (existingFrame) {
            existingFrame.remove();
          }
        }

        // Build the main frame with title and guidelines
        const mainFrame = await createMainFrame(settings);

        // Place expression cards in the grid
        const placements = await buildCardGrid(mainFrame, expressions, settings);

        // Read existing content→ID mapping (read-only, no write on layout)
        const contentIdMap = readContentIdMap();

        // Scroll into view
        figma.viewport.scrollAndZoomIntoView([mainFrame]);

        figma.ui.postMessage({
          type: 'LAYOUT_CREATED',
          placements,
          frameId: mainFrame.id,
          contentIdMap,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to generate layout',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'UPDATE_LAYOUT': {
      // If a build is already running, queue this as pending (only latest matters)
      if (buildInProgress) {
        pendingBuildMsg = msg;
        break;
      }
      buildInProgress = true;
      try {
        const { expressions, settings, frameId } = msg;

        // Find existing frame by ID or fallback
        let mainFrame = findKeyExprFrame(frameId);

        if (!mainFrame) {
          // No existing frame — create a new one (same as GENERATE_LAYOUT)
          mainFrame = await createMainFrame(settings);
        }

        // Diff-based update: reuse existing card nodes, preserve images
        const placements = await applyCardLayout(mainFrame, expressions, settings);

        // Auto-assign stored images to cards that don't have one yet
        autoAssignStoredImages(mainFrame);

        // Read existing content→ID mapping (read-only, no write on layout)
        const contentIdMap = readContentIdMap();

        // Scroll into view
        figma.viewport.scrollAndZoomIntoView([mainFrame]);

        figma.ui.postMessage({
          type: 'LAYOUT_CREATED',
          placements,
          frameId: mainFrame.id,
          contentIdMap,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to update layout',
          detail: err?.message ?? String(err),
        });
      } finally {
        buildInProgress = false;
        // Process pending build if queued
        if (pendingBuildMsg) {
          const next = pendingBuildMsg;
          pendingBuildMsg = null;
          handleMessage(next);
        }
      }
      break;
    }

    case 'UPDATE_CARD_EN': {
      try {
        const mainFrame = findKeyExprFrame(msg.frameId);
        if (!mainFrame) break;

        // Find the card frame by expressionId
        const cardFrame = mainFrame.findOne(
          (n) => n.type === 'FRAME' && n.name.startsWith('[card:') && n.getPluginData('expressionId') === msg.expressionId
        ) as FrameNode | null;
        if (!cardFrame) break;

        // Load font before updating text
        const fontFamily = DEFAULT_FONT_FAMILY;
        await figma.loadFontAsync({ family: fontFamily, style: 'Bold' });

        // Update the English text node
        const enTextNode = cardFrame.findOne(
          (n) => n.name === 'card-text-en' && n.type === 'TEXT'
        ) as TextNode | null;
        if (enTextNode) {
          enTextNode.characters = msg.enText;
        }
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to update card English text',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'UPDATE_CARD_TRANSLATIONS': {
      try {
        const translationCards = (msg as any).cards as Array<{ expressionId: string; enText: string }>;
        const translationFrameId = (msg as any).frameId as string | undefined;

        var targetFrame: FrameNode | null = null;
        if (translationFrameId) {
          try { targetFrame = figma.getNodeById(translationFrameId) as FrameNode; } catch {}
        }
        if (!targetFrame) {
          targetFrame = figma.currentPage.findOne(
            function(n) { return n.type === 'FRAME' && n.name.startsWith(MAIN_FRAME_PREFIX); }
          ) as FrameNode | null;
        }
        if (!targetFrame) break;

        await figma.loadFontAsync({ family: DEFAULT_FONT_FAMILY, style: 'Bold' });

        for (var tci = 0; tci < translationCards.length; tci++) {
          var tc = translationCards[tci];
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
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to update card translations',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'EXPORT_REF_FRAME': {
      try {
        const imageBase64 = await exportRefFrame(msg.frameName);
        figma.ui.postMessage({
          type: 'REF_FRAME_EXPORTED',
          imageBase64,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to export reference frame',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'STORE_IMAGE': {
      try {
        const storageFrame = findStorage();

        if (!storageFrame) {
          throw new Error('Image storage frame not found. Initialize storage first.');
        }

        const imageBytes = new Uint8Array(msg.imageBytes);
        const imageHash = storeImage(
          storageFrame,
          msg.expressionId,
          msg.expressionText,
          imageBytes,
          msg.prompt,
          msg.index,
        );

        figma.ui.postMessage({
          type: 'IMAGE_STORED',
          expressionId: msg.expressionId,
          imageHash,
          index: msg.index,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to store image',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'ASSIGN_IMAGE': {
      try {
        // Assign to ALL cards with this expressionId across all frames
        const success = assignImageToAllCards(msg.expressionId, msg.imageHash);
        // Re-apply saved transform after assignment (assignment resets rect to default)
        reapplyTransformToCards(msg.expressionId);
        figma.ui.postMessage({
          type: 'IMAGE_ASSIGNED',
          expressionId: msg.expressionId,
          success,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to assign image',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'SWAP_IMAGE': {
      try {
        // Swap on ALL cards with this expressionId across all frames
        const success = assignImageToAllCards(msg.expressionId, msg.newImageHash);
        // Re-apply saved transform after swap (swap resets rect to default)
        reapplyTransformToCards(msg.expressionId);
        figma.ui.postMessage({
          type: 'IMAGE_ASSIGNED',
          expressionId: msg.expressionId,
          success,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to swap image',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'MEASURE_TEXT': {
      try {
        const fontFamily = msg.fontFamily || DEFAULT_FONT_FAMILY;
        await figma.loadFontAsync({ family: fontFamily, style: 'Bold' });

        const results: { id: string; width: number; height: number }[] = [];

        for (const item of msg.texts) {
          const textNode = figma.createText();
          textNode.fontName = { family: fontFamily, style: 'Bold' };
          textNode.fontSize = msg.fontSize;
          textNode.characters = item.lines.join('\n');

          results.push({
            id: item.id,
            width: textNode.width,
            height: textNode.height,
          });

          textNode.remove();
        }

        figma.ui.postMessage({
          type: 'TEXT_MEASURED',
          results,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to measure text',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'SAVE_API_KEY': {
      try {
        await figma.clientStorage.setAsync('gemini_api_key', msg.apiKey);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save API key',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'LOAD_API_KEY': {
      try {
        const apiKey = await figma.clientStorage.getAsync('gemini_api_key');
        figma.ui.postMessage({
          type: 'API_KEY_LOADED',
          apiKey: apiKey || '',
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to load API key',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'CHECK_REF_FRAME': {
      try {
        var refName = msg.frameName;
        var matches = figma.currentPage.findAll(
          function(n) {
            return n.name === refName && (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE');
          }
        );
        figma.ui.postMessage({
          type: 'REF_FRAME_CHECKED',
          frameName: refName,
          matchCount: matches.length,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to check reference frame',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'CLEANUP_TEMP': {
      try {
        const mainFrame = findKeyExprFrame(msg.frameId);

        if (mainFrame) {
          const tempNodes = mainFrame.findAll(
            (n) => n.name.startsWith('temp')
          );
          tempNodes.forEach(n => n.remove());
        }
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to cleanup temp elements',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'NEW_PAGE': {
      try {
        var settings = msg.settings;

        // Find the lowest KeyExpr frame (by y + height) on the current page
        var lowestFrame: FrameNode | null = null;
        var lowestBottom = 0;
        var existingKeyExprFrames = figma.currentPage.findAll(
          function(n) { return n.type === 'FRAME' && n.name.startsWith(MAIN_FRAME_PREFIX); }
        ) as FrameNode[];
        for (var fi = 0; fi < existingKeyExprFrames.length; fi++) {
          var bottom = existingKeyExprFrames[fi].y + existingKeyExprFrames[fi].height;
          if (bottom > lowestBottom) {
            lowestBottom = bottom;
            lowestFrame = existingKeyExprFrames[fi];
          }
        }

        // Create new frame directly below the lowest, matching its x position
        var newFrame = await createMainFrame(settings);
        newFrame.y = lowestBottom + 200;
        if (lowestFrame) {
          newFrame.x = lowestFrame.x;
        }

        // Auto-select the new frame
        figma.currentPage.selection = [newFrame];
        figma.viewport.scrollAndZoomIntoView([newFrame]);

        figma.ui.postMessage({
          type: 'NEW_PAGE_CREATED',
          frameId: newFrame.id,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create new page',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'CLEANUP_GUIDES': {
      try {
        var guideNodes = figma.currentPage.findAll(
          function(n) { return n.name === 'center-guide-temp'; }
        );
        var count = guideNodes.length;
        guideNodes.forEach(function(n) { n.remove(); });
        figma.notify(count + '개 가이드라인 삭제됨');
        figma.ui.postMessage({ type: 'GUIDES_STATUS', hasGuides: false });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to cleanup guides',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'ADD_GUIDES': {
      try {
        var keyExprFrames = figma.currentPage.findAll(
          function(n) { return n.type === 'FRAME' && n.name.startsWith(MAIN_FRAME_PREFIX); }
        ) as FrameNode[];
        var guideColor = hexToFigmaColor(GUIDELINE_COLOR);
        var addedCount = 0;
        for (var gi = 0; gi < keyExprFrames.length; gi++) {
          var kf = keyExprFrames[gi];
          // Skip if already has a guide
          var existing = kf.findOne(function(n) { return n.name === 'center-guide-temp'; });
          if (existing) continue;
          var guide = figma.createRectangle();
          guide.name = 'center-guide-temp';
          guide.fills = [{ type: 'SOLID', color: guideColor }];
          guide.resize(40, FRAME_HEIGHT);
          guide.x = HALF_PAGE_WIDTH - 20;
          guide.y = 0;
          guide.opacity = 0.3;
          kf.appendChild(guide);
          addedCount++;
        }
        figma.notify(addedCount + '개 프레임에 가이드라인 추가됨');
        figma.ui.postMessage({ type: 'GUIDES_STATUS', hasGuides: true });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to add guides',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'INIT_STORAGE': {
      try {
        let storageFrame = findStorage();
        if (!storageFrame) {
          storageFrame = createStorageFrame();
        }
        const contentIdMap = readContentIdMap();
        figma.ui.postMessage({
          type: 'STORAGE_STATUS',
          ready: true,
          contentIdMap,
          hasGuides: countGuides() > 0,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to initialize storage',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    case 'CHECK_STORAGE': {
      const storageFrame = findStorage();
      const contentIdMap = storageFrame ? readContentIdMap() : undefined;
      figma.ui.postMessage({
        type: 'STORAGE_STATUS',
        ready: !!storageFrame,
        contentIdMap,
        hasGuides: countGuides() > 0,
      });
      break;
    }

    case 'UPDATE_CONTENT_ID_MAP': {
      try {
        const updated = mergeContentIdMap(msg.entries);
        figma.ui.postMessage({
          type: 'LAYOUT_CREATED',
          placements: [],
          frameId: msg.frameId || '',
          contentIdMap: updated,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to update content ID map',
          detail: err?.message ?? String(err),
        });
      }
      break;
    }

    default: {
      // Unknown message type — ignore silently
      break;
    }
  }
}

figma.ui.onmessage = (msg: UIToSandboxMessage) => {
  handleMessage(msg);
};
