/**
 * Part 2 & Part 3 page creation — clone Part 1 pages with translations and key expression areas.
 */

import { getPagePosition, getPartRightX } from './canvasHelpers';
import { hexToFigmaColor } from '../frameBuilder';
import {
  STORY_PAGE_WIDTH,
  STORY_PAGE_HEIGHT,
  PAGE_GAP_H,
  TEMP_TEXT_FONT_SIZE,
  TEMP_TEXT_BOX_WIDTH,
  TEMP_TEXT_BOX_HEIGHT,
  DEFAULT_FONT_FAMILY,
  KEY_COLOR_A,
} from '../../shared/constants';
import { FRAME_NAMES, PLUGIN_DATA_KEYS } from '../../shared/naming';

/**
 * Create Part 2 pages by cloning Part 1 pages and adding English text below Korean text.
 */
export async function createPart2Pages(
  translations: Array<{ pageIndex: number; englishTextBlocks: string[][] }>
): Promise<number> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  let fontFamily = DEFAULT_FONT_FAMILY;
  try {
    await figma.loadFontAsync({ family: fontFamily, style: 'Regular' });
  } catch {
    fontFamily = 'Inter';
  }

  // Remove existing Part 2 pages
  const existingPart2 = figma.currentPage.findAll(
    (n) => n.type === 'FRAME' && n.name.startsWith('PK-Part2-Page')
  ) as FrameNode[];
  for (const f of existingPart2) f.remove();

  // Find all Part 1 pages sorted by page index
  const part1Frames = figma.currentPage.children
    .filter(
      (n) => n.name.startsWith('PK-Part1-Page') && n.type === 'FRAME'
    )
    .sort((a, b) => a.name.localeCompare(b.name)) as FrameNode[];

  if (part1Frames.length === 0) return 0;

  // Calculate position to the right of Part 1 with one page-width gap
  const part1Right = getPartRightX('PK-Part1-Page');
  const partGap = STORY_PAGE_WIDTH + PAGE_GAP_H;  // one page-width gap
  const part2StartX = part1Right + partGap;

  // Build translation lookup map
  const translationMap = new Map<number, string[][]>();
  for (const t of translations) {
    translationMap.set(t.pageIndex, t.englishTextBlocks);
  }

  let createdCount = 0;

  for (let i = 0; i < part1Frames.length; i++) {
    const part1Frame = part1Frames[i];

    // Clone Part 1 frame
    const clone = part1Frame.clone();
    clone.name = FRAME_NAMES.part2Page(i);

    // Reposition into Part 2 area (to the right of Part 1)
    const pos = getPagePosition(i);
    clone.x = part2StartX + pos.x;
    clone.y = pos.y;  // Same Y row as Part 1

    // Store metadata
    clone.setPluginData(PLUGIN_DATA_KEYS.partType, 'part2');
    clone.setPluginData(PLUGIN_DATA_KEYS.pageIndex, String(i));

    // Add English text below Korean text blocks
    const enBlocks = translationMap.get(i);
    if (enBlocks && enBlocks.length > 0) {
      // Find existing text nodes in the cloned frame
      const textNodes = clone.findAll(
        (n) => n.type === 'TEXT' && n.name.startsWith('text-block-')
      ) as TextNode[];

      for (let blockIdx = 0; blockIdx < textNodes.length; blockIdx++) {
        const koTextNode = textNodes[blockIdx];
        const enBlock = enBlocks[blockIdx];
        if (!enBlock) continue;

        const enText = enBlock.join('\n');

        const enTextNode = figma.createText();
        enTextNode.fontName = { family: 'Inter', style: 'Regular' };
        enTextNode.characters = enText;
        // Use proportional font size based on Korean text node
        const koFontSize = (koTextNode.fontSize as number) || TEMP_TEXT_FONT_SIZE;
        enTextNode.fontSize = Math.round(koFontSize * 0.8);
        enTextNode.fills = [
          { type: 'SOLID', color: { r: 0.35, g: 0.35, b: 0.35 } },
        ];
        enTextNode.textAlignHorizontal = 'LEFT';
        enTextNode.textAlignVertical = 'TOP';
        enTextNode.name = `en-text-block-${blockIdx}`;

        // Match Korean text box position and width
        enTextNode.x = koTextNode.x;
        enTextNode.y = koTextNode.y + koTextNode.height + 20;
        enTextNode.resize(koTextNode.width, enTextNode.height);
        enTextNode.textAutoResize = 'HEIGHT';

        clone.appendChild(enTextNode);
      }
    }

    createdCount++;
  }

  return createdCount;
}

// ---- Part 3 Layout Creation ----

/**
 * Create Part 3 pages with key color background, reduced-height Part 1 images,
 * repositioned dialogue text, and space for key expressions.
 */
export async function createPart3Layout(colorA: string): Promise<number> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  let fontFamily = DEFAULT_FONT_FAMILY;
  try {
    await figma.loadFontAsync({ family: fontFamily, style: 'Regular' });
  } catch {
    fontFamily = 'Inter';
  }

  // Remove existing Part 3 pages
  const existingPart3 = figma.currentPage.findAll(
    (n) => n.type === 'FRAME' && n.name.startsWith('PK-Part3-Page')
  ) as FrameNode[];
  for (const f of existingPart3) f.remove();

  // Find all Part 1 pages sorted
  const part1Frames = figma.currentPage.children
    .filter(
      (n) => n.name.startsWith('PK-Part1-Page') && n.type === 'FRAME'
    )
    .sort((a, b) => a.name.localeCompare(b.name)) as FrameNode[];

  if (part1Frames.length === 0) return 0;

  // Calculate position to the right of Part 2 (or Part 1 if Part 2 doesn't exist)
  const part2Right = getPartRightX('PK-Part2-Page');
  const part1Right = getPartRightX('PK-Part1-Page');
  const referenceRight = part2Right > 0 ? part2Right : part1Right;
  const partGap = STORY_PAGE_WIDTH + PAGE_GAP_H;
  const part3StartX = referenceRight + partGap;

  const bgColor = hexToFigmaColor(colorA || KEY_COLOR_A);

  // Height allocation: 60% for image content, 40% for key expressions area
  const imageAreaHeight = Math.round(STORY_PAGE_HEIGHT * 0.6);
  const keyExprAreaY = imageAreaHeight + 60; // Small gap between image and key expr area

  let createdCount = 0;

  for (let i = 0; i < part1Frames.length; i++) {
    const part1Frame = part1Frames[i];
    const pos = getPagePosition(i);

    // Create new Part 3 frame with key color background
    const frame = figma.createFrame();
    frame.name = FRAME_NAMES.part3Page(i);
    frame.resize(STORY_PAGE_WIDTH, STORY_PAGE_HEIGHT);
    frame.x = part3StartX + pos.x;
    frame.y = pos.y;  // Same Y row as Part 1
    frame.fills = [{ type: 'SOLID', color: bgColor }];

    // Store metadata
    frame.setPluginData(PLUGIN_DATA_KEYS.nodeType, 'story-page');
    frame.setPluginData(PLUGIN_DATA_KEYS.partType, 'part3');
    frame.setPluginData(PLUGIN_DATA_KEYS.pageIndex, String(i));

    // Clone Part 1 content and scale to 60% height (image area)
    const contentClone = part1Frame.clone();
    contentClone.name = `part1-content-${i}`;
    // Scale to fit in the image area (60% of page height)
    const scaleFactor = imageAreaHeight / STORY_PAGE_HEIGHT;
    contentClone.rescale(scaleFactor);
    contentClone.x = Math.round(
      (STORY_PAGE_WIDTH - contentClone.width) / 2
    );
    contentClone.y = 30; // Small top margin
    frame.appendChild(contentClone);

    // Re-place dialogue text from Part 1 data
    const textBlocksRaw = part1Frame.getPluginData(PLUGIN_DATA_KEYS.textBlocks);
    if (textBlocksRaw) {
      try {
        const textBlocks = JSON.parse(textBlocksRaw) as string[][];
        let textY = keyExprAreaY;
        for (let blockIdx = 0; blockIdx < textBlocks.length; blockIdx++) {
          const block = textBlocks[blockIdx];
          const text = block.join('\n');

          const textNode = figma.createText();
          textNode.fontName = { family: fontFamily, style: 'Regular' };
          textNode.characters = text;
          textNode.fontSize = TEMP_TEXT_FONT_SIZE * 0.7;
          textNode.fills = [
            { type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } },
          ];
          textNode.textAlignHorizontal = 'LEFT';
          textNode.textAlignVertical = 'TOP';
          textNode.resize(TEMP_TEXT_BOX_WIDTH * 0.9, TEMP_TEXT_BOX_HEIGHT);
          textNode.textAutoResize = 'HEIGHT';
          textNode.name = `part3-text-block-${blockIdx}`;
          textNode.x = (STORY_PAGE_WIDTH - TEMP_TEXT_BOX_WIDTH * 0.9) / 2;
          textNode.y = textY;
          frame.appendChild(textNode);

          textY += textNode.height + 40;
        }
      } catch {
        // Skip text placement on parse error
      }
    }

    // Add placeholder area indicator for key expressions
    const keyExprPlaceholder = figma.createText();
    keyExprPlaceholder.fontName = { family: 'Inter', style: 'Regular' };
    keyExprPlaceholder.characters = '[ Key Expressions Area ]';
    keyExprPlaceholder.fontSize = 60;
    keyExprPlaceholder.fills = [
      { type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } },
    ];
    keyExprPlaceholder.textAlignHorizontal = 'CENTER';
    keyExprPlaceholder.resize(STORY_PAGE_WIDTH - 200, 100);
    keyExprPlaceholder.x = 100;
    keyExprPlaceholder.y = STORY_PAGE_HEIGHT - 300;
    frame.appendChild(keyExprPlaceholder);

    createdCount++;
  }

  return createdCount;
}
