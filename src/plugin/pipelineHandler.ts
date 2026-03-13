/**
 * Pipeline message handlers for the storybook production workflow.
 * Handles story page creation, pipeline state persistence, and canvas layout.
 */

import { hexToFigmaColor } from './frameBuilder';
import type { UIToSandboxMessage } from '../shared/messageTypes';
import type { PipelineState } from '../shared/pipeline';
import { FRAME_NAMES, PLUGIN_DATA_KEYS } from '../shared/naming';
import {
  STORY_PAGE_WIDTH,
  STORY_PAGE_HEIGHT,
  PAGES_PER_ROW,
  PAGE_GAP_H,
  PAGE_GAP_V,
  TEMP_TEXT_BOX_WIDTH,
  TEMP_TEXT_BOX_HEIGHT,
  TEMP_TEXT_FONT_SIZE,
  TEMP_TEXT_BOX_GAP,
  DEFAULT_FONT_FAMILY,
} from '../shared/constants';

// ---- Pipeline State Persistence ----

const PIPELINE_DATA_NODE_NAME = 'PK-PipelineData';

function findPipelineDataNode(): FrameNode | null {
  return figma.currentPage.findOne(
    (n) => n.type === 'FRAME' && n.name === PIPELINE_DATA_NODE_NAME
  ) as FrameNode | null;
}

function getOrCreatePipelineDataNode(): FrameNode {
  let node = findPipelineDataNode();
  if (!node) {
    node = figma.createFrame();
    node.name = PIPELINE_DATA_NODE_NAME;
    node.resize(1, 1);
    node.visible = false;
    node.locked = true;
    // Place it far off-screen
    node.x = -99999;
    node.y = -99999;
  }
  return node;
}

function savePipelineState(state: PipelineState): void {
  const node = getOrCreatePipelineDataNode();
  node.setPluginData(PLUGIN_DATA_KEYS.pipelineState, JSON.stringify(state));
}

function loadPipelineState(): PipelineState | null {
  const node = findPipelineDataNode();
  if (!node) return null;
  const raw = node.getPluginData(PLUGIN_DATA_KEYS.pipelineState);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PipelineState;
  } catch {
    return null;
  }
}

// ---- Story Page Creation (Step 5) ----

interface StoryPageInput {
  textBlocks: string[][];
  isEmpty: boolean;
}

/**
 * Calculate the position of a page frame on the canvas.
 * Pages are laid out 2 per row, left-to-right, top-to-bottom.
 */
function getPagePosition(pageIndex: number): { x: number; y: number } {
  const col = pageIndex % PAGES_PER_ROW;
  const row = Math.floor(pageIndex / PAGES_PER_ROW);
  const x = col * (STORY_PAGE_WIDTH + PAGE_GAP_H);
  const y = row * (STORY_PAGE_HEIGHT + PAGE_GAP_V);
  return { x, y };
}

/**
 * Remove all existing story page frames from the canvas.
 */
function removeExistingStoryPages(): void {
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
async function createStoryPages(pages: StoryPageInput[]): Promise<string[]> {
  // Load fonts needed for text
  await figma.loadFontAsync({ family: DEFAULT_FONT_FAMILY, style: 'Regular' });
  // Fallback if NanumSquareRound not available
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
      let currentY = (STORY_PAGE_HEIGHT - calculateTextBlocksHeight(page.textBlocks)) / 2;
      // Ensure minimum top padding
      if (currentY < 90) currentY = 90;

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
 * Calculate total height of text blocks for vertical centering.
 */
function calculateTextBlocksHeight(textBlocks: string[][]): number {
  const blockCount = textBlocks.length;
  if (blockCount === 0) return 0;
  // Estimate: each block is TEMP_TEXT_BOX_HEIGHT, with gaps between them
  return blockCount * TEMP_TEXT_BOX_HEIGHT + (blockCount - 1) * TEMP_TEXT_BOX_GAP;
}

/**
 * Update existing story pages (re-create changed ones).
 * For simplicity, we re-create all pages. Optimization can come later.
 */
async function updateStoryPages(pages: StoryPageInput[]): Promise<string[]> {
  return createStoryPages(pages);
}

// ---- Main Pipeline Message Handler ----

/**
 * Handle pipeline-specific messages. Returns true if the message was handled.
 */
export async function handlePipelineMessage(msg: UIToSandboxMessage): Promise<boolean> {
  switch (msg.type) {
    case 'SAVE_PIPELINE_STATE': {
      try {
        savePipelineState(msg.state);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save pipeline state',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'LOAD_PIPELINE_STATE': {
      const state = loadPipelineState();
      figma.ui.postMessage({
        type: 'PIPELINE_STATE_LOADED',
        state,
      });
      return true;
    }

    case 'CREATE_STORY_PAGES': {
      try {
        const frameIds = await createStoryPages(msg.pages);
        figma.ui.postMessage({
          type: 'STORY_PAGES_CREATED',
          pageFrameIds: frameIds,
          pageCount: frameIds.length,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create story pages',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'UPDATE_STORY_PAGES': {
      try {
        const frameIds = await updateStoryPages(msg.pages);
        figma.ui.postMessage({
          type: 'STORY_PAGES_CREATED',
          pageFrameIds: frameIds,
          pageCount: frameIds.length,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to update story pages',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'NAVIGATE_TO_FRAME': {
      const target = figma.currentPage.findOne(
        (n) => n.name === msg.frameName
      ) as SceneNode | null;
      if (target) {
        figma.viewport.scrollAndZoomIntoView([target]);
      }
      return true;
    }

    case 'SAVE_STYLE_GUIDE':
    case 'SAVE_CHARACTERS':
    case 'SAVE_KEY_COLORS':
    case 'UPDATE_PROGRESS_DISPLAY':
    case 'CREATE_PART2_PAGES':
    case 'CREATE_PART3_LAYOUT':
    case 'STORE_SCENE_IMAGE':
    case 'SELECT_SCENE_IMAGE':
    case 'PLACE_DIALOGUE':
    case 'INSERT_PAGE_NUMBERS':
    case 'GENERATE_FINAL_OUTPUT':
    case 'CREATE_SNAPSHOT': {
      // Placeholder handlers - will be implemented in future milestones
      console.log(`Pipeline message received but not yet implemented: ${msg.type}`);
      return true;
    }

    default:
      return false; // Not a pipeline message
  }
}
