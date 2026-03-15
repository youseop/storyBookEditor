/**
 * Key expressions layout — apply key expression cards to Part 3 pages.
 */

import { hexToFigmaColor } from '../frameBuilder';
import {
  STORY_PAGE_WIDTH,
  STORY_PAGE_HEIGHT,
  DEFAULT_FONT_FAMILY,
} from '../../shared/constants';
import { FRAME_NAMES } from '../../shared/naming';
import type { ApplyKeyExpressionsMessage } from '../../shared/messageTypes';

/**
 * Apply key expression cards to Part 3 page frames.
 * Creates card layouts (standard, horizontal, note) within key-expr-area sub-frames.
 */
export async function handleApplyKeyExpressions(msg: ApplyKeyExpressionsMessage): Promise<void> {
  try {
    // Layout ratios: how much of the page height is for key expressions
    const layoutRatios: Record<string, number> = {
      'layout-a': 0.4,  // 40% for expressions
      'layout-b': 0.5,
      'layout-c': 0.6,
      'layout-d': 1.0,  // 100% for expressions (no image)
    };

    // Process each page's expressions
    for (const pageData of msg.expressions) {
      const { pageIndex, pageLayout, cards } = pageData;

      // Find the Part 3 frame for this page
      const frameName = FRAME_NAMES.part3Page(pageIndex);
      const part3Frame = figma.currentPage.findOne(
        (n) => n.name === frameName && n.type === 'FRAME'
      ) as FrameNode | null;

      if (!part3Frame) {
        console.log(`Part 3 frame not found for page ${pageIndex}: ${frameName}`);
        continue;
      }

      // Determine expression area size based on page layout
      const exprRatio = layoutRatios[pageLayout || 'layout-a'];
      const keyExprHeight = Math.round(STORY_PAGE_HEIGHT * exprRatio);
      const keyExprY = STORY_PAGE_HEIGHT - keyExprHeight;

      // Find or create key expression sub-frame within the Part 3 page
      let keyExprFrame = part3Frame.findOne(
        (n) => n.name === 'key-expr-area' && n.type === 'FRAME'
      ) as FrameNode | null;

      if (!keyExprFrame) {
        keyExprFrame = figma.createFrame();
        keyExprFrame.name = 'key-expr-area';
        keyExprFrame.resize(STORY_PAGE_WIDTH, keyExprHeight);
        keyExprFrame.x = 0;
        keyExprFrame.y = keyExprY;
        keyExprFrame.fills = []; // Transparent
        keyExprFrame.clipsContent = true;
        part3Frame.appendChild(keyExprFrame);
      } else {
        // Update size and position based on layout
        keyExprFrame.resize(STORY_PAGE_WIDTH, keyExprHeight);
        keyExprFrame.y = keyExprY;
        // Clear existing key expression content
        while (keyExprFrame.children.length > 0) {
          keyExprFrame.children[0].remove();
        }
      }

      // Calculate standard card size (4 standard cards per row)
      const gap = 40;
      const standardCardSize = Math.floor((keyExprFrame.width - 5 * gap) / 4);
      let fontFamily = DEFAULT_FONT_FAMILY;
      try {
        await figma.loadFontAsync({ family: fontFamily, style: 'Regular' });
        await figma.loadFontAsync({ family: fontFamily, style: 'Bold' });
      } catch {
        fontFamily = 'Inter';
        await figma.loadFontAsync({ family: fontFamily, style: 'Regular' });
        await figma.loadFontAsync({ family: fontFamily, style: 'Bold' });
      }

      // Track grid position (in standard-card units, 4 per row)
      let gridCol = 0;
      let gridRow = 0;

      for (let cardIdx = 0; cardIdx < cards.length; cardIdx++) {
        const card = cards[cardIdx];
        const template = card.template || 'standard';

        // Determine card dimensions based on template
        const cardColSpan = template === 'horizontal' ? 2 : 1;
        // Check if card fits on current row, wrap if needed
        if (gridCol + cardColSpan > 4) {
          gridCol = 0;
          gridRow++;
        }

        const cardW = cardColSpan * standardCardSize + (cardColSpan - 1) * gap;
        const cardH = standardCardSize;

        const cardFrame = figma.createFrame();
        cardFrame.name = `key-expr-card-${cardIdx}`;
        cardFrame.resize(cardW, cardH);
        cardFrame.x = gap + gridCol * (standardCardSize + gap);
        cardFrame.y = gap + gridRow * (standardCardSize + gap);
        cardFrame.cornerRadius = 24;
        cardFrame.strokeWeight = 6;

        if (template === 'note') {
          // Note card: light yellow background, no image, no stroke
          cardFrame.fills = [{ type: 'SOLID', color: hexToFigmaColor('#FFF9E6') }];
          cardFrame.strokes = [{ type: 'SOLID', color: hexToFigmaColor('#FFF69B') }];

          // Tip label at top
          const tipLabel = figma.createText();
          tipLabel.fontName = { family: fontFamily, style: 'Bold' };
          tipLabel.characters = 'TIP';
          tipLabel.fontSize = Math.round(cardH * 0.07);
          tipLabel.fills = [{ type: 'SOLID', color: hexToFigmaColor('#E68A00') }];
          tipLabel.textAlignHorizontal = 'LEFT';
          tipLabel.resize(cardW - 40, cardH * 0.1);
          tipLabel.textAutoResize = 'HEIGHT';
          tipLabel.x = 20;
          tipLabel.y = 20;
          cardFrame.appendChild(tipLabel);

          // Korean text (full height for text since no image)
          const koText = figma.createText();
          koText.fontName = { family: fontFamily, style: 'Bold' };
          koText.characters = card.lines.join('\n');
          koText.fontSize = Math.round(cardH * 0.08);
          koText.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
          koText.textAlignHorizontal = 'CENTER';
          koText.resize(cardW - 40, cardH * 0.3);
          koText.textAutoResize = 'HEIGHT';
          koText.x = 20;
          koText.y = tipLabel.y + tipLabel.height + 15;
          cardFrame.appendChild(koText);

          // English text
          if (card.enLines && card.enLines.length > 0) {
            const enText = figma.createText();
            enText.fontName = { family: fontFamily, style: 'Regular' };
            enText.characters = card.enLines.join('\n');
            enText.fontSize = Math.round(cardH * 0.06);
            enText.fills = [{ type: 'SOLID', color: { r: 0.42, g: 0.42, b: 0.42 } }];
            enText.textAlignHorizontal = 'CENTER';
            enText.resize(cardW - 40, cardH * 0.2);
            enText.textAutoResize = 'HEIGHT';
            enText.x = 20;
            enText.y = koText.y + koText.height + 10;
            cardFrame.appendChild(enText);
          }
        } else if (template === 'horizontal') {
          // Horizontal card: image left (40%), text right (60%)
          cardFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
          cardFrame.strokes = [{ type: 'SOLID', color: hexToFigmaColor('#FFB74A') }];

          const imgW = Math.round(cardW * 0.4);
          const imgFrame = figma.createFrame();
          imgFrame.name = `key-expr-img-${cardIdx}`;
          imgFrame.resize(imgW - 30, cardH - 40);
          imgFrame.x = 10;
          imgFrame.y = 20;
          imgFrame.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }];
          imgFrame.cornerRadius = 16;
          cardFrame.appendChild(imgFrame);

          // Text area on the right
          const textX = imgW + 10;
          const textW = cardW - imgW - 30;
          const textAreaCenterY = Math.round(cardH * 0.35);

          // Korean text
          const koText = figma.createText();
          koText.fontName = { family: fontFamily, style: 'Bold' };
          koText.characters = card.lines.join('\n');
          koText.fontSize = Math.round(cardH * 0.08);
          koText.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
          koText.textAlignHorizontal = 'LEFT';
          koText.resize(textW, cardH * 0.3);
          koText.textAutoResize = 'HEIGHT';
          koText.x = textX;
          koText.y = textAreaCenterY;
          cardFrame.appendChild(koText);

          // English text
          if (card.enLines && card.enLines.length > 0) {
            const enText = figma.createText();
            enText.fontName = { family: fontFamily, style: 'Regular' };
            enText.characters = card.enLines.join('\n');
            enText.fontSize = Math.round(cardH * 0.06);
            enText.fills = [{ type: 'SOLID', color: { r: 0.42, g: 0.42, b: 0.42 } }];
            enText.textAlignHorizontal = 'LEFT';
            enText.resize(textW, cardH * 0.2);
            enText.textAutoResize = 'HEIGHT';
            enText.x = textX;
            enText.y = koText.y + koText.height + 10;
            cardFrame.appendChild(enText);
          }
        } else {
          // Standard card: image top (67%), text bottom (33%)
          cardFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
          cardFrame.strokes = [{ type: 'SOLID', color: hexToFigmaColor('#FFB74A') }];

          // Image area (top 67%)
          const imgHeight = Math.round(cardH * 0.67);
          const imgFrame = figma.createFrame();
          imgFrame.name = `key-expr-img-${cardIdx}`;
          imgFrame.resize(cardW - 40, imgHeight - 20);
          imgFrame.x = 20;
          imgFrame.y = 10;
          imgFrame.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }];
          imgFrame.cornerRadius = 16;
          cardFrame.appendChild(imgFrame);

          // Korean text
          const textY = imgHeight;
          const koText = figma.createText();
          koText.fontName = { family: fontFamily, style: 'Bold' };
          koText.characters = card.lines.join('\n');
          koText.fontSize = Math.round(cardH * 0.08);
          koText.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
          koText.textAlignHorizontal = 'CENTER';
          koText.resize(cardW - 40, cardH * 0.15);
          koText.textAutoResize = 'HEIGHT';
          koText.x = 20;
          koText.y = textY + 5;
          cardFrame.appendChild(koText);

          // English text
          if (card.enLines && card.enLines.length > 0) {
            const enText = figma.createText();
            enText.fontName = { family: fontFamily, style: 'Regular' };
            enText.characters = card.enLines.join('\n');
            enText.fontSize = Math.round(cardH * 0.06);
            enText.fills = [{ type: 'SOLID', color: { r: 0.42, g: 0.42, b: 0.42 } }];
            enText.textAlignHorizontal = 'CENTER';
            enText.resize(cardW - 40, cardH * 0.12);
            enText.textAutoResize = 'HEIGHT';
            enText.x = 20;
            enText.y = koText.y + koText.height + 5;
            cardFrame.appendChild(enText);
          }
        }

        keyExprFrame.appendChild(cardFrame);

        // Advance grid position
        gridCol += cardColSpan;
        if (gridCol >= 4) {
          gridCol = 0;
          gridRow++;
        }
      }
    }

    figma.ui.postMessage({
      type: 'LAYOUT_CREATED',
      placements: [],
      frameId: '',
    });
  } catch (err: any) {
    figma.ui.postMessage({
      type: 'ERROR',
      message: 'Failed to apply key expressions',
      detail: err?.message ?? String(err),
    });
  }
}
