import {
  GRID_COLS,
  GRID_ROWS,
  CELL_WIDTH,
  CELL_HEIGHT,
  CELL_GAP,
  GRID_MARGIN_LEFT,
  GRID_START_Y,
  HALF_PAGE_WIDTH,
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

// ── Phase B: Dynamic row packing types ──

interface RowEntry {
  card: ExpressionCard;
  colSpan: number; // final colSpan after expansion
}

// ── Phase C: Expand row entries to fill available columns ──

function expandRowEntries(entries: RowEntry[], availableCols: number): void {
  let usedCols = 0;
  for (const e of entries) usedCols += e.colSpan;
  let remaining = availableCols - usedCols;
  if (remaining <= 0) return;

  const expansionCount = new Array(entries.length).fill(0);

  while (remaining > 0) {
    let bestIdx = -1;
    let bestColSpan = Infinity;
    for (let i = 0; i < entries.length; i++) {
      if (expansionCount[i] < MAX_EXPANSION && entries[i].colSpan < bestColSpan) {
        bestColSpan = entries[i].colSpan;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;

    entries[bestIdx].colSpan++;
    expansionCount[bestIdx]++;
    remaining--;
  }
}

// ── Obstacle detection: scan parent frame for non-card children ──

function buildObstacleOccupancy(frame: FrameNode): boolean[][][] {
  const step_x = CELL_WIDTH + CELL_GAP;
  const step_y = CELL_HEIGHT + CELL_GAP;

  const grids: boolean[][][] = [
    Array.from({ length: GRID_COLS }, () => new Array(GRID_ROWS).fill(false)),
    Array.from({ length: GRID_COLS }, () => new Array(GRID_ROWS).fill(false)),
  ];

  for (let i = 0; i < frame.children.length; i++) {
    const child = frame.children[i];
    if (child.type !== 'FRAME') continue;
    if (child.name.startsWith('[card:')) continue;
    if (child.name === 'center-guide-temp') continue;

    const cf = child as FrameNode;

    for (let page = 0; page < 2; page++) {
      const pageOffsetX = page * HALF_PAGE_WIDTH;

      const localLeft = cf.x - pageOffsetX - GRID_MARGIN_LEFT;
      const localRight = cf.x + cf.width - pageOffsetX - GRID_MARGIN_LEFT;
      const localTop = cf.y - GRID_START_Y;
      const localBottom = cf.y + cf.height - GRID_START_Y;

      // Skip if child doesn't overlap this page's grid
      if (localRight <= 0 || localLeft >= GRID_COLS * step_x) continue;
      if (localBottom <= 0 || localTop >= GRID_ROWS * step_y) continue;

      // Mark cells whose area overlaps with this obstacle
      for (let c = 0; c < GRID_COLS; c++) {
        const cellLeft = c * step_x;
        const cellRight = cellLeft + CELL_WIDTH;
        if (cellRight <= localLeft || cellLeft >= localRight) continue;

        for (let r = 0; r < GRID_ROWS; r++) {
          const cellTop = r * step_y;
          const cellBottom = cellTop + CELL_HEIGHT;
          if (cellBottom <= localTop || cellTop >= localBottom) continue;

          grids[page][c][r] = true;
        }
      }
    }
  }

  return grids;
}

// ── Grid helpers ──

function markBlock(
  grid: boolean[][],
  col: number, row: number,
  colSpan: number, rowSpan: number,
): void {
  for (let c = col; c < col + colSpan; c++) {
    for (let r = row; r < row + rowSpan; r++) {
      grid[c][r] = true;
    }
  }
}

/** Count total free columns in a row band (may be non-contiguous). */
function countFreeCols(grid: boolean[][], startRow: number, rowSpan: number): number {
  let count = 0;
  for (let c = 0; c < GRID_COLS; c++) {
    let free = true;
    for (let r = startRow; r < startRow + rowSpan && r < GRID_ROWS; r++) {
      if (grid[c][r]) { free = false; break; }
    }
    if (free) count++;
  }
  return count;
}

/** Find contiguous free column ranges in a row band. */
function findFreeRanges(
  grid: boolean[][], startRow: number, rowSpan: number,
): { start: number; length: number }[] {
  const ranges: { start: number; length: number }[] = [];
  let rangeStart = -1;

  for (let c = 0; c <= GRID_COLS; c++) {
    let free = false;
    if (c < GRID_COLS) {
      free = true;
      for (let r = startRow; r < startRow + rowSpan && r < GRID_ROWS; r++) {
        if (grid[c][r]) { free = false; break; }
      }
    }

    if (free && rangeStart === -1) {
      rangeStart = c;
    } else if (!free && rangeStart !== -1) {
      ranges.push({ start: rangeStart, length: c - rangeStart });
      rangeStart = -1;
    }
  }
  return ranges;
}

// ── Computed placement result (pure data, no Figma nodes) ──

export interface ComputedPlacement {
  card: ExpressionCard;
  x: number;
  y: number;
  width: number;
  height: number;
  col: number;
  row: number;
  finalColSpan: number;
  finalRowSpan: number;
  page: number;
}

// ── Pure computation: measure, dynamically pack, and place cards ──

export async function computeCardLayout(
  expressions: ExpressionCard[],
  settings: PluginSettings,
  obstacleGrids?: boolean[][][],
): Promise<ComputedPlacement[]> {
  const fontFamily = settings.fontFamily || DEFAULT_FONT_FAMILY;
  const fontSize = settings.fontSize || DEFAULT_FONT_SIZE;

  const step_x = CELL_WIDTH + CELL_GAP;
  const step_y = CELL_HEIGHT + CELL_GAP;

  const sizedExpressions = await measureAndSizeCards(expressions, fontFamily, fontSize);

  // Build occupancy grids (deep copy from obstacles)
  const grids: boolean[][][] = [];
  function getGrid(page: number): boolean[][] {
    if (!grids[page]) {
      if (obstacleGrids && obstacleGrids[page]) {
        grids[page] = obstacleGrids[page].map(col => [...col]);
      } else {
        grids[page] = Array.from({ length: GRID_COLS }, () => new Array(GRID_ROWS).fill(false));
      }
    }
    return grids[page];
  }

  const result: ComputedPlacement[] = [];
  let cardIdx = 0;
  let page = 0;
  let gridRow = 0;

  while (cardIdx < sizedExpressions.length) {
    // Advance page if no more rows
    if (gridRow >= GRID_ROWS) {
      page++;
      gridRow = 0;
      if (page >= 100) {
        console.warn('No more pages available — some cards will not be placed.');
        break;
      }
    }

    const firstCard = sizedExpressions[cardIdx];
    let maxRowSpan = firstCard.rowSpan;

    // Vertical overflow for this row band
    if (gridRow + maxRowSpan > GRID_ROWS) {
      page++;
      gridRow = 0;
      continue;
    }

    const grid = getGrid(page);
    let freeRanges = findFreeRanges(grid, gridRow, maxRowSpan);

    // Check if first card fits in any range
    let fitsAnywhere = false;
    for (const r of freeRanges) {
      if (r.length >= firstCard.colSpan) { fitsAnywhere = true; break; }
    }
    if (!fitsAnywhere) {
      gridRow++;
      continue;
    }

    // Dynamically collect cards for this row band based on actual free space
    const rowCards: ExpressionCard[] = [];
    let usedCols = 0;
    let totalFree = freeRanges.reduce((s, r) => s + r.length, 0);
    let tempIdx = cardIdx;

    while (tempIdx < sizedExpressions.length) {
      const card = sizedExpressions[tempIdx];

      // Respect rowBreakBefore
      if (card.rowBreakBefore && rowCards.length > 0) break;

      // If this card changes the row band height, recheck free space
      const newMaxRowSpan = Math.max(maxRowSpan, card.rowSpan);
      if (newMaxRowSpan !== maxRowSpan) {
        if (gridRow + newMaxRowSpan > GRID_ROWS) break;
        freeRanges = findFreeRanges(grid, gridRow, newMaxRowSpan);
        totalFree = freeRanges.reduce((s, r) => s + r.length, 0);
        maxRowSpan = newMaxRowSpan;
      }

      if (usedCols + card.colSpan > totalFree) break;

      rowCards.push(card);
      usedCols += card.colSpan;
      tempIdx++;
    }

    if (rowCards.length === 0) {
      gridRow++;
      continue;
    }

    // Place collected cards into free ranges with per-range expansion
    const finalFreeRanges = findFreeRanges(grid, gridRow, maxRowSpan);
    let placedCount = 0;

    for (const range of finalFreeRanges) {
      if (placedCount >= rowCards.length) break;

      // Collect entries that fit in this contiguous range
      const rangeEntries: RowEntry[] = [];
      let usedInRange = 0;

      while (placedCount < rowCards.length) {
        const card = rowCards[placedCount];
        if (usedInRange + card.colSpan > range.length) break;
        rangeEntries.push({ card, colSpan: card.colSpan });
        usedInRange += card.colSpan;
        placedCount++;
      }

      if (rangeEntries.length === 0) continue;

      // Expand entries to fill this range
      expandRowEntries(rangeEntries, range.length);

      // Place entries within this range
      let col = range.start;
      for (const entry of rangeEntries) {
        const pageOffsetX = page * HALF_PAGE_WIDTH;
        const x = pageOffsetX + GRID_MARGIN_LEFT + col * step_x;
        const y = GRID_START_Y + gridRow * step_y;
        const width = entry.colSpan * CELL_WIDTH + (entry.colSpan - 1) * CELL_GAP;
        const height = maxRowSpan * CELL_HEIGHT + (maxRowSpan - 1) * CELL_GAP;

        markBlock(grid, col, gridRow, entry.colSpan, maxRowSpan);
        result.push({
          card: entry.card,
          x, y, width, height,
          col,
          row: gridRow,
          finalColSpan: entry.colSpan,
          finalRowSpan: maxRowSpan,
          page,
        });
        col += entry.colSpan;
      }
    }

    // Safety: if nothing was placed, skip this row to avoid infinite loop
    if (placedCount === 0) {
      gridRow++;
      continue;
    }

    cardIdx += placedCount;
    gridRow += maxRowSpan;
  }

  return result;
}

// ── Main entry point (full creation — used by GENERATE_LAYOUT) ──

export async function buildCardGrid(
  frame: FrameNode,
  expressions: ExpressionCard[],
  settings: PluginSettings,
): Promise<CardPlacement[]> {
  const fontFamily = settings.fontFamily || DEFAULT_FONT_FAMILY;
  const fontSize = settings.fontSize || DEFAULT_FONT_SIZE;

  await figma.loadFontAsync({ family: fontFamily, style: 'Bold' });

  const obstacleGrids = buildObstacleOccupancy(frame);
  const layout = await computeCardLayout(expressions, settings, obstacleGrids);
  const placements: CardPlacement[] = [];

  for (const info of layout) {
    const cardNode = createCardNode(frame, info.card, info.x, info.y, info.width, info.height, fontFamily, fontSize);

    placements.push({
      id: info.card.id,
      nodeId: cardNode.id,
      col: info.col,
      row: info.row,
      colSpan: info.finalColSpan,
      rowSpan: info.finalRowSpan,
      page: info.page,
      lines: info.card.lines,
    });
  }

  return placements;
}

// ── Diff-based update entry point (used by UPDATE_LAYOUT) ──

export async function applyCardLayout(
  frame: FrameNode,
  expressions: ExpressionCard[],
  settings: PluginSettings,
): Promise<CardPlacement[]> {
  const fontFamily = settings.fontFamily || DEFAULT_FONT_FAMILY;
  const fontSize = settings.fontSize || DEFAULT_FONT_SIZE;

  await figma.loadFontAsync({ family: fontFamily, style: 'Bold' });

  const obstacleGrids = buildObstacleOccupancy(frame);
  const layout = await computeCardLayout(expressions, settings, obstacleGrids);

  // Build map: expressionId → existing card FrameNodes (array for duplicate expressions)
  const existing = new Map<string, FrameNode[]>();
  for (const child of frame.children) {
    if (child.type === 'FRAME' && child.name.startsWith('[card:')) {
      const id = child.getPluginData('expressionId');
      if (id) {
        const arr = existing.get(id) || [];
        arr.push(child as FrameNode);
        existing.set(id, arr);
      }
    }
  }

  const placements: CardPlacement[] = [];

  for (const info of layout) {
    const matches = existing.get(info.card.id);
    const match = matches && matches.length > 0 ? matches.shift()! : undefined;
    let node: FrameNode;

    if (match) {
      updateCardNode(match, info.card, info.x, info.y, info.width, info.height, fontFamily, fontSize);
      node = match;
    } else {
      node = createCardNode(frame, info.card, info.x, info.y, info.width, info.height, fontFamily, fontSize);
    }

    placements.push({
      id: info.card.id,
      nodeId: node.id,
      col: info.col,
      row: info.row,
      colSpan: info.finalColSpan,
      rowSpan: info.finalRowSpan,
      page: info.page,
      lines: info.card.lines,
    });
  }

  // Remove orphaned cards (remaining unmatched cards)
  for (const [, nodes] of existing) {
    for (const node of nodes) {
      node.remove();
    }
  }

  return placements;
}

// ── Card node update (preserves image children) ──

function updateCardNode(
  cardFrame: FrameNode,
  card: ExpressionCard,
  x: number,
  y: number,
  width: number,
  height: number,
  fontFamily: string,
  fontSize: number,
): void {
  const textContent = card.lines.join('\n');
  const enContent = card.enLines?.join('\n') || CARD_EN_PLACEHOLDER;

  // Reposition + resize card frame
  cardFrame.x = x;
  cardFrame.y = y;
  cardFrame.resize(width, height);
  cardFrame.name = `[card:${card.id}] ${card.lines.join(' ')}`;
  cardFrame.setPluginData('expressionId', card.id);

  // Recalculate layout proportions (same math as createCardNode)
  var inset = Math.round(CARD_STROKE_WEIGHT * 1.6);
  var defaultCardH = DEFAULT_ROW_SPAN * CELL_HEIGHT + (DEFAULT_ROW_SPAN - 1) * CELL_GAP;
  var maxImageZone = Math.round(defaultCardH * CARD_IMAGE_RATIO);
  var imageZone = Math.min(Math.round(height * CARD_IMAGE_RATIO), maxImageZone);
  var textAreaHeight = height - imageZone;
  var imgW = width - 2 * inset;
  var imgH = imageZone - 2 * inset;

  // Update [img:*] frame — resize/reposition but preserve children (image fills!)
  var imgFrame = cardFrame.findOne(
    (n) => n.type === 'FRAME' && n.name.startsWith('[img:')
  ) as FrameNode | null;

  if (imgFrame) {
    var oldImgW = imgFrame.width;
    var oldImgH = imgFrame.height;
    imgFrame.name = `[img:${card.id}]`;
    imgFrame.resize(imgW, imgH);
    imgFrame.x = inset;
    imgFrame.y = inset;

    // Proportionally scale [image:*] rectangle to new frame size (preserves relative transform)
    var imgRect = imgFrame.findOne(
      (n) => n.type === 'RECTANGLE' && n.name.startsWith('[image:')
    ) as RectangleNode | null;
    if (imgRect) {
      imgRect.name = `[image:${card.id}]`;
      imgRect.setPluginData('expressionId', card.id);
      if (oldImgW > 0 && oldImgH > 0) {
        var rW = imgW / oldImgW;
        var rH = imgH / oldImgH;
        imgRect.resize(imgRect.width * rW, imgRect.height * rH);
        imgRect.x = imgRect.x * rW;
        imgRect.y = imgRect.y * rH;
      }
    }
  }

  // Update card-text (Korean)
  var koTextHeight = Math.round(textAreaHeight * CARD_KO_TEXT_RATIO);
  var koTextY = height - textAreaHeight;

  var koTextNode = cardFrame.findOne(
    (n) => n.name === 'card-text' && n.type === 'TEXT'
  ) as TextNode | null;

  if (koTextNode) {
    koTextNode.fontName = { family: fontFamily, style: 'Bold' };
    koTextNode.fontSize = fontSize;
    koTextNode.characters = textContent;
    koTextNode.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
    applyEqualsColor(koTextNode);
    koTextNode.resize(width, koTextHeight);
    koTextNode.x = 0;
    koTextNode.y = koTextY;
  }

  // Update card-text-en (English)
  var enTextHeight = textAreaHeight - koTextHeight;
  var enTextY = koTextY + koTextHeight - 17;

  var enTextNode = cardFrame.findOne(
    (n) => n.name === 'card-text-en' && n.type === 'TEXT'
  ) as TextNode | null;

  if (enTextNode) {
    enTextNode.fontName = { family: fontFamily, style: 'Bold' };
    enTextNode.fontSize = CARD_EN_FONT_SIZE;
    enTextNode.characters = enContent;
    enTextNode.resize(width, enTextHeight);
    enTextNode.x = 0;
    enTextNode.y = enTextY;
  }
}

/**
 * Color all '=' characters in a text node with the card stroke color.
 */
function applyEqualsColor(textNode: TextNode): void {
  var text = textNode.characters;
  var eqColor = hexToFigmaColor(CARD_STROKE_COLOR);
  for (var i = 0; i < text.length; i++) {
    if (text[i] === '=') {
      textNode.setRangeFills(i, i + 1, [{ type: 'SOLID', color: eqColor }]);
    }
  }
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
  applyEqualsColor(koTextNode);
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
