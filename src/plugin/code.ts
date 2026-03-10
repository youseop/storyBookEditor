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

const MAIN_FRAME_NAME = '[KeyExpr] Key Expressions';

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
    (n) => n.type === 'FRAME' && n.name.startsWith('[card]')
  ) as FrameNode[];

  if (cardFrames.length === 0) {
    // Valid KeyExpr frame but no cards — newly created empty frame
    figma.ui.postMessage({
      type: 'FRAME_SELECTED',
      frameId: node.id,
      expressionText: '',
    });
    return;
  }

  // Sort cards by page (left vs right), then row (y position), then column (x position)
  const sorted = cardFrames.slice().sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  // Extract text from each card's text node
  const expressions: string[] = [];
  for (var i = 0; i < sorted.length; i++) {
    var card = sorted[i];
    var textNode = card.findOne(
      (n) => n.name === 'card-text' && n.type === 'TEXT'
    ) as TextNode | null;
    if (textNode) {
      expressions.push(textNode.characters);
    }
  }

  // Join with double newline (each expression separated by blank line)
  var expressionText = expressions.join('\n\n');

  figma.ui.postMessage({
    type: 'FRAME_SELECTED',
    frameId: node.id,
    expressionText: expressionText,
  });
});

figma.ui.onmessage = async (msg: UIToSandboxMessage) => {
  switch (msg.type) {
    case 'GENERATE_LAYOUT': {
      try {
        const { expressions, settings } = msg;

        // Remove any existing main frame to avoid duplicates
        const existingFrame = figma.currentPage.findOne(
          (n) => n.type === 'FRAME' && n.name === MAIN_FRAME_NAME
        ) as FrameNode | null;
        if (existingFrame) {
          existingFrame.remove();
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
      try {
        const { expressions, settings } = msg;

        // Find existing frame on the current page
        let mainFrame = figma.currentPage.findOne(
          (n) => n.type === 'FRAME' && n.name === MAIN_FRAME_NAME
        ) as FrameNode | null;

        if (mainFrame) {
          // Remove old card children, keep title/guidelines intact
          removeOldCards(mainFrame);
        } else {
          // No existing frame — create a new one (same as GENERATE_LAYOUT)
          mainFrame = await createMainFrame(settings);
        }

        // Ensure storage frame exists
        const storageExists = figma.currentPage.findOne(
          (n) => n.type === 'FRAME' && n.name === '[KeyExpr] Image Storage'
        );
        if (!storageExists) {
          createStorageFrame(mainFrame);
        }

        // Rebuild the card grid in the (existing or new) frame
        const placements = await buildCardGrid(mainFrame, expressions, settings);

        // Scroll into view
        figma.viewport.scrollAndZoomIntoView([mainFrame]);

        figma.ui.postMessage({
          type: 'LAYOUT_CREATED',
          placements,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to update layout',
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
        // Find the storage frame on the current page
        const storageFrame = figma.currentPage.findOne(
          (n) => n.type === 'FRAME' && n.name === '[KeyExpr] Image Storage'
        ) as FrameNode | null;

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
        const mainFrame = figma.currentPage.findOne(
          (n) => n.type === 'FRAME' && n.name.startsWith('[KeyExpr] Key Expressions')
        ) as FrameNode | null;

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
        const mainFrame = figma.currentPage.findOne(
          (n) => n.type === 'FRAME' && n.name.startsWith('[KeyExpr] Key Expressions')
        ) as FrameNode | null;

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
        const mainFrame = figma.currentPage.findOne(
          (n) => n.type === 'FRAME' && n.name === MAIN_FRAME_NAME
        ) as FrameNode | null;

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

    default: {
      // Unknown message type — ignore silently
      break;
    }
  }
};
