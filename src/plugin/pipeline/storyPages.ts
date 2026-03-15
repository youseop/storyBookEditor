/**
 * Story page creation — create/update/remove Part 1 page frames on the Figma canvas.
 */

import { getPagePosition } from './canvasHelpers';
import type { StoryPageInput } from './canvasHelpers';
import {
  STORY_PAGE_WIDTH,
  STORY_PAGE_HEIGHT,
  TEMP_TEXT_BOX_WIDTH,
  TEMP_TEXT_BOX_HEIGHT,
  TEMP_TEXT_FONT_SIZE,
  TEMP_TEXT_BOX_GAP,
  DEFAULT_FONT_FAMILY,
} from '../../shared/constants';
import { FRAME_NAMES, PLUGIN_DATA_KEYS } from '../../shared/naming';

/**
 * Remove all existing story page frames from the canvas.
 */
export function removeExistingStoryPages(): void {
  const existing = figma.currentPage.findAll(
    (n) => n.type === 'FRAME' && n.name.startsWith('PK-Part1-Page')
  ) as FrameNode[];
  for (const frame of existing) {
    frame.remove();
  }
}

/**
 * Create story page frames on the Figma canvas based on parsed page data.
 */
export async function createStoryPages(pages: StoryPageInput[]): Promise<string[]> {
  // Load fonts needed for text
  let fontFamily = DEFAULT_FONT_FAMILY;
  try {
    await figma.loadFontAsync({ family: fontFamily, style: 'Regular' });
  } catch {
    fontFamily = 'Inter';
    await figma.loadFontAsync({ family: fontFamily, style: 'Regular' });
  }

  // Remove old pages first
  removeExistingStoryPages();

  const frameIds: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pos = getPagePosition(i);

    // Create the page frame
    const frame = figma.createFrame();
    frame.name = FRAME_NAMES.part1Page(i);
    frame.resize(STORY_PAGE_WIDTH, STORY_PAGE_HEIGHT);
    frame.x = pos.x;
    frame.y = pos.y;
    frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

    // Store metadata
    frame.setPluginData(PLUGIN_DATA_KEYS.nodeType, 'story-page');
    frame.setPluginData(PLUGIN_DATA_KEYS.pageIndex, String(i));
    frame.setPluginData(PLUGIN_DATA_KEYS.partType, 'part1');

    if (page.isEmpty) {
      // Empty page - just show a centered label
      const label = figma.createText();
      label.fontName = { family: fontFamily, style: 'Regular' };
      label.characters = '[ 빈 페이지 - 이미지 전용 ]';
      label.fontSize = 120;
      label.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
      label.textAlignHorizontal = 'CENTER';
      label.resize(STORY_PAGE_WIDTH, 200);
      label.x = 0;
      label.y = STORY_PAGE_HEIGHT / 2 - 100;
      frame.appendChild(label);
    } else {
      // Place text blocks
      let currentY = 200; // Fixed top margin

      for (let blockIdx = 0; blockIdx < page.textBlocks.length; blockIdx++) {
        const block = page.textBlocks[blockIdx];
        const text = block.join('\n');

        const textNode = figma.createText();
        textNode.fontName = { family: fontFamily, style: 'Regular' };
        textNode.characters = text;
        textNode.fontSize = TEMP_TEXT_FONT_SIZE;
        textNode.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
        textNode.textAlignHorizontal = 'LEFT';
        textNode.textAlignVertical = 'TOP';
        textNode.resize(TEMP_TEXT_BOX_WIDTH, TEMP_TEXT_BOX_HEIGHT);
        textNode.textAutoResize = 'HEIGHT';
        textNode.name = `text-block-${blockIdx}`;

        // Center horizontally
        textNode.x = (STORY_PAGE_WIDTH - TEMP_TEXT_BOX_WIDTH) / 2;
        textNode.y = currentY;

        frame.appendChild(textNode);

        // Use actual text height + gap for next position
        currentY += textNode.height + TEMP_TEXT_BOX_GAP;
      }
    }

    // Store text data for later retrieval
    frame.setPluginData(PLUGIN_DATA_KEYS.textBlocks, JSON.stringify(page.textBlocks));

    frameIds.push(frame.id);
  }

  // Zoom to show all pages
  if (frameIds.length > 0) {
    const nodes = frameIds.map(id => figma.getNodeById(id)).filter(Boolean) as SceneNode[];
    if (nodes.length > 0) {
      figma.viewport.scrollAndZoomIntoView(nodes);
    }
  }

  return frameIds;
}

/**
 * Update existing story pages (re-create changed ones).
 * For simplicity, we re-create all pages. Optimization can come later.
 */
export async function updateStoryPages(pages: StoryPageInput[]): Promise<string[]> {
  return createStoryPages(pages);
}
