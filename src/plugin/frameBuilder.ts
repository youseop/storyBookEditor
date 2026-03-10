import {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  HALF_PAGE_WIDTH,
  TITLE_HEIGHT,
  TITLE_FONT_FAMILY,
  TITLE_FONT_SIZE,
  GRID_MARGIN_LEFT,
  GRID_MARGIN_TOP,
  GRID_MARGIN_BOTTOM,
  GRID_MARGIN_RIGHT,
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
 * Creates the main frame with title, highlight, and guideline helpers.
 */
export async function createMainFrame(settings: PluginSettings): Promise<FrameNode> {
  // Load font for title text
  await figma.loadFontAsync({ family: TITLE_FONT_FAMILY, style: 'Regular' });
  await figma.loadFontAsync({ family: TITLE_FONT_FAMILY, style: 'Bold' });

  // ---- Main frame ----
  const frame = figma.createFrame();
  frame.name = '[KeyExpr] Key Expressions';
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

  // ---- Guidelines (temp helpers) ----
  const guideColor = hexToFigmaColor(GUIDELINE_COLOR);

  // Center vertical divider
  const centerLine = figma.createLine();
  centerLine.name = 'temp-center-line';
  centerLine.x = HALF_PAGE_WIDTH;
  centerLine.y = 0;
  centerLine.resize(0, FRAME_HEIGHT);
  centerLine.rotation = -90; // vertical
  // Lines in Figma default to horizontal; rotate to make vertical
  // Actually, resizing a line with (0, height) and then rotating is not standard.
  // Use a thin rectangle instead for a clean vertical line.
  centerLine.remove();

  const centerDiv = figma.createRectangle();
  centerDiv.name = 'temp-center-line';
  centerDiv.fills = [{ type: 'SOLID', color: guideColor }];
  centerDiv.resize(2, FRAME_HEIGHT);
  centerDiv.x = HALF_PAGE_WIDTH - 1;
  centerDiv.y = 0;
  centerDiv.opacity = 0.5;
  frame.appendChild(centerDiv);

  // Top margin guide
  const topGuide = figma.createRectangle();
  topGuide.name = 'temp-top-margin';
  topGuide.fills = [{ type: 'SOLID', color: guideColor }];
  topGuide.resize(FRAME_WIDTH, 1);
  topGuide.x = 0;
  topGuide.y = TITLE_HEIGHT;
  topGuide.opacity = 0.3;
  frame.appendChild(topGuide);

  // Bottom margin guide
  const bottomGuide = figma.createRectangle();
  bottomGuide.name = 'temp-bottom-margin';
  bottomGuide.fills = [{ type: 'SOLID', color: guideColor }];
  bottomGuide.resize(FRAME_WIDTH, 1);
  bottomGuide.x = 0;
  bottomGuide.y = FRAME_HEIGHT - GRID_MARGIN_BOTTOM;
  bottomGuide.opacity = 0.3;
  frame.appendChild(bottomGuide);

  // Left margin guide
  const leftGuide = figma.createRectangle();
  leftGuide.name = 'temp-left-margin';
  leftGuide.fills = [{ type: 'SOLID', color: guideColor }];
  leftGuide.resize(1, FRAME_HEIGHT);
  leftGuide.x = GRID_MARGIN_LEFT;
  leftGuide.y = 0;
  leftGuide.opacity = 0.3;
  frame.appendChild(leftGuide);

  // Right margin guide
  const rightGuide = figma.createRectangle();
  rightGuide.name = 'temp-right-margin';
  rightGuide.fills = [{ type: 'SOLID', color: guideColor }];
  rightGuide.resize(1, FRAME_HEIGHT);
  rightGuide.x = FRAME_WIDTH - GRID_MARGIN_RIGHT;
  rightGuide.y = 0;
  rightGuide.opacity = 0.3;
  frame.appendChild(rightGuide);

  // Append to current page
  figma.currentPage.appendChild(frame);

  return frame;
}

/**
 * Removes all children whose name starts with '[card]' from the given frame.
 * Used for UPDATE_LAYOUT to clear old cards before rebuilding the grid.
 */
export function removeOldCards(frame: FrameNode): void {
  const toRemove = frame.children.filter(child => child.name.startsWith('[card]'));
  toRemove.forEach(child => child.remove());
}
