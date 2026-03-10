import {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  HALF_PAGE_WIDTH,
  TITLE_FONT_FAMILY,
  TITLE_FONT_SIZE,
  GRID_MARGIN_LEFT,
  GUIDELINE_COLOR,
  TITLE_HIGHLIGHT_COLOR,
} from '../shared/constants';
import type { PluginSettings } from '../shared/messageTypes';

/**
 * Converts a hex color string (#RRGGBB) to a Figma RGB object with values 0-1.
 */
export function hexToFigmaColor(hex: string): RGB {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r, g, b };
}

/**
 * Generates a short unique ID for frame naming.
 */
function generateFrameId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Creates the main frame with title, highlight, and guideline helpers.
 */
export async function createMainFrame(settings: PluginSettings): Promise<FrameNode> {
  // Load font for title text
  await figma.loadFontAsync({ family: TITLE_FONT_FAMILY, style: 'Regular' });
  await figma.loadFontAsync({ family: TITLE_FONT_FAMILY, style: 'Bold' });

  // ---- Main frame ----
  const frameId = generateFrameId();
  const frame = figma.createFrame();
  frame.name = `[KeyExpr] Key Expressions #${frameId}`;
  frame.setPluginData('keyExprId', frameId);
  frame.resize(FRAME_WIDTH, FRAME_HEIGHT);
  frame.fills = [{ type: 'SOLID', color: hexToFigmaColor(settings.bgColor) }];
  frame.clipsContent = true;

  // ---- Title text ----
  const titleText = figma.createText();
  titleText.fontName = { family: TITLE_FONT_FAMILY, style: 'Bold' };
  titleText.fontSize = TITLE_FONT_SIZE;
  titleText.characters = 'Key Expressions';
  titleText.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];

  // Position the title near top-left of the content grid area on page 0
  const titleX = GRID_MARGIN_LEFT;
  const titleY = 50;
  titleText.x = titleX;
  titleText.y = titleY;

  // ---- Title highlight rectangle (behind text) ----
  const highlightPadX = 20;
  const highlightPadY = 10;
  const highlightRect = figma.createRectangle();
  highlightRect.name = 'title-highlight';
  highlightRect.fills = [{ type: 'SOLID', color: hexToFigmaColor(TITLE_HIGHLIGHT_COLOR) }];
  highlightRect.resize(
    titleText.width + highlightPadX * 2,
    titleText.height + highlightPadY * 2,
  );
  highlightRect.x = titleX - highlightPadX;
  highlightRect.y = titleY - highlightPadY;
  highlightRect.cornerRadius = 8;

  // Add highlight first (behind), then text (in front)
  frame.appendChild(highlightRect);
  frame.appendChild(titleText);

  // ---- Center guideline only ----
  const guideColor = hexToFigmaColor(GUIDELINE_COLOR);

  const centerDiv = figma.createRectangle();
  centerDiv.name = 'center-guide';
  centerDiv.fills = [{ type: 'SOLID', color: guideColor }];
  centerDiv.resize(40, FRAME_HEIGHT);
  centerDiv.x = HALF_PAGE_WIDTH - 20;
  centerDiv.y = 0;
  centerDiv.opacity = 0.3;
  frame.appendChild(centerDiv);

  // Append to current page
  figma.currentPage.appendChild(frame);

  return frame;
}

/**
 * Removes all children whose name starts with '[card]' from the given frame.
 * Used for UPDATE_LAYOUT to clear old cards before rebuilding the grid.
 */
export function removeOldCards(frame: FrameNode): void {
  const toRemove = frame.children.filter(child => child.name.startsWith('[card'));
  toRemove.forEach(child => child.remove());
}
