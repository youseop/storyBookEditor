import {
  GRID_COLS,
  GRID_ROWS,
  CELL_WIDTH,
  CELL_HEIGHT,
  CELL_GAP,
  GRID_MARGIN_LEFT,
  HALF_PAGE_WIDTH,
  FRAME_HEIGHT,
  CARD_IMAGE_RATIO,
  CARD_TEXT_RATIO,
  CARD_BG_COLOR,
  CARD_STROKE_COLOR,
  CARD_STROKE_RATIO,
  CARD_CORNER_RATIO,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
} from '../shared/constants';

// Grid vertically centered in the frame
const TOTAL_GRID_HEIGHT = GRID_ROWS * CELL_HEIGHT + (GRID_ROWS - 1) * CELL_GAP;
const GRID_START_Y = Math.round((FRAME_HEIGHT - TOTAL_GRID_HEIGHT) / 2);

import type {
  ExpressionCard,
  PluginSettings,
  CardPlacement,
} from '../shared/messageTypes';
import { hexToFigmaColor } from './frameBuilder';

/**
 * Measures text for each card and determines optimal colSpan/rowSpan
 * based on whether the text overflows the available area in a 1x1 card.
 */
async function measureAndSizeCards(
  expressions: ExpressionCard[],
  fontFamily: string,
  fontSize: number,
): Promise<ExpressionCard[]> {
  // Create a temporary text node for measurement (use Bold to match card rendering)
  await figma.loadFontAsync({ family: fontFamily, style: 'Bold' });

  const sized: ExpressionCard[] = [];

  for (const card of expressions) {
    const textNode = figma.createText();
    textNode.fontName = { family: fontFamily, style: 'Bold' };
    textNode.fontSize = fontSize;
    textNode.characters = card.lines.join('\n');
    // Let text auto-size (don't constrain width)
    textNode.textAutoResize = 'WIDTH_AND_HEIGHT';

    const textWidth = textNode.width;
    const textHeight = textNode.height;
    textNode.remove();

    // Available space in a 1x1 card's text area
    const availableTextWidth = CELL_WIDTH - 40; // 40px padding
    const availableTextHeight = Math.round(CELL_HEIGHT * CARD_TEXT_RATIO) - 20; // padding

    let colSpan: 1 | 2 = 1;
    let rowSpan: 1 | 2 = 1;

    // Check horizontal overflow -> wide card (2x1)
    if (textWidth > availableTextWidth) {
      colSpan = 2;
    }

    // Check vertical overflow (many lines) -> tall card (1x2)
    if (textHeight > availableTextHeight) {
      rowSpan = 2;
    }

    // Both overflow -> big card (2x2)
    // (colSpan and rowSpan already set independently)

    sized.push({
      ...card,
      colSpan,
      rowSpan,
    });
  }

  return sized;
}

/**
 * 2D bin-packing grid layout engine.
 *
 * Manages two 4x4 grids (page 0 = left half, page 1 = right half).
 * For each card, scans left-to-right then top-to-bottom for the first
 * position where the card's colSpan x rowSpan block fits without
 * overlapping already-placed cards.
 */
export async function buildCardGrid(
  frame: FrameNode,
  expressions: ExpressionCard[],
  settings: PluginSettings,
): Promise<CardPlacement[]> {
  const fontFamily = settings.fontFamily || DEFAULT_FONT_FAMILY;
  const fontSize = settings.fontSize || DEFAULT_FONT_SIZE;

  // Load the card text font (Bold for card text rendering)
  await figma.loadFontAsync({ family: fontFamily, style: 'Bold' });

  // Smart text measurement: auto-determine card sizes based on text content
  const sizedExpressions = await measureAndSizeCards(expressions, fontFamily, fontSize);

  // Occupancy grids: occupied[page][row][col]
  const occupied: boolean[][][] = [
    Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false)),
    Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false)),
  ];

  const placements: CardPlacement[] = [];

  for (const card of sizedExpressions) {
    const placed = tryPlaceCard(card, occupied, frame, fontFamily, fontSize, placements);
    if (!placed) {
      console.warn(`Could not place card "${card.id}" — no space available.`);
    }
  }

  return placements;
}

/**
 * Attempts to place a single card in the grid. Returns true if placed.
 */
function tryPlaceCard(
  card: ExpressionCard,
  occupied: boolean[][][],
  frame: FrameNode,
  fontFamily: string,
  fontSize: number,
  placements: CardPlacement[],
): boolean {
  for (let page = 0; page < 2; page++) {
    for (let row = 0; row <= GRID_ROWS - card.rowSpan; row++) {
      for (let col = 0; col <= GRID_COLS - card.colSpan; col++) {
        if (canFit(occupied[page], row, col, card.rowSpan, card.colSpan)) {
          // Mark cells as occupied
          markOccupied(occupied[page], row, col, card.rowSpan, card.colSpan);

          // Calculate pixel position
          const pageOffsetX = page === 0 ? 0 : HALF_PAGE_WIDTH;
          const x = pageOffsetX + GRID_MARGIN_LEFT + col * (CELL_WIDTH + CELL_GAP);
          const y = GRID_START_Y + row * (CELL_HEIGHT + CELL_GAP);
          const width = card.colSpan * CELL_WIDTH + (card.colSpan - 1) * CELL_GAP;
          const height = card.rowSpan * CELL_HEIGHT + (card.rowSpan - 1) * CELL_GAP;

          // Create the card frame node
          const cardNode = createCardNode(frame, card, x, y, width, height, fontFamily, fontSize);

          placements.push({
            id: card.id,
            nodeId: cardNode.id,
            col,
            row,
            colSpan: card.colSpan,
            rowSpan: card.rowSpan,
            page,
            lines: card.lines,
          });

          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Checks whether a card of (rowSpan x colSpan) fits at (startRow, startCol).
 */
function canFit(
  grid: boolean[][],
  startRow: number,
  startCol: number,
  rowSpan: number,
  colSpan: number,
): boolean {
  for (let r = startRow; r < startRow + rowSpan; r++) {
    for (let c = startCol; c < startCol + colSpan; c++) {
      if (grid[r][c]) return false;
    }
  }
  return true;
}

/**
 * Marks grid cells as occupied.
 */
function markOccupied(
  grid: boolean[][],
  startRow: number,
  startCol: number,
  rowSpan: number,
  colSpan: number,
): void {
  for (let r = startRow; r < startRow + rowSpan; r++) {
    for (let c = startCol; c < startCol + colSpan; c++) {
      grid[r][c] = true;
    }
  }
}

/**
 * Creates a Figma frame node for a single expression card.
 */
function createCardNode(
  parentFrame: FrameNode,
  card: ExpressionCard,
  x: number,
  y: number,
  width: number,
  height: number,
  fontFamily: string,
  fontSize: number,
): FrameNode {
  const textContent = card.lines.join('\n');

  // Proportional stroke and corner radius based on min(width, height)
  // Reference: 726×760 card → 11px stroke, 56px radius
  var minDim = Math.min(width, height);
  var strokeWeight = Math.round(minDim * CARD_STROKE_RATIO);
  if (strokeWeight < 1) strokeWeight = 1;
  var cornerRadius = Math.round(minDim * CARD_CORNER_RATIO);

  // Card container
  const cardFrame = figma.createFrame();
  cardFrame.name = `[card] ${card.lines.join(' ')}`;
  cardFrame.resize(width, height);
  cardFrame.x = x;
  cardFrame.y = y;
  cardFrame.fills = [{ type: 'SOLID', color: hexToFigmaColor(CARD_BG_COLOR) }];
  cardFrame.cornerRadius = cornerRadius;
  cardFrame.strokes = [{ type: 'SOLID', color: hexToFigmaColor(CARD_STROKE_COLOR) }];
  cardFrame.strokeWeight = strokeWeight;
  cardFrame.strokeAlign = 'INSIDE';
  cardFrame.clipsContent = true;

  // Store expression ID for image assignment lookup
  cardFrame.setPluginData('expressionId', card.id);

  // Image placeholder — inset from card edges with rounded corners
  // Reference: 779×679 card → [img] at (18,18), 743×471, cornerRadius 36
  // inset ≈ strokeWeight * 1.6, imgCornerRadius ≈ inset * 2
  var inset = Math.round(strokeWeight * 1.6);
  var imgCornerRadius = Math.round(inset * 2);
  var textHeight = height - Math.round(height * CARD_IMAGE_RATIO);
  var imgW = width - 2 * inset;
  var imgH = height - textHeight - 2 * inset;

  var imgFrame = figma.createFrame();
  imgFrame.name = '[img]';
  imgFrame.resize(imgW, imgH);
  imgFrame.x = inset;
  imgFrame.y = inset;
  imgFrame.cornerRadius = imgCornerRadius;
  imgFrame.fills = [{ type: 'SOLID', color: hexToFigmaColor('#F0F0F0') }];
  imgFrame.clipsContent = true;
  cardFrame.appendChild(imgFrame);
  const textNode = figma.createText();
  textNode.name = 'card-text';
  textNode.fontName = { family: fontFamily, style: 'Bold' };
  textNode.fontSize = fontSize;
  textNode.characters = textContent;
  textNode.textAlignHorizontal = 'CENTER';
  textNode.textAlignVertical = 'CENTER';
  textNode.resize(width, textHeight);
  textNode.x = 0;
  textNode.y = height - textHeight;
  textNode.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
  cardFrame.appendChild(textNode);

  parentFrame.appendChild(cardFrame);

  return cardFrame;
}
