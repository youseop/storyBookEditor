import { createMainFrame, removeOldCards } from './frameBuilder';
import { buildCardGrid } from './cardGridBuilder';
import { createStorageFrame, storeImage, assignImage, swapImage } from './imageManager';
import { exportRefFrame } from './exportHelper';
import type {
  UIToSandboxMessage,
  PluginSettings,
  ExpressionCard,
} from '../shared/messageTypes';
import { DEFAULT_FONT_FAMILY, FRAME_HEIGHT } from '../shared/constants';

const MAIN_FRAME_PREFIX = '[KeyExpr] Key Expressions';

/**
 * Find the Image Storage frame that belongs to a given KeyExpr frame.
 */
function findStorageForFrame(mainFrame: FrameNode): FrameNode | null {
  const keyExprId = mainFrame.getPluginData('keyExprId');
  if (keyExprId) {
    const byData = figma.currentPage.findOne(
      (n) => n.type === 'FRAME' && n.getPluginData('keyExprId') === keyExprId && n.name.startsWith('[KeyExpr] Image Storage')
    ) as FrameNode | null;
    if (byData) return byData;
  }
  // Legacy fallback
  return figma.currentPage.findOne(
    (n) => n.type === 'FRAME' && n.name === '[KeyExpr] Image Storage'
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

figma.showUI(__html__, { width: 480, height: 640 });

// ---- Selection change listener ----
// Detect when user selects a KeyExpr frame and extract expressions from it
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) return;

  const node = selection[0];
  if (node.type !== 'FRAME' || !node.name.startsWith('[KeyExpr] Key Expressions')) return;

  // Extract card text from the frame
  const cardFrames = node.findAll(
    (n) => n.type === 'FRAME' && n.name.startsWith('[card:')
  ) as FrameNode[];

  if (cardFrames.length === 0) {
    // Valid KeyExpr frame but no cards — newly created empty frame
    figma.ui.postMessage({
      type: 'FRAME_SELECTED',
      frameId: node.id,
      expressionText: '',
      enTextPairs: [],
      storedImages: [],
    });
    return;
  }

  // Sort cards by page (left vs right), then row (y position), then column (x position)
  const sorted = cardFrames.slice().sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  // Extract text from each card's text nodes (Korean + English)
  const expressions: string[] = [];
  const enTextPairs: { cardId: string; korean: string; en: string }[] = [];
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
      var cardId = card.getPluginData('expressionId') || `card_${i + 1}`;
      expressions.push(koreanText);
      enTextPairs.push({
        cardId: cardId,
        korean: koreanText,
        en: enTextNode ? enTextNode.characters : '',
      });
    }
  }

  // Join with double newline (each expression separated by blank line)
  var expressionText = expressions.join('\n\n');

  // Scan Image Storage for stored images
  var storedImages: { expressionId: string; imageHash: string; prompt: string; index: number; isActive: boolean }[] = [];
  var storageFrame = findStorageForFrame(node as FrameNode);
  if (storageFrame) {
    // Collect active image hashes from cards
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

    var allRects = storageFrame.findAll(
      function(n) { return n.type === 'RECTANGLE' && n.getPluginData('imageHash') !== ''; }
    ) as RectangleNode[];
    for (var ri = 0; ri < allRects.length; ri++) {
      var rect = allRects[ri];
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

  figma.ui.postMessage({
    type: 'FRAME_SELECTED',
    frameId: node.id,
    expressionText: expressionText,
    enTextPairs: enTextPairs,
    storedImages: storedImages,
  });
});

// Prevent concurrent UPDATE_LAYOUT / GENERATE_LAYOUT builds
let buildInProgress = false;
let pendingBuildMsg: UIToSandboxMessage | null = null;

async function handleMessage(msg: UIToSandboxMessage): Promise<void> {
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

        // Create the image storage frame alongside the main frame
        createStorageFrame(mainFrame);

        // Scroll into view
        figma.viewport.scrollAndZoomIntoView([mainFrame]);

        figma.ui.postMessage({
          type: 'LAYOUT_CREATED',
          placements,
          frameId: mainFrame.id,
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

        if (mainFrame) {
          // Remove old card children, keep title/guidelines intact
          removeOldCards(mainFrame);
        } else {
          // No existing frame — create a new one (same as GENERATE_LAYOUT)
          mainFrame = await createMainFrame(settings);
        }

        // Ensure storage frame exists for this KeyExpr frame
        if (!findStorageForFrame(mainFrame)) {
          createStorageFrame(mainFrame);
        }

        // Rebuild the card grid in the (existing or new) frame
        const placements = await buildCardGrid(mainFrame, expressions, settings);

        // Scroll into view
        figma.viewport.scrollAndZoomIntoView([mainFrame]);

        figma.ui.postMessage({
          type: 'LAYOUT_CREATED',
          placements,
          frameId: mainFrame.id,
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
        // Find the active KeyExpr frame, then its storage frame
        const activeMain = findKeyExprFrame(msg.frameId);
        const storageFrame = activeMain ? findStorageForFrame(activeMain) : null;

        if (!storageFrame) {
          throw new Error('Image storage frame not found. Generate a layout first.');
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
        const mainFrame = findKeyExprFrame(msg.frameId);

        if (!mainFrame) {
          throw new Error('Main frame not found.');
        }

        const success = assignImage(mainFrame, msg.expressionId, msg.imageHash);
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
        const mainFrame = findKeyExprFrame(msg.frameId);

        if (!mainFrame) {
          throw new Error('Main frame not found.');
        }

        const success = swapImage(mainFrame, msg.expressionId, msg.newImageHash);
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

        // Find the lowest frame (by y + height) on the current page
        var lowestY = 0;
        var allFrames = figma.currentPage.children;
        for (var fi = 0; fi < allFrames.length; fi++) {
          var child = allFrames[fi];
          var bottom = child.y + child.height;
          if (bottom > lowestY) {
            lowestY = bottom;
          }
        }

        // Create new frame below the lowest, with 200px gap
        var newFrame = await createMainFrame(settings);
        newFrame.y = lowestY + 200;

        // Create storage frame for the new page
        createStorageFrame(newFrame);

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
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to cleanup guides',
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
