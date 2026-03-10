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
  CARD_KO_TEXT_RATIO,
  CARD_BG_COLOR,
  CARD_STROKE_COLOR,
  CARD_STROKE_WEIGHT,
  CARD_CORNER_RADIUS,
  CARD_IMG_CORNER_RADIUS,
  CARD_EN_TEXT_COLOR,
  CARD_EN_FONT_SIZE,
  CARD_EN_PLACEHOLDER,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_COL_SPAN,
  DEFAULT_ROW_SPAN,
  MAX_EXPANSION,
  SIZING_TEXT_RATIO,
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

// ── Phase A: Measure and size cards ──
// Width: grow colSpan only when widest line exceeds available card width.
// Height: measure wrapped text height against SIZING_TEXT_RATIO budget (50% of card).
//   1-3 lines fit within default 2x2; 4+ lines grow rowSpan.

async function measureAndSizeCards(
  expressions: ExpressionCard[],
  fontFamily: string,
  fontSize: number,
): Promise<ExpressionCard[]> {
  await figma.loadFontAsync({ family: fontFamily, style: 'Bold' });

  const sized: ExpressionCard[] = [];

  for (const card of expressions) {
    const textNode = figma.createText();
    textNode.fontName = { family: fontFamily, style: 'Bold' };
    textNode.fontSize = fontSize;
    textNode.characters = card.lines.join('\n');
    textNode.textAutoResize = 'WIDTH_AND_HEIGHT';

    const naturalWidth = textNode.width;

    // Width: grow colSpan only when widest line is too wide
    let colSpan = DEFAULT_COL_SPAN;
    while (colSpan < GRID_COLS) {
      const cardWidth = colSpan * CELL_WIDTH + (colSpan - 1) * CELL_GAP;
      if (naturalWidth <= cardWidth - 40) break;
      colSpan++;
    }

    // Height: constrain to final card width, measure wrapped height
    const finalCardWidth = colSpan * CELL_WIDTH + (colSpan - 1) * CELL_GAP;
    textNode.textAutoResize = 'HEIGHT';
    textNode.resize(finalCardWidth - 40, textNode.height);
    const wrappedHeight = textNode.height;
    textNode.remove();

    let rowSpan = DEFAULT_ROW_SPAN;
    while (rowSpan < GRID_ROWS) {
      const cardHeight = rowSpan * CELL_HEIGHT + (rowSpan - 1) * CELL_GAP;
      const textBudget = Math.round(cardHeight * SIZING_TEXT_RATIO);
      if (wrappedHeight <= textBudget) break;
      rowSpan++;
    }

    sized.push({
      ...card,
      colSpan,
      rowSpan,
    });
  }

  return sized;
}

// ── Phase B & C: Row-based placement with expansion ──

interface RowEntry {
  card: ExpressionCard;
  colSpan: number; // final colSpan after expansion
}

interface Row {
  entries: RowEntry[];
  maxRowSpan: number;
  usedCols: number;
}

function buildRows(cards: ExpressionCard[]): Row[] {
  const rows: Row[] = [];
  let currentRow: Row = { entries: [], maxRowSpan: 0, usedCols: 0 };

  for (const card of cards) {
    // Row break: rowBreakBefore or card doesn't fit remaining cols
    if (card.rowBreakBefore && currentRow.entries.length > 0) {
      rows.push(currentRow);
      currentRow = { entries: [], maxRowSpan: 0, usedCols: 0 };
    }

    if (currentRow.usedCols + card.colSpan > GRID_COLS) {
      if (currentRow.entries.length > 0) {
        rows.push(currentRow);
      }
      currentRow = { entries: [], maxRowSpan: 0, usedCols: 0 };
    }

    currentRow.entries.push({ card, colSpan: card.colSpan });
    currentRow.usedCols += card.colSpan;
    currentRow.maxRowSpan = Math.max(currentRow.maxRowSpan, card.rowSpan);
  }

  if (currentRow.entries.length > 0) {
    rows.push(currentRow);
  }

  // Phase C: Row expansion — fill empty space
  for (const row of rows) {
    let remaining = GRID_COLS - row.usedCols;
    if (remaining <= 0) continue;

    // Track how much each entry has been expanded
    const expansionCount = new Array(row.entries.length).fill(0);

    while (remaining > 0) {
      // Find the smallest entry that hasn't hit the expansion cap
      let bestIdx = -1;
      let bestColSpan = Infinity;
      for (let i = 0; i < row.entries.length; i++) {
        if (expansionCount[i] < MAX_EXPANSION && row.entries[i].colSpan < bestColSpan) {
          bestColSpan = row.entries[i].colSpan;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) break; // all entries hit expansion cap

      row.entries[bestIdx].colSpan++;
      expansionCount[bestIdx]++;
      row.usedCols++;
      remaining--;
    }
  }

  return rows;
}

// ── Main entry point ──

export async function buildCardGrid(
  frame: FrameNode,
  expressions: ExpressionCard[],
  settings: PluginSettings,
): Promise<CardPlacement[]> {
  const fontFamily = settings.fontFamily || DEFAULT_FONT_FAMILY;
  const fontSize = settings.fontSize || DEFAULT_FONT_SIZE;

  await figma.loadFontAsync({ family: fontFamily, style: 'Bold' });

  const sizedExpressions = await measureAndSizeCards(expressions, fontFamily, fontSize);

  const rows = buildRows(sizedExpressions);

  // Phase D: Physical placement — walk rows across pages
  const placements: CardPlacement[] = [];
  let page = 0;
  let gridRow = 0; // current row position on the grid (in cells)

  for (const row of rows) {
    // Check if this row fits on the current page
    if (gridRow + row.maxRowSpan > GRID_ROWS) {
      // Move to next page
      page++;
      gridRow = 0;
      if (page >= 2) {
        console.warn('No more pages available — some cards will not be placed.');
        break;
      }
    }

    let col = 0;
    for (const entry of row.entries) {
      const { card } = entry;
      const finalColSpan = entry.colSpan;
      const finalRowSpan = row.maxRowSpan; // all cards in a row share the same height

      const pageOffsetX = page === 0 ? 0 : HALF_PAGE_WIDTH;
      const x = pageOffsetX + GRID_MARGIN_LEFT + col * (CELL_WIDTH + CELL_GAP);
      const y = GRID_START_Y + gridRow * (CELL_HEIGHT + CELL_GAP);
      const width = finalColSpan * CELL_WIDTH + (finalColSpan - 1) * CELL_GAP;
      const height = finalRowSpan * CELL_HEIGHT + (finalRowSpan - 1) * CELL_GAP;

      const cardNode = createCardNode(frame, card, x, y, width, height, fontFamily, fontSize);

      placements.push({
        id: card.id,
        nodeId: cardNode.id,
        col,
        row: gridRow,
        colSpan: finalColSpan,
        rowSpan: finalRowSpan,
        page,
        lines: card.lines,
      });

      col += finalColSpan;
    }

    gridRow += row.maxRowSpan;
  }

  return placements;
}

// ── Card node creation (unchanged logic) ──

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
  const enContent = card.enLines?.join('\n') || CARD_EN_PLACEHOLDER;

  var strokeWeight = CARD_STROKE_WEIGHT;
  var cornerRadius = CARD_CORNER_RADIUS;

  const cardFrame = figma.createFrame();
  cardFrame.name = `[card:${card.id}] ${card.lines.join(' ')}`;
  cardFrame.resize(width, height);
  cardFrame.x = x;
  cardFrame.y = y;
  cardFrame.fills = [{ type: 'SOLID', color: hexToFigmaColor(CARD_BG_COLOR) }];
  cardFrame.cornerRadius = cornerRadius;
  cardFrame.strokes = [{ type: 'SOLID', color: hexToFigmaColor(CARD_STROKE_COLOR) }];
  cardFrame.strokeWeight = strokeWeight;
  cardFrame.strokeAlign = 'INSIDE';
  cardFrame.clipsContent = true;

  cardFrame.setPluginData('expressionId', card.id);

  var inset = Math.round(strokeWeight * 1.6);
  // Cap image zone at default card's image height — extra card height goes to text
  var defaultCardH = DEFAULT_ROW_SPAN * CELL_HEIGHT + (DEFAULT_ROW_SPAN - 1) * CELL_GAP;
  var maxImageZone = Math.round(defaultCardH * CARD_IMAGE_RATIO);
  var imageZone = Math.min(Math.round(height * CARD_IMAGE_RATIO), maxImageZone);
  var textAreaHeight = height - imageZone;
  var imgW = width - 2 * inset;
  var imgH = imageZone - 2 * inset;

  var imgFrame = figma.createFrame();
  imgFrame.name = `[img:${card.id}]`;
  imgFrame.resize(imgW, imgH);
  imgFrame.x = inset;
  imgFrame.y = inset;
  imgFrame.cornerRadius = CARD_IMG_CORNER_RADIUS;
  imgFrame.fills = [{ type: 'SOLID', color: hexToFigmaColor('#F0F0F0') }];
  imgFrame.clipsContent = true;
  cardFrame.appendChild(imgFrame);

  var koTextHeight = Math.round(textAreaHeight * CARD_KO_TEXT_RATIO);
  var koTextY = height - textAreaHeight;

  const koTextNode = figma.createText();
  koTextNode.name = 'card-text';
  koTextNode.fontName = { family: fontFamily, style: 'Bold' };
  koTextNode.fontSize = fontSize;
  koTextNode.characters = textContent;
  koTextNode.textAlignHorizontal = 'CENTER';
  koTextNode.textAlignVertical = 'CENTER';
  koTextNode.resize(width, koTextHeight);
  koTextNode.x = 0;
  koTextNode.y = koTextY;
  koTextNode.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
  cardFrame.appendChild(koTextNode);

  var enTextHeight = textAreaHeight - koTextHeight;
  var enTextY = koTextY + koTextHeight - 17;

  const enTextNode = figma.createText();
  enTextNode.name = 'card-text-en';
  enTextNode.fontName = { family: fontFamily, style: 'Bold' };
  enTextNode.fontSize = CARD_EN_FONT_SIZE;
  enTextNode.characters = enContent;
  enTextNode.textAlignHorizontal = 'CENTER';
  enTextNode.textAlignVertical = 'CENTER';
  enTextNode.resize(width, enTextHeight);
  enTextNode.x = 0;
  enTextNode.y = enTextY;
  enTextNode.fills = [{ type: 'SOLID', color: hexToFigmaColor(CARD_EN_TEXT_COLOR) }];
  cardFrame.appendChild(enTextNode);

  parentFrame.appendChild(cardFrame);

  return cardFrame;
}
