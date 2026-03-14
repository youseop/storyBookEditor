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
  PROGRESS_AREA_Y,
  SNAPSHOT_AREA_GAP,
  PART_SEPARATOR_ROWS,
  PAGE_NUMBER_FONT_SIZE,
  PAGE_NUMBER_MARGIN,
  KEY_COLOR_A,
  META_AREA_X,
  META_AREA_Y,
  META_SECTION_GAP,
} from '../shared/constants';
import { Phase, PHASE_INFO, Step, STEP_INFO } from '../shared/pipeline';

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
async function updateStoryPages(pages: StoryPageInput[]): Promise<string[]> {
  return createStoryPages(pages);
}

// ---- Progress Display (PK-Progress) ----

/**
 * Determine which Phase a step number belongs to and produce phase metadata.
 */
function getPhaseInfoForDisplay(): { name: string; rangeStart: number; rangeEnd: number }[] {
  const phases = Object.values(Phase);
  return phases.map((phase) => {
    const info = PHASE_INFO[phase];
    const steps = info.steps;
    return {
      name: info.title,
      rangeStart: steps[0] as number,
      rangeEnd: steps[steps.length - 1] as number,
    };
  });
}

/**
 * Create/update a visual progress bar at the top of the Figma canvas.
 * Shows 5 phase dots connected by lines with current step indicator.
 */
async function updateProgressDisplay(
  currentStep: number,
  completedSteps: number[]
): Promise<void> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  // Remove old progress frame
  const old = figma.currentPage.findOne(
    (n) => n.name === FRAME_NAMES.progress
  ) as FrameNode | null;
  if (old) old.remove();

  // Create progress frame
  const frame = figma.createFrame();
  frame.name = FRAME_NAMES.progress;
  frame.resize(3000, 300);
  frame.x = 0;
  frame.y = PROGRESS_AREA_Y;
  frame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
  frame.cornerRadius = 20;
  frame.locked = true;

  // Phase info derived from pipeline.ts
  const phases = getPhaseInfoForDisplay();

  const dotSize = 40;
  const spacing = 550;
  const startX = 200;
  const dotY = 80;

  const COLOR_GREEN: RGB = { r: 0.106, g: 0.769, b: 0.49 };
  const COLOR_BLUE: RGB = { r: 0.094, g: 0.627, b: 0.984 };
  const COLOR_GRAY: RGB = { r: 0.9, g: 0.9, b: 0.9 };
  const COLOR_GRAY_TEXT: RGB = { r: 0.5, g: 0.5, b: 0.5 };

  for (let i = 0; i < phases.length; i++) {
    const x = startX + i * spacing;
    const { rangeStart, rangeEnd } = phases[i];

    // Determine phase status
    const isCompleted = completedSteps.includes(rangeEnd as number);
    const isCurrent = currentStep >= rangeStart && currentStep <= rangeEnd;

    // Draw connecting line (except after last phase)
    if (i < phases.length - 1) {
      const line = figma.createRectangle();
      line.resize(spacing - dotSize, 4);
      line.x = x + dotSize;
      line.y = dotY + dotSize / 2 - 2;
      line.fills = [
        { type: 'SOLID', color: isCompleted ? COLOR_GREEN : COLOR_GRAY },
      ];
      frame.appendChild(line);
    }

    // Draw dot
    const dot = figma.createEllipse();
    dot.resize(dotSize, dotSize);
    dot.x = x;
    dot.y = dotY;
    if (isCompleted) {
      dot.fills = [{ type: 'SOLID', color: COLOR_GREEN }];
    } else if (isCurrent) {
      dot.fills = [{ type: 'SOLID', color: COLOR_BLUE }];
    } else {
      dot.fills = [{ type: 'SOLID', color: COLOR_GRAY }];
    }
    frame.appendChild(dot);

    // Phase label
    const label = figma.createText();
    label.fontName = {
      family: 'Inter',
      style: isCurrent ? 'Bold' : 'Regular',
    };
    label.characters = phases[i].name;
    label.fontSize = 28;
    label.fills = [
      { type: 'SOLID', color: isCurrent ? COLOR_BLUE : COLOR_GRAY_TEXT },
    ];
    label.x = x - 20;
    label.y = dotY + dotSize + 15;
    frame.appendChild(label);
  }

  // Current step text
  const stepInfo = STEP_INFO[currentStep as Step];
  const stepLabel = stepInfo
    ? `Step ${currentStep} / 20 — ${stepInfo.title}`
    : `Step ${currentStep} / 20`;

  const stepText = figma.createText();
  stepText.fontName = { family: 'Inter', style: 'Bold' };
  stepText.characters = stepLabel;
  stepText.fontSize = 36;
  stepText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  stepText.x = startX;
  stepText.y = 220;
  frame.appendChild(stepText);
}

// ---- Snapshot / Rollback (2-slot rolling) ----

/**
 * Create a snapshot of all PK-Part* frames with 2-slot rolling management.
 * Slot 2 is deleted, Slot 1 renamed to Slot 2, new snapshot becomes Slot 1.
 */
async function createSnapshot(
  label: string
): Promise<{ slot: number; label: string }> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  // Find the bottom-most content frame to position snapshot below
  let maxY = 0;
  figma.currentPage.children.forEach((n) => {
    if (
      n.name.startsWith('PK-') &&
      !n.name.startsWith('PK-Snapshot') &&
      !n.name.startsWith('PK-Pipeline')
    ) {
      const bottom = n.y + ('height' in n ? (n as SceneNode & { height: number }).height : 0);
      if (bottom > maxY) maxY = bottom;
    }
  });

  // Rolling slot management
  const slot2 = figma.currentPage.findOne(
    (n) => n.name === FRAME_NAMES.snapshotSlot(2)
  ) as FrameNode | null;
  if (slot2) slot2.remove();

  const slot1 = figma.currentPage.findOne(
    (n) => n.name === FRAME_NAMES.snapshotSlot(1)
  ) as FrameNode | null;
  if (slot1) {
    slot1.name = FRAME_NAMES.snapshotSlot(2);
  }

  // Create new snapshot frame
  const snapshotFrame = figma.createFrame();
  snapshotFrame.name = FRAME_NAMES.snapshotSlot(1);
  snapshotFrame.x = 0;
  snapshotFrame.y = maxY + SNAPSHOT_AREA_GAP;
  snapshotFrame.fills = [
    { type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } },
  ];
  snapshotFrame.locked = true;

  // Store metadata via pluginData
  const timestamp = new Date().toISOString();
  snapshotFrame.setPluginData(PLUGIN_DATA_KEYS.snapshotLabel, label);
  snapshotFrame.setPluginData(PLUGIN_DATA_KEYS.snapshotTimestamp, timestamp);
  snapshotFrame.setPluginData(PLUGIN_DATA_KEYS.nodeType, 'snapshot');

  // Save pipeline state JSON for potential restoration
  const pipelineDataNode = findPipelineDataNode();
  if (pipelineDataNode) {
    const stateJson = pipelineDataNode.getPluginData(PLUGIN_DATA_KEYS.pipelineState);
    if (stateJson) {
      snapshotFrame.setPluginData('pk-snapshot-state', stateJson);
    }
  }

  // Add label text
  const labelText = figma.createText();
  labelText.fontName = { family: 'Inter', style: 'Regular' };
  labelText.characters = `Snapshot: ${label} (${timestamp.slice(0, 16).replace('T', ' ')})`;
  labelText.fontSize = 48;
  labelText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
  labelText.x = 50;
  labelText.y = 50;
  snapshotFrame.appendChild(labelText);

  // Clone all PK-* frames into snapshot (excludes data nodes, snapshots, and gallery)
  const partFrames = figma.currentPage.children.filter(
    (n) =>
      n.name.startsWith('PK-') &&
      n.type === 'FRAME' &&
      !n.name.startsWith('PK-Snapshot') &&
      !n.name.startsWith('PK-Pipeline') &&
      !n.name.startsWith('PK-Image-Gallery')
  ) as FrameNode[];

  let cloneX = 50;
  let cloneY = 150;
  for (const partFrame of partFrames) {
    const clone = partFrame.clone();
    clone.x = cloneX;
    clone.y = cloneY;
    // Scale down to 10% for overview
    clone.rescale(0.1);
    snapshotFrame.appendChild(clone);
    cloneX += clone.width + 20;
    // Wrap to next row if too wide
    if (cloneX > 5000) {
      cloneX = 50;
      cloneY += clone.height + 20;
    }
  }

  // Resize snapshot frame to fit contents
  if (snapshotFrame.children.length > 0) {
    let maxRight = 3000;
    let maxBottom = 300;
    for (const child of snapshotFrame.children) {
      const childRight = child.x + ('width' in child ? (child as SceneNode & { width: number }).width : 0);
      const childBottom = child.y + ('height' in child ? (child as SceneNode & { height: number }).height : 0);
      if (childRight > maxRight) maxRight = childRight;
      if (childBottom > maxBottom) maxBottom = childBottom;
    }
    snapshotFrame.resize(maxRight + 100, maxBottom + 100);
  } else {
    snapshotFrame.resize(3000, 300);
  }

  return { slot: 1, label };
}

// ---- Navigate to Frame ----

/**
 * Navigate to a frame by name, falling back to pluginData nodeType search.
 */
function navigateToFrame(frameName: string): boolean {
  // Try by exact name first
  let target = figma.currentPage.findOne(
    (n) => n.name === frameName
  ) as SceneNode | null;

  // Fallback: try by pluginData nodeType
  if (!target) {
    target = figma.currentPage.findOne((n) => {
      if ('getPluginData' in n) {
        return (n as SceneNode).getPluginData?.(PLUGIN_DATA_KEYS.nodeType) === frameName;
      }
      return false;
    }) as SceneNode | null;
  }

  if (target) {
    figma.viewport.scrollAndZoomIntoView([target]);
    return true;
  }

  return false;
}

// ---- Part 2 Pages Creation ----

/**
 * Find the bottom Y position of all frames matching a given part prefix.
 */
function getPartBottomY(partPrefix: string): number {
  let maxY = 0;
  figma.currentPage.children.forEach((n) => {
    if (n.name.startsWith(partPrefix) && n.type === 'FRAME') {
      const bottom = n.y + (n as FrameNode).height;
      if (bottom > maxY) maxY = bottom;
    }
  });
  return maxY;
}

/**
 * Create Part 2 pages by cloning Part 1 pages and adding English text below Korean text.
 */
async function createPart2Pages(
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

  // Calculate position below Part 1 with separator gap
  const part1Bottom = getPartBottomY('PK-Part1-Page');
  const separatorGap =
    PART_SEPARATOR_ROWS * (STORY_PAGE_HEIGHT + PAGE_GAP_V);
  const part2StartY = part1Bottom + separatorGap;

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

    // Reposition into Part 2 area
    const pos = getPagePosition(i);
    clone.x = pos.x;
    clone.y = part2StartY + pos.y;

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
        enTextNode.fontName = { family: fontFamily, style: 'Regular' };
        enTextNode.characters = enText;
        enTextNode.fontSize = TEMP_TEXT_FONT_SIZE * 0.8; // Slightly smaller for English
        enTextNode.fills = [
          { type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } },
        ];
        enTextNode.textAlignHorizontal = 'LEFT';
        enTextNode.textAlignVertical = 'TOP';
        enTextNode.resize(TEMP_TEXT_BOX_WIDTH, TEMP_TEXT_BOX_HEIGHT);
        enTextNode.textAutoResize = 'HEIGHT';
        enTextNode.name = `en-text-block-${blockIdx}`;

        // Position below Korean text
        enTextNode.x = koTextNode.x;
        enTextNode.y = koTextNode.y + koTextNode.height + 40;

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
async function createPart3Layout(colorA: string): Promise<number> {
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

  // Calculate position below Part 2 (or Part 1 if Part 2 doesn't exist)
  const part2Bottom = getPartBottomY('PK-Part2-Page');
  const part1Bottom = getPartBottomY('PK-Part1-Page');
  const referenceBottom = part2Bottom > 0 ? part2Bottom : part1Bottom;
  const separatorGap =
    PART_SEPARATOR_ROWS * (STORY_PAGE_HEIGHT + PAGE_GAP_V);
  const part3StartY = referenceBottom + separatorGap;

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
    frame.x = pos.x;
    frame.y = part3StartY + pos.y;
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

// ---- Page Numbers Insertion ----

/**
 * Check if a frame has a full-bleed image (an image fill covering the entire page).
 */
function hasFullBleedImage(frame: FrameNode): boolean {
  // Check if the frame itself has an image fill
  const frameFills = frame.fills;
  if (Array.isArray(frameFills)) {
    for (const fill of frameFills) {
      if (fill.type === 'IMAGE') return true;
    }
  }
  // Check direct children for a rectangle/frame with image fill covering full page
  for (const child of frame.children) {
    if (
      (child.type === 'RECTANGLE' || child.type === 'FRAME') &&
      'width' in child &&
      child.width >= STORY_PAGE_WIDTH * 0.95 &&
      'height' in child &&
      child.height >= STORY_PAGE_HEIGHT * 0.95
    ) {
      const childFills = (child as GeometryMixin).fills;
      if (Array.isArray(childFills)) {
        for (const fill of childFills) {
          if (fill.type === 'IMAGE') return true;
        }
      }
    }
  }
  return false;
}

/**
 * Insert page numbers on all Part frames.
 * Left pages (even index): "[number] brandText" at bottom-left
 * Right pages (odd index): "brandText [number]" at bottom-right
 */
async function insertPageNumbers(brandText: string): Promise<number> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  // Collect all part frames across all 3 parts, in order
  const allPartFrames: FrameNode[] = [];
  const partPrefixes = ['PK-Part1-Page', 'PK-Part2-Page', 'PK-Part3-Page'];

  for (const prefix of partPrefixes) {
    const frames = figma.currentPage.children
      .filter((n) => n.name.startsWith(prefix) && n.type === 'FRAME')
      .sort((a, b) => a.name.localeCompare(b.name)) as FrameNode[];
    allPartFrames.push(...frames);
  }

  // Remove existing page number nodes
  for (const frame of allPartFrames) {
    const existing = frame.findAll(
      (n) => n.name === 'page-number'
    );
    for (const e of existing) e.remove();
  }

  let insertedCount = 0;
  let pageNumber = 1;

  for (let i = 0; i < allPartFrames.length; i++) {
    const frame = allPartFrames[i];

    // Skip pages with full-bleed images
    if (hasFullBleedImage(frame)) {
      pageNumber++;
      continue;
    }

    const isLeftPage = i % 2 === 0; // Even index = left page
    const displayText = isLeftPage
      ? `${pageNumber} ${brandText}`
      : `${brandText} ${pageNumber}`;

    const pageNumText = figma.createText();
    pageNumText.fontName = { family: 'Inter', style: 'Regular' };
    pageNumText.characters = displayText;
    pageNumText.fontSize = PAGE_NUMBER_FONT_SIZE;
    pageNumText.fills = [
      { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } },
    ];
    pageNumText.name = 'page-number';

    if (isLeftPage) {
      // Bottom-left
      pageNumText.textAlignHorizontal = 'LEFT';
      pageNumText.x = PAGE_NUMBER_MARGIN;
    } else {
      // Bottom-right
      pageNumText.textAlignHorizontal = 'RIGHT';
      pageNumText.resize(STORY_PAGE_WIDTH - PAGE_NUMBER_MARGIN * 2, PAGE_NUMBER_FONT_SIZE * 1.5);
      pageNumText.x = PAGE_NUMBER_MARGIN;
    }
    pageNumText.y = STORY_PAGE_HEIGHT - PAGE_NUMBER_MARGIN - PAGE_NUMBER_FONT_SIZE;

    frame.appendChild(pageNumText);
    insertedCount++;
    pageNumber++;
  }

  return insertedCount;
}

// ---- Final Output Generation ----

/**
 * Generate final output pages: spread (2:1 paired) or individual or both.
 */
async function generateFinalOutput(
  outputType: 'spread' | 'individual' | 'both'
): Promise<{ spreadPageName?: string; individualPageName?: string }> {
  const result: { spreadPageName?: string; individualPageName?: string } = {};

  // Gather all part frames in order
  const allPartFrames: FrameNode[] = [];
  const partPrefixes = ['PK-Part1-Page', 'PK-Part2-Page', 'PK-Part3-Page'];
  for (const prefix of partPrefixes) {
    const frames = figma.currentPage.children
      .filter((n) => n.name.startsWith(prefix) && n.type === 'FRAME')
      .sort((a, b) => a.name.localeCompare(b.name)) as FrameNode[];
    allPartFrames.push(...frames);
  }

  if (allPartFrames.length === 0) {
    throw new Error('No part frames found to generate output from');
  }

  // Generate spread output (paired 2:1 pages)
  if (outputType === 'spread' || outputType === 'both') {
    const spreadPage = figma.createPage();
    spreadPage.name = 'PK-Output-Spread';
    result.spreadPageName = spreadPage.name;

    let spreadY = 0;
    for (let i = 0; i < allPartFrames.length; i += 2) {
      const spreadWidth = STORY_PAGE_WIDTH * 2;
      const spreadFrame = figma.createFrame();
      spreadFrame.name = `Spread-${Math.floor(i / 2) + 1}`;
      spreadFrame.resize(spreadWidth, STORY_PAGE_HEIGHT);
      spreadFrame.x = 0;
      spreadFrame.y = spreadY;
      spreadFrame.fills = [
        { type: 'SOLID', color: { r: 1, g: 1, b: 1 } },
      ];

      // Left page
      const leftClone = allPartFrames[i].clone();
      leftClone.x = 0;
      leftClone.y = 0;
      spreadFrame.appendChild(leftClone);

      // Right page (if exists)
      if (i + 1 < allPartFrames.length) {
        const rightClone = allPartFrames[i + 1].clone();
        rightClone.x = STORY_PAGE_WIDTH;
        rightClone.y = 0;
        spreadFrame.appendChild(rightClone);
      }

      spreadPage.appendChild(spreadFrame);
      spreadY += STORY_PAGE_HEIGHT + PAGE_GAP_V;
    }
  }

  // Generate individual output (each page in its own frame)
  if (outputType === 'individual' || outputType === 'both') {
    const individualPage = figma.createPage();
    individualPage.name = 'PK-Output-Individual';
    result.individualPageName = individualPage.name;

    let indY = 0;
    for (let i = 0; i < allPartFrames.length; i++) {
      const clone = allPartFrames[i].clone();
      clone.name = `Page-${i + 1}`;
      clone.x = 0;
      clone.y = indY;
      individualPage.appendChild(clone);
      indY += STORY_PAGE_HEIGHT + PAGE_GAP_V;
    }
  }

  return result;
}

// ---- Inner Pages Creation (Step 19) ----

const INNER_PAGE_TEMPLATES: Record<string, { title: string; hasImage: boolean }> = {
  'intro': { title: 'Pronounce Korean', hasImage: false },
  'index': { title: 'Index', hasImage: false },
  'qr-title': { title: 'QR Resources', hasImage: false },
  'qr-guide': { title: 'QR Resources Guide', hasImage: true },
  'characters': { title: 'Characters', hasImage: true },
  'part1-title': { title: 'Part 1 - Korean', hasImage: false },
  'part2-title': { title: 'Part 2 - Korean + English', hasImage: false },
  'part3-title': { title: 'Part 3 - Korean + Key Expressions', hasImage: false },
  'blank-back': { title: '', hasImage: false },
  'class-info': { title: '1:1 Class', hasImage: false },
};

/**
 * Create inner page frames for each selected page type.
 * Positions all inner pages below the last part section with a separator gap.
 */
async function createInnerPages(
  pageTypes: string[],
  keyColorA: string,
  keyColorB: string,
  bookTitle?: string,
  bookTitleEn?: string
): Promise<number> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  const colorA = hexToFigmaColor(keyColorA || KEY_COLOR_A);
  const colorB = hexToFigmaColor(keyColorB || '#FFF69B');
  const WHITE: RGB = { r: 1, g: 1, b: 1 };
  const DARK_TEXT: RGB = { r: 0.13, g: 0.13, b: 0.13 };
  const GRAY_TEXT: RGB = { r: 0.5, g: 0.5, b: 0.5 };
  const LIGHT_GRAY: RGB = { r: 0.85, g: 0.85, b: 0.85 };

  // Remove existing inner page frames
  const existingInner = figma.currentPage.findAll(
    (n) => n.type === 'FRAME' && n.name.startsWith('PK-Inner-')
  ) as FrameNode[];
  for (const f of existingInner) f.remove();

  // Find the bottom Y position of the last part to position inner pages below
  const part3Bottom = getPartBottomY('PK-Part3-Page');
  const part2Bottom = getPartBottomY('PK-Part2-Page');
  const part1Bottom = getPartBottomY('PK-Part1-Page');
  const referenceBottom = Math.max(part3Bottom, part2Bottom, part1Bottom);
  const separatorGap = PART_SEPARATOR_ROWS * (STORY_PAGE_HEIGHT + PAGE_GAP_V);
  const innerStartY = referenceBottom > 0 ? referenceBottom + separatorGap : 0;

  const displayBookTitle = bookTitle || '';
  const displayBookTitleEn = bookTitleEn || 'Pronounce Korean';

  let createdCount = 0;

  for (let i = 0; i < pageTypes.length; i++) {
    const pageType = pageTypes[i];
    const template = INNER_PAGE_TEMPLATES[pageType];
    if (!template) continue;

    // Calculate position (2 per row, like story pages)
    const col = i % PAGES_PER_ROW;
    const row = Math.floor(i / PAGES_PER_ROW);
    const x = col * (STORY_PAGE_WIDTH + PAGE_GAP_H);
    const y = innerStartY + row * (STORY_PAGE_HEIGHT + PAGE_GAP_V);

    // Create the frame
    const frame = figma.createFrame();
    frame.name = `PK-Inner-${pageType}`;
    frame.resize(STORY_PAGE_WIDTH, STORY_PAGE_HEIGHT);
    frame.x = x;
    frame.y = y;
    frame.setPluginData(PLUGIN_DATA_KEYS.nodeType, 'story-page');

    // Build content based on page type
    switch (pageType) {
      case 'part1-title':
      case 'part2-title':
      case 'part3-title': {
        // Title pages: Key color A background, large centered title, book title at top
        frame.fills = [{ type: 'SOLID', color: colorA }];

        // Book title at top
        if (displayBookTitleEn) {
          const topTitle = figma.createText();
          topTitle.fontName = { family: 'Inter', style: 'Regular' };
          topTitle.characters = displayBookTitleEn;
          topTitle.fontSize = 120;
          topTitle.fills = [{ type: 'SOLID', color: WHITE }];
          topTitle.textAlignHorizontal = 'CENTER';
          topTitle.resize(STORY_PAGE_WIDTH - 400, 200);
          topTitle.x = 200;
          topTitle.y = 400;
          frame.appendChild(topTitle);
        }

        if (displayBookTitle) {
          const topTitleKo = figma.createText();
          topTitleKo.fontName = { family: 'Inter', style: 'Regular' };
          topTitleKo.characters = displayBookTitle;
          topTitleKo.fontSize = 80;
          topTitleKo.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
          topTitleKo.textAlignHorizontal = 'CENTER';
          topTitleKo.resize(STORY_PAGE_WIDTH - 400, 150);
          topTitleKo.x = 200;
          topTitleKo.y = 620;
          frame.appendChild(topTitleKo);
        }

        // Large centered part title
        const partTitle = figma.createText();
        partTitle.fontName = { family: 'Inter', style: 'Bold' };
        partTitle.characters = template.title;
        partTitle.fontSize = 200;
        partTitle.fills = [{ type: 'SOLID', color: WHITE }];
        partTitle.textAlignHorizontal = 'CENTER';
        partTitle.resize(STORY_PAGE_WIDTH - 200, 400);
        partTitle.textAutoResize = 'HEIGHT';
        partTitle.x = 100;
        partTitle.y = STORY_PAGE_HEIGHT / 2 - 200;
        frame.appendChild(partTitle);

        // Decorative line
        const line = figma.createRectangle();
        line.resize(800, 8);
        line.x = (STORY_PAGE_WIDTH - 800) / 2;
        line.y = STORY_PAGE_HEIGHT / 2 + 250;
        line.fills = [{ type: 'SOLID', color: WHITE }];
        line.opacity = 0.6;
        frame.appendChild(line);
        break;
      }

      case 'index': {
        // Index page: White background, "Index / 목차" title, placeholder lines
        frame.fills = [{ type: 'SOLID', color: WHITE }];

        const indexTitle = figma.createText();
        indexTitle.fontName = { family: 'Inter', style: 'Bold' };
        indexTitle.characters = 'Index / 목차';
        indexTitle.fontSize = 160;
        indexTitle.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        indexTitle.textAlignHorizontal = 'CENTER';
        indexTitle.resize(STORY_PAGE_WIDTH - 400, 250);
        indexTitle.x = 200;
        indexTitle.y = 300;
        frame.appendChild(indexTitle);

        // Divider line below title
        const divider = figma.createRectangle();
        divider.resize(STORY_PAGE_WIDTH - 600, 4);
        divider.x = 300;
        divider.y = 620;
        divider.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        frame.appendChild(divider);

        // Placeholder lines for page entries
        const lineStartY = 750;
        const lineSpacing = 140;
        const placeholderEntries = [
          'Part 1 — Korean ........................ 00',
          'Part 2 — Korean + English .............. 00',
          'Part 3 — Korean + Key Expressions ...... 00',
          'QR Resources ........................... 00',
          'Characters ............................. 00',
        ];

        for (let lineIdx = 0; lineIdx < placeholderEntries.length; lineIdx++) {
          const entryText = figma.createText();
          entryText.fontName = { family: 'Inter', style: 'Regular' };
          entryText.characters = placeholderEntries[lineIdx];
          entryText.fontSize = 80;
          entryText.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
          entryText.textAlignHorizontal = 'LEFT';
          entryText.resize(STORY_PAGE_WIDTH - 600, 120);
          entryText.x = 300;
          entryText.y = lineStartY + lineIdx * lineSpacing;
          frame.appendChild(entryText);
        }
        break;
      }

      case 'intro': {
        // Intro page: Key color B background, title, description placeholder
        frame.fills = [{ type: 'SOLID', color: colorB }];

        const introTitle = figma.createText();
        introTitle.fontName = { family: 'Inter', style: 'Bold' };
        introTitle.characters = 'Pronounce Korean';
        introTitle.fontSize = 180;
        introTitle.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        introTitle.textAlignHorizontal = 'CENTER';
        introTitle.resize(STORY_PAGE_WIDTH - 300, 300);
        introTitle.x = 150;
        introTitle.y = 600;
        frame.appendChild(introTitle);

        // Subtitle
        const subtitle = figma.createText();
        subtitle.fontName = { family: 'Inter', style: 'Regular' };
        subtitle.characters = '한국어 발음 학습 시리즈';
        subtitle.fontSize = 100;
        subtitle.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        subtitle.textAlignHorizontal = 'CENTER';
        subtitle.resize(STORY_PAGE_WIDTH - 300, 160);
        subtitle.x = 150;
        subtitle.y = 950;
        frame.appendChild(subtitle);

        // Description placeholder
        const descPlaceholder = figma.createText();
        descPlaceholder.fontName = { family: 'Inter', style: 'Regular' };
        descPlaceholder.characters = '[ 소개 내용을 여기에 작성하세요 ]\n\nThis book will help you learn Korean pronunciation\nthrough dialogues and key expressions.\n\n이 책은 대화와 핵심 표현을 통해\n한국어 발음을 배울 수 있도록 도와줍니다.';
        descPlaceholder.fontSize = 72;
        descPlaceholder.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        descPlaceholder.textAlignHorizontal = 'CENTER';
        descPlaceholder.resize(STORY_PAGE_WIDTH - 600, 1200);
        descPlaceholder.textAutoResize = 'HEIGHT';
        descPlaceholder.x = 300;
        descPlaceholder.y = 1400;
        frame.appendChild(descPlaceholder);
        break;
      }

      case 'qr-title': {
        // QR Title page: White background, title, QR placeholder
        frame.fills = [{ type: 'SOLID', color: WHITE }];

        const qrTitle = figma.createText();
        qrTitle.fontName = { family: 'Inter', style: 'Bold' };
        qrTitle.characters = 'QR Resources';
        qrTitle.fontSize = 160;
        qrTitle.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        qrTitle.textAlignHorizontal = 'CENTER';
        qrTitle.resize(STORY_PAGE_WIDTH - 400, 250);
        qrTitle.x = 200;
        qrTitle.y = 400;
        frame.appendChild(qrTitle);

        const qrSubtitle = figma.createText();
        qrSubtitle.fontName = { family: 'Inter', style: 'Regular' };
        qrSubtitle.characters = 'QR 코드로 학습 자료에 접근하세요';
        qrSubtitle.fontSize = 80;
        qrSubtitle.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        qrSubtitle.textAlignHorizontal = 'CENTER';
        qrSubtitle.resize(STORY_PAGE_WIDTH - 400, 130);
        qrSubtitle.x = 200;
        qrSubtitle.y = 700;
        frame.appendChild(qrSubtitle);

        // QR placeholder square
        const qrSize = 800;
        const qrPlaceholder = figma.createRectangle();
        qrPlaceholder.resize(qrSize, qrSize);
        qrPlaceholder.x = (STORY_PAGE_WIDTH - qrSize) / 2;
        qrPlaceholder.y = 1200;
        qrPlaceholder.fills = [{ type: 'SOLID', color: LIGHT_GRAY }];
        qrPlaceholder.cornerRadius = 40;
        qrPlaceholder.strokes = [{ type: 'SOLID', color: GRAY_TEXT }];
        qrPlaceholder.strokeWeight = 4;
        frame.appendChild(qrPlaceholder);

        // QR label inside placeholder
        const qrLabel = figma.createText();
        qrLabel.fontName = { family: 'Inter', style: 'Regular' };
        qrLabel.characters = '[ QR Code ]';
        qrLabel.fontSize = 80;
        qrLabel.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        qrLabel.textAlignHorizontal = 'CENTER';
        qrLabel.resize(qrSize, 120);
        qrLabel.x = (STORY_PAGE_WIDTH - qrSize) / 2;
        qrLabel.y = 1200 + (qrSize - 120) / 2;
        frame.appendChild(qrLabel);
        break;
      }

      case 'qr-guide': {
        // QR Guide page: White background, instructions, QR placeholder
        frame.fills = [{ type: 'SOLID', color: WHITE }];

        const guideTitle = figma.createText();
        guideTitle.fontName = { family: 'Inter', style: 'Bold' };
        guideTitle.characters = 'QR Resources Guide';
        guideTitle.fontSize = 140;
        guideTitle.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        guideTitle.textAlignHorizontal = 'CENTER';
        guideTitle.resize(STORY_PAGE_WIDTH - 400, 220);
        guideTitle.x = 200;
        guideTitle.y = 300;
        frame.appendChild(guideTitle);

        // Guide steps placeholder
        const guideSteps = figma.createText();
        guideSteps.fontName = { family: 'Inter', style: 'Regular' };
        guideSteps.characters = '1. 스마트폰 카메라로 QR 코드를 스캔하세요\n\n2. 링크를 클릭하여 학습 자료에 접근하세요\n\n3. 음성 파일과 추가 학습 자료를 확인하세요';
        guideSteps.fontSize = 72;
        guideSteps.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        guideSteps.textAlignHorizontal = 'LEFT';
        guideSteps.resize(STORY_PAGE_WIDTH - 600, 1000);
        guideSteps.textAutoResize = 'HEIGHT';
        guideSteps.x = 300;
        guideSteps.y = 700;
        frame.appendChild(guideSteps);

        // Image placeholder for guide illustration
        const imgPlaceholder = figma.createRectangle();
        imgPlaceholder.resize(STORY_PAGE_WIDTH - 600, 1200);
        imgPlaceholder.x = 300;
        imgPlaceholder.y = 1800;
        imgPlaceholder.fills = [{ type: 'SOLID', color: LIGHT_GRAY }];
        imgPlaceholder.cornerRadius = 30;
        frame.appendChild(imgPlaceholder);

        const imgLabel = figma.createText();
        imgLabel.fontName = { family: 'Inter', style: 'Regular' };
        imgLabel.characters = '[ 안내 이미지 ]';
        imgLabel.fontSize = 80;
        imgLabel.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        imgLabel.textAlignHorizontal = 'CENTER';
        imgLabel.resize(STORY_PAGE_WIDTH - 600, 120);
        imgLabel.x = 300;
        imgLabel.y = 1800 + (1200 - 120) / 2;
        frame.appendChild(imgLabel);
        break;
      }

      case 'characters': {
        // Characters page: White background, title, placeholder grid
        frame.fills = [{ type: 'SOLID', color: WHITE }];

        const charTitle = figma.createText();
        charTitle.fontName = { family: 'Inter', style: 'Bold' };
        charTitle.characters = 'Characters';
        charTitle.fontSize = 160;
        charTitle.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        charTitle.textAlignHorizontal = 'CENTER';
        charTitle.resize(STORY_PAGE_WIDTH - 400, 250);
        charTitle.x = 200;
        charTitle.y = 300;
        frame.appendChild(charTitle);

        const charSubtitle = figma.createText();
        charSubtitle.fontName = { family: 'Inter', style: 'Regular' };
        charSubtitle.characters = '등장인물 소개';
        charSubtitle.fontSize = 80;
        charSubtitle.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        charSubtitle.textAlignHorizontal = 'CENTER';
        charSubtitle.resize(STORY_PAGE_WIDTH - 400, 130);
        charSubtitle.x = 200;
        charSubtitle.y = 580;
        frame.appendChild(charSubtitle);

        // Character placeholder grid (2x3 grid)
        const charGridCols = 2;
        const charGridRows = 3;
        const charCardW = 1200;
        const charCardH = 800;
        const charGap = 100;
        const charGridStartX = (STORY_PAGE_WIDTH - (charGridCols * charCardW + (charGridCols - 1) * charGap)) / 2;
        const charGridStartY = 850;

        for (let r = 0; r < charGridRows; r++) {
          for (let c = 0; c < charGridCols; c++) {
            const charCard = figma.createFrame();
            charCard.name = `character-slot-${r * charGridCols + c}`;
            charCard.resize(charCardW, charCardH);
            charCard.x = charGridStartX + c * (charCardW + charGap);
            charCard.y = charGridStartY + r * (charCardH + charGap);
            charCard.fills = [{ type: 'SOLID', color: LIGHT_GRAY }];
            charCard.cornerRadius = 30;

            // Character image placeholder (circle)
            const circleSize = 300;
            const circle = figma.createEllipse();
            circle.resize(circleSize, circleSize);
            circle.x = (charCardW - circleSize) / 2;
            circle.y = 80;
            circle.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.92, b: 0.92 } }];
            charCard.appendChild(circle);

            // Name placeholder
            const charName = figma.createText();
            charName.fontName = { family: 'Inter', style: 'Bold' };
            charName.characters = `캐릭터 ${r * charGridCols + c + 1}`;
            charName.fontSize = 60;
            charName.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
            charName.textAlignHorizontal = 'CENTER';
            charName.resize(charCardW - 100, 90);
            charName.x = 50;
            charName.y = 430;
            charCard.appendChild(charName);

            // Description placeholder
            const charDesc = figma.createText();
            charDesc.fontName = { family: 'Inter', style: 'Regular' };
            charDesc.characters = '[ 설명 ]';
            charDesc.fontSize = 44;
            charDesc.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
            charDesc.textAlignHorizontal = 'CENTER';
            charDesc.resize(charCardW - 100, 70);
            charDesc.x = 50;
            charDesc.y = 550;
            charCard.appendChild(charDesc);

            frame.appendChild(charCard);
          }
        }
        break;
      }

      case 'blank-back': {
        // Blank page: Plain white, empty
        frame.fills = [{ type: 'SOLID', color: WHITE }];
        // Intentionally left empty
        break;
      }

      case 'class-info': {
        // Class info: Key color A background, centered text
        frame.fills = [{ type: 'SOLID', color: colorA }];

        const classTitle = figma.createText();
        classTitle.fontName = { family: 'Inter', style: 'Bold' };
        classTitle.characters = '1:1 한국어 대화 수업';
        classTitle.fontSize = 180;
        classTitle.fills = [{ type: 'SOLID', color: WHITE }];
        classTitle.textAlignHorizontal = 'CENTER';
        classTitle.resize(STORY_PAGE_WIDTH - 300, 280);
        classTitle.x = 150;
        classTitle.y = 800;
        frame.appendChild(classTitle);

        const classSubtitle = figma.createText();
        classSubtitle.fontName = { family: 'Inter', style: 'Regular' };
        classSubtitle.characters = '1:1 Korean Conversation Class';
        classSubtitle.fontSize = 100;
        classSubtitle.fills = [{ type: 'SOLID', color: WHITE }];
        classSubtitle.textAlignHorizontal = 'CENTER';
        classSubtitle.resize(STORY_PAGE_WIDTH - 300, 160);
        classSubtitle.x = 150;
        classSubtitle.y = 1150;
        frame.appendChild(classSubtitle);

        // Decorative line
        const classLine = figma.createRectangle();
        classLine.resize(600, 6);
        classLine.x = (STORY_PAGE_WIDTH - 600) / 2;
        classLine.y = 1450;
        classLine.fills = [{ type: 'SOLID', color: WHITE }];
        classLine.opacity = 0.7;
        frame.appendChild(classLine);

        // Description
        const classDesc = figma.createText();
        classDesc.fontName = { family: 'Inter', style: 'Regular' };
        classDesc.characters = '[ 수업 안내 내용을 여기에 작성하세요 ]\n\nQR 코드를 스캔하여 수업을 신청하세요';
        classDesc.fontSize = 72;
        classDesc.fills = [{ type: 'SOLID', color: WHITE }];
        classDesc.textAlignHorizontal = 'CENTER';
        classDesc.resize(STORY_PAGE_WIDTH - 600, 600);
        classDesc.textAutoResize = 'HEIGHT';
        classDesc.x = 300;
        classDesc.y = 1600;
        frame.appendChild(classDesc);

        // QR placeholder for class registration
        const classQrSize = 600;
        const classQr = figma.createRectangle();
        classQr.resize(classQrSize, classQrSize);
        classQr.x = (STORY_PAGE_WIDTH - classQrSize) / 2;
        classQr.y = 2300;
        classQr.fills = [{ type: 'SOLID', color: WHITE }];
        classQr.cornerRadius = 30;
        frame.appendChild(classQr);

        const classQrLabel = figma.createText();
        classQrLabel.fontName = { family: 'Inter', style: 'Regular' };
        classQrLabel.characters = '[ QR Code ]';
        classQrLabel.fontSize = 60;
        classQrLabel.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        classQrLabel.textAlignHorizontal = 'CENTER';
        classQrLabel.resize(classQrSize, 90);
        classQrLabel.x = (STORY_PAGE_WIDTH - classQrSize) / 2;
        classQrLabel.y = 2300 + (classQrSize - 90) / 2;
        frame.appendChild(classQrLabel);
        break;
      }

      default: {
        // Fallback: white page with title
        frame.fills = [{ type: 'SOLID', color: WHITE }];
        if (template.title) {
          const fallbackTitle = figma.createText();
          fallbackTitle.fontName = { family: 'Inter', style: 'Bold' };
          fallbackTitle.characters = template.title;
          fallbackTitle.fontSize = 160;
          fallbackTitle.fills = [{ type: 'SOLID', color: DARK_TEXT }];
          fallbackTitle.textAlignHorizontal = 'CENTER';
          fallbackTitle.resize(STORY_PAGE_WIDTH - 400, 250);
          fallbackTitle.x = 200;
          fallbackTitle.y = STORY_PAGE_HEIGHT / 2 - 125;
          frame.appendChild(fallbackTitle);
        }
        break;
      }
    }

    createdCount++;
  }

  // Zoom to show all inner pages
  const innerFrames = figma.currentPage.findAll(
    (n) => n.type === 'FRAME' && n.name.startsWith('PK-Inner-')
  ) as SceneNode[];
  if (innerFrames.length > 0) {
    figma.viewport.scrollAndZoomIntoView(innerFrames);
  }

  return createdCount;
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
      const found = navigateToFrame(msg.frameName);
      if (!found) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: `Frame not found: ${msg.frameName}`,
        });
      }
      return true;
    }

    case 'UPDATE_PROGRESS_DISPLAY': {
      try {
        await updateProgressDisplay(msg.currentStep, msg.completedSteps);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to update progress display',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'CREATE_SNAPSHOT': {
      try {
        const result = await createSnapshot(msg.label);
        figma.ui.postMessage({
          type: 'SNAPSHOT_CREATED',
          slot: result.slot,
          label: result.label,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create snapshot',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'CREATE_PART2_PAGES': {
      try {
        const count = await createPart2Pages(msg.translations);
        figma.ui.postMessage({
          type: 'PART2_PAGES_CREATED',
          pageCount: count,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create Part 2 pages',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'CREATE_PART3_LAYOUT': {
      try {
        const count = await createPart3Layout(msg.colorA);
        figma.ui.postMessage({
          type: 'PART3_LAYOUT_CREATED',
          pageCount: count,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create Part 3 layout',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'INSERT_PAGE_NUMBERS': {
      try {
        const count = await insertPageNumbers(msg.brandText);
        figma.ui.postMessage({
          type: 'PAGE_NUMBERS_INSERTED',
          count,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to insert page numbers',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'GENERATE_FINAL_OUTPUT': {
      try {
        const result = await generateFinalOutput(msg.outputType);
        figma.ui.postMessage({
          type: 'FINAL_OUTPUT_GENERATED',
          spreadPageName: result.spreadPageName,
          individualPageName: result.individualPageName,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to generate final output',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_STYLE_GUIDE': {
      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

        const dataNode = getOrCreatePipelineDataNode();
        if (msg.description) dataNode.setPluginData('pk-style-description', msg.description);

        let imageHash: string | undefined;
        if (msg.imageBytes && msg.imageBytes.length > 0) {
          const image = figma.createImage(new Uint8Array(msg.imageBytes));
          imageHash = image.hash;
          dataNode.setPluginData('pk-style-image-hash', imageHash);
        } else {
          imageHash = dataNode.getPluginData('pk-style-image-hash') || undefined;
        }

        // Create/update visible frame on canvas
        const frameName = FRAME_NAMES.metaStyleGuide;
        const old = figma.currentPage.findOne(n => n.name === frameName) as FrameNode | null;
        if (old) old.remove();

        const frame = figma.createFrame();
        frame.name = frameName;
        frame.x = META_AREA_X + 2700;
        frame.y = META_AREA_Y;
        frame.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
        frame.locked = true;
        frame.cornerRadius = 16;

        let contentHeight = 80;

        const title = figma.createText();
        title.fontName = { family: 'Inter', style: 'Bold' };
        title.characters = 'Style Guide';
        title.fontSize = 48;
        title.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
        title.x = 40;
        title.y = 30;
        frame.appendChild(title);
        contentHeight = 100;

        if (msg.description) {
          const desc = figma.createText();
          desc.fontName = { family: 'Inter', style: 'Regular' };
          desc.characters = msg.description;
          desc.fontSize = 24;
          desc.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
          desc.resize(700, 100);
          desc.textAutoResize = 'HEIGHT';
          desc.x = 40;
          desc.y = contentHeight;
          frame.appendChild(desc);
          contentHeight += desc.height + 30;
        }

        if (imageHash) {
          const imgRect = figma.createRectangle();
          imgRect.name = 'style-reference-image';
          imgRect.resize(400, 400);
          imgRect.x = 40;
          imgRect.y = contentHeight;
          imgRect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash }];
          imgRect.cornerRadius = 12;
          frame.appendChild(imgRect);

          const imgLabel = figma.createText();
          imgLabel.fontName = { family: 'Inter', style: 'Regular' };
          imgLabel.characters = 'Reference Image';
          imgLabel.fontSize = 18;
          imgLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
          imgLabel.x = 40;
          imgLabel.y = contentHeight + 410;
          frame.appendChild(imgLabel);
          contentHeight += 450;
        }

        frame.resize(800, contentHeight + 40);

        figma.ui.postMessage({ type: 'STYLE_GUIDE_SAVED', success: true });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save style guide',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_STORY_TEXT': {
      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

        const frameName = 'PK-Meta-StoryText';
        const old = figma.currentPage.findOne(n => n.name === frameName) as FrameNode | null;
        if (old) old.remove();

        const frame = figma.createFrame();
        frame.name = frameName;
        frame.x = META_AREA_X;
        frame.y = META_AREA_Y;
        frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        frame.locked = true;
        frame.cornerRadius = 16;

        let yPos = 40;

        if (msg.title) {
          const titleText = figma.createText();
          titleText.fontName = { family: 'Inter', style: 'Bold' };
          titleText.characters = msg.title;
          titleText.fontSize = 200;
          titleText.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
          titleText.x = 40;
          titleText.y = yPos;
          titleText.resize(2400, 300);
          titleText.textAutoResize = 'HEIGHT';
          frame.appendChild(titleText);
          yPos += titleText.height + 60;
        }

        if (msg.text) {
          const bodyText = figma.createText();
          bodyText.fontName = { family: 'Inter', style: 'Regular' };
          bodyText.characters = msg.text;
          bodyText.fontSize = 50;
          bodyText.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
          bodyText.x = 40;
          bodyText.y = yPos;
          bodyText.resize(2400, 500);
          bodyText.textAutoResize = 'HEIGHT';
          bodyText.lineHeight = { value: 180, unit: 'PERCENT' };
          frame.appendChild(bodyText);
          yPos += bodyText.height + 40;
        }

        frame.resize(2500, Math.max(400, yPos + 40));
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save story text',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_CHARACTERS': {
      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

        const dataNode = getOrCreatePipelineDataNode();
        dataNode.setPluginData(PLUGIN_DATA_KEYS.characterData, JSON.stringify(msg.characters));

        // Create visible character cards on canvas
        const frameName = FRAME_NAMES.metaCharacters;
        const old = figma.currentPage.findOne(n => n.name === frameName) as FrameNode | null;
        if (old) old.remove();

        const frame = figma.createFrame();
        frame.name = frameName;
        frame.x = META_AREA_X + 2700;
        frame.y = 1200;
        frame.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
        frame.locked = true;
        frame.cornerRadius = 16;

        const title = figma.createText();
        title.fontName = { family: 'Inter', style: 'Bold' };
        title.characters = 'Characters';
        title.fontSize = 48;
        title.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
        title.x = 40;
        title.y = 30;
        frame.appendChild(title);

        let cardY = 100;
        for (const char of msg.characters) {
          const nameText = figma.createText();
          nameText.fontName = { family: 'Inter', style: 'Bold' };
          nameText.characters = char.name || '(이름 없음)';
          nameText.fontSize = 28;
          nameText.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
          nameText.x = 40;
          nameText.y = cardY;
          frame.appendChild(nameText);

          const infoText = figma.createText();
          infoText.fontName = { family: 'Inter', style: 'Regular' };
          infoText.characters = `성격: ${char.personality || '-'}\n외형: ${char.appearance || '-'}`;
          infoText.fontSize = 18;
          infoText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
          infoText.resize(600, 60);
          infoText.textAutoResize = 'HEIGHT';
          infoText.x = 40;
          infoText.y = cardY + 38;
          frame.appendChild(infoText);

          cardY += 38 + infoText.height + 20;
        }

        frame.resize(800, Math.max(200, cardY + 20));
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save characters',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_CHARACTER_IMAGE': {
      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

        // Create/update the character's image in the Characters frame
        const charFrameName = FRAME_NAMES.metaCharacters;
        const charFrame = figma.currentPage.findOne(
          n => n.name === charFrameName && n.type === 'FRAME'
        ) as FrameNode | null;

        // Store image in Figma
        const imageBytes = new Uint8Array(msg.imageBytes);
        const image = figma.createImage(imageBytes);
        const imageHash = image.hash;

        // Store in data node for persistence
        const dataNode = getOrCreatePipelineDataNode();
        const existingData = dataNode.getPluginData('pk-character-images') || '{}';
        const charImageMap = JSON.parse(existingData) as Record<string, string>;
        charImageMap[msg.characterId] = imageHash;
        dataNode.setPluginData('pk-character-images', JSON.stringify(charImageMap));

        // Find or create characters frame
        let targetFrame = charFrame;
        if (!targetFrame) {
          targetFrame = figma.createFrame();
          targetFrame.name = charFrameName;
          targetFrame.x = META_AREA_X + 2700;
          targetFrame.y = 1200;
          targetFrame.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
          targetFrame.locked = true;
          targetFrame.cornerRadius = 16;
          targetFrame.resize(800, 200);
        }

        // Find or create image rectangle for this character
        const imgName = `char-img-${msg.characterId}`;
        const existingImg = targetFrame.findOne(n => n.name === imgName);
        if (existingImg) existingImg.remove();

        // Find the character's name text node to position image next to it
        const allChildren = targetFrame.findAll(n => n.type === 'TEXT') as TextNode[];
        const nameNode = allChildren.find(n => n.characters === (msg.characterName || '(이름 없음)'));

        const imgRect = figma.createRectangle();
        imgRect.name = imgName;
        imgRect.resize(120, 120);
        imgRect.cornerRadius = 12;
        imgRect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash }];

        if (nameNode) {
          imgRect.x = 660;
          imgRect.y = nameNode.y - 10;
        } else {
          imgRect.x = 660;
          imgRect.y = 100;
        }

        targetFrame.appendChild(imgRect);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save character image',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_KEY_COLORS': {
      try {
        const dataNode = getOrCreatePipelineDataNode();
        dataNode.setPluginData('pk-key-color-a', msg.colorA);
        dataNode.setPluginData('pk-key-color-b', msg.colorB);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save key colors',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'PLACE_DIALOGUE': {
      try {
        const frameName = FRAME_NAMES.part1Page(msg.pageIndex);
        const frame = figma.currentPage.findOne(
          (n) => n.name === frameName && n.type === 'FRAME'
        ) as FrameNode | null;
        if (!frame) throw new Error(`Frame not found: ${frameName}`);

        // Load font
        let fontFamily = DEFAULT_FONT_FAMILY;
        try {
          await figma.loadFontAsync({ family: fontFamily, style: 'Regular' });
        } catch {
          fontFamily = 'Inter';
          await figma.loadFontAsync({ family: fontFamily, style: 'Regular' });
        }

        // Get text blocks from page data
        const textBlocksRaw = frame.getPluginData(PLUGIN_DATA_KEYS.textBlocks);
        if (!textBlocksRaw) {
          figma.ui.postMessage({
            type: 'ERROR',
            message: `No text blocks found for page ${msg.pageIndex}`,
          });
          return true;
        }
        const textBlocks = JSON.parse(textBlocksRaw) as string[][];

        // Remove existing dialogue nodes
        const existingDialogue = frame.findAll(
          (n) => n.name.startsWith('dialogue-')
        );
        for (const e of existingDialogue) e.remove();

        // Place dialogue text with selected template
        const template = msg.template;
        let dialogueY = STORY_PAGE_HEIGHT * 0.65; // Start at 65% height

        for (let blockIdx = 0; blockIdx < textBlocks.length; blockIdx++) {
          const block = textBlocks[blockIdx];
          const text = block.join('\n');

          // Create dialogue container based on template
          const dialogueGroup = figma.createFrame();
          dialogueGroup.name = `dialogue-${blockIdx}`;
          dialogueGroup.fills = [];

          const padding = 40;
          const dialogueWidth = STORY_PAGE_WIDTH * 0.8;

          if (template === 'border-a' || template === 'border-b') {
            const borderColor = hexToFigmaColor(template === 'border-a' ? '#FFCF66' : '#FFF69B');
            dialogueGroup.strokes = [{ type: 'SOLID', color: borderColor }];
            dialogueGroup.strokeWeight = 8;
            dialogueGroup.cornerRadius = 24;
            dialogueGroup.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.85 }];
          } else {
            // Plain - no border, semi-transparent white background
            dialogueGroup.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.7 }];
            dialogueGroup.cornerRadius = 16;
          }

          const textNode = figma.createText();
          textNode.fontName = { family: fontFamily, style: 'Regular' };
          textNode.characters = text;
          textNode.fontSize = 140;
          textNode.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
          textNode.textAlignHorizontal = 'CENTER';
          textNode.resize(dialogueWidth - padding * 2, 200);
          textNode.textAutoResize = 'HEIGHT';
          textNode.x = padding;
          textNode.y = padding;
          dialogueGroup.appendChild(textNode);

          dialogueGroup.resize(dialogueWidth, textNode.height + padding * 2);
          dialogueGroup.x = (STORY_PAGE_WIDTH - dialogueWidth) / 2;
          dialogueGroup.y = dialogueY;
          frame.appendChild(dialogueGroup);

          dialogueY += dialogueGroup.height + 60;
        }
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to place dialogue',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'STORE_SCENE_IMAGE': {
      try {
        // Find or create scene image storage frame
        const storageName = FRAME_NAMES.metaPageImages(msg.pageIndex);
        let storageFrame = figma.currentPage.findOne(
          (n) => n.name === storageName && n.type === 'FRAME'
        ) as FrameNode | null;

        if (!storageFrame) {
          storageFrame = figma.createFrame();
          storageFrame.name = storageName;
          storageFrame.resize(1000, 250);
          // Position in meta area (left side of canvas)
          storageFrame.x = META_AREA_X + 2700;
          storageFrame.y = 2400 + msg.pageIndex * 400;
          storageFrame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
          storageFrame.setPluginData(PLUGIN_DATA_KEYS.nodeType, 'meta-page-images');
          storageFrame.setPluginData(PLUGIN_DATA_KEYS.pageIndex, String(msg.pageIndex));
        }

        // Create image from bytes
        const imageBytes = new Uint8Array(msg.imageBytes);
        const image = figma.createImage(imageBytes);
        const imageHash = image.hash;

        // Create rectangle to hold the image
        const imgSize = 200;
        const rect = figma.createRectangle();
        rect.name = `scene-img-${msg.pageIndex}-${msg.variant}`;
        rect.resize(imgSize, imgSize);
        rect.x = msg.variant * (imgSize + 20) + 20;
        rect.y = 30;
        rect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash }];
        rect.setPluginData('pageIndex', String(msg.pageIndex));
        rect.setPluginData('variant', String(msg.variant));
        rect.setPluginData('backgroundType', msg.backgroundType);
        rect.setPluginData('imageHash', imageHash);

        // Remove existing image with same variant
        const existing = storageFrame.findOne(
          (n) => n.name === `scene-img-${msg.pageIndex}-${msg.variant}`
        );
        if (existing) existing.remove();

        storageFrame.appendChild(rect);

        // Add label text
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        const label = figma.createText();
        label.fontName = { family: 'Inter', style: 'Regular' };
        label.characters = `V${msg.variant + 1} (${msg.backgroundType === 'white' ? '흰배경' : '풀배경'})`;
        label.fontSize = 14;
        label.x = rect.x;
        label.y = rect.y - 18;
        label.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
        label.name = `label-${msg.variant}`;
        // Remove existing label
        const existingLabel = storageFrame.findOne(n => n.name === `label-${msg.variant}`);
        if (existingLabel) existingLabel.remove();
        storageFrame.appendChild(label);

        figma.ui.postMessage({
          type: 'SCENE_IMAGE_STORED',
          pageIndex: msg.pageIndex,
          variant: msg.variant,
          imageHash,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: `Failed to store scene image for page ${msg.pageIndex + 1}`,
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SELECT_SCENE_IMAGE': {
      try {
        // Find the storage frame for this page
        const storageName = FRAME_NAMES.metaPageImages(msg.pageIndex);
        const storageFrame = figma.currentPage.findOne(
          (n) => n.name === storageName && n.type === 'FRAME'
        ) as FrameNode | null;

        if (!storageFrame) {
          throw new Error(`No images stored for page ${msg.pageIndex + 1}`);
        }

        // Find the selected variant's image hash
        const variantRect = storageFrame.findOne(
          (n) => n.name === `scene-img-${msg.pageIndex}-${msg.variant}` && n.type === 'RECTANGLE'
        ) as RectangleNode | null;

        if (!variantRect) {
          throw new Error(`Variant ${msg.variant} not found for page ${msg.pageIndex + 1}`);
        }

        const imageHash = variantRect.getPluginData('imageHash');
        if (!imageHash) throw new Error('Image hash not found');

        // Find the Part 1 page frame
        const pageName = FRAME_NAMES.part1Page(msg.pageIndex);
        const pageFrame = figma.currentPage.findOne(
          (n) => n.name === pageName && n.type === 'FRAME'
        ) as FrameNode | null;

        if (!pageFrame) {
          throw new Error(`Page frame not found: ${pageName}`);
        }

        // Remove existing scene image from page
        const existingSceneImg = pageFrame.findOne(
          (n) => n.name === 'scene-image' && n.type === 'RECTANGLE'
        );
        if (existingSceneImg) existingSceneImg.remove();

        // Create full-page background image
        const bgRect = figma.createRectangle();
        bgRect.name = 'scene-image';
        bgRect.resize(STORY_PAGE_WIDTH, STORY_PAGE_HEIGHT);
        bgRect.x = 0;
        bgRect.y = 0;
        bgRect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash }];

        // Insert at the bottom of the frame (behind text)
        if (pageFrame.children.length > 0) {
          pageFrame.insertChild(0, bgRect);
        } else {
          pageFrame.appendChild(bgRect);
        }

        // Store selection in page frame's pluginData
        pageFrame.setPluginData('selectedVariant', String(msg.variant));
        pageFrame.setPluginData('sceneImageHash', imageHash);

      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: `Failed to select scene image`,
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'APPLY_KEY_EXPRESSIONS': {
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
      return true;
    }

    case 'SAVE_SCENE_ANALYSIS': {
      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

        const frameName = FRAME_NAMES.metaSceneAnalysis;
        const old = figma.currentPage.findOne(n => n.name === frameName) as FrameNode | null;
        if (old) old.remove();

        const frame = figma.createFrame();
        frame.name = frameName;
        frame.x = META_AREA_X;
        frame.y = 3500;
        frame.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
        frame.locked = true;
        frame.cornerRadius = 16;

        const title = figma.createText();
        title.fontName = { family: 'Inter', style: 'Bold' };
        title.characters = 'Scene Analysis';
        title.fontSize = 48;
        title.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
        title.x = 40;
        title.y = 30;
        frame.appendChild(title);

        let yPos = 100;
        const m = msg as any;

        for (const page of m.pages) {
          // Page header
          const pageHeader = figma.createText();
          pageHeader.fontName = { family: 'Inter', style: 'Bold' };
          pageHeader.characters = `Page ${page.pageIndex + 1}`;
          pageHeader.fontSize = 28;
          pageHeader.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
          pageHeader.x = 40;
          pageHeader.y = yPos;
          frame.appendChild(pageHeader);
          yPos += 40;

          // Characters
          const charNames = page.characters
            .map((ch: any) => `${m.characterNames[ch.characterId] || ch.characterId}: ${ch.action}`)
            .join(', ');
          const charText = figma.createText();
          charText.fontName = { family: 'Inter', style: 'Regular' };
          charText.characters = `인물: ${charNames}`;
          charText.fontSize = 18;
          charText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
          charText.resize(700, 30);
          charText.textAutoResize = 'HEIGHT';
          charText.x = 40;
          charText.y = yPos;
          frame.appendChild(charText);
          yPos += charText.height + 8;

          // Scene description
          const sceneText = figma.createText();
          sceneText.fontName = { family: 'Inter', style: 'Regular' };
          sceneText.characters = `장면: ${page.sceneDescription}`;
          sceneText.fontSize = 18;
          sceneText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
          sceneText.resize(700, 30);
          sceneText.textAutoResize = 'HEIGHT';
          sceneText.x = 40;
          sceneText.y = yPos;
          frame.appendChild(sceneText);
          yPos += sceneText.height + 8;

          // Image prompt
          const promptText = figma.createText();
          promptText.fontName = { family: 'Inter', style: 'Regular' };
          promptText.characters = `프롬프트: ${page.imagePrompt}`;
          promptText.fontSize = 18;
          promptText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
          promptText.resize(700, 30);
          promptText.textAutoResize = 'HEIGHT';
          promptText.x = 40;
          promptText.y = yPos;
          frame.appendChild(promptText);
          yPos += promptText.height + 8;

          // Background type
          const bgText = figma.createText();
          bgText.fontName = { family: 'Inter', style: 'Regular' };
          bgText.characters = `배경: ${page.backgroundType === 'white' ? '흰 배경' : '풀 배경'}`;
          bgText.fontSize = 16;
          bgText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
          bgText.x = 40;
          bgText.y = yPos;
          frame.appendChild(bgText);
          yPos += 40;
        }

        frame.resize(800, Math.max(200, yPos + 40));

        figma.ui.postMessage({ type: 'SCENE_ANALYSIS_SAVED', success: true });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save scene analysis',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_BULK_TRANSLATIONS': {
      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

        const frameName = FRAME_NAMES.metaTranslations;
        const old = figma.currentPage.findOne(n => n.name === frameName) as FrameNode | null;
        if (old) old.remove();

        const frame = figma.createFrame();
        frame.name = frameName;
        frame.x = META_AREA_X;
        frame.y = 5500;
        frame.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
        frame.locked = true;
        frame.cornerRadius = 16;

        const title = figma.createText();
        title.fontName = { family: 'Inter', style: 'Bold' };
        title.characters = 'Translations';
        title.fontSize = 48;
        title.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
        title.x = 40;
        title.y = 30;
        frame.appendChild(title);

        let yPos = 100;
        const m = msg as any;

        for (const page of m.pages) {
          // Page header
          const pageHeader = figma.createText();
          pageHeader.fontName = { family: 'Inter', style: 'Bold' };
          pageHeader.characters = `Page ${page.pageIndex + 1}`;
          pageHeader.fontSize = 28;
          pageHeader.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
          pageHeader.x = 40;
          pageHeader.y = yPos;
          frame.appendChild(pageHeader);
          yPos += 40;

          // Korean/English parallel
          const maxBlocks = Math.max(page.koreanBlocks.length, page.englishBlocks.length);
          for (let bi = 0; bi < maxBlocks; bi++) {
            const ko = page.koreanBlocks[bi]?.join('\n') ?? '';
            const en = page.englishBlocks[bi]?.join('\n') ?? '';

            if (ko) {
              const koText = figma.createText();
              koText.fontName = { family: 'Inter', style: 'Regular' };
              koText.characters = `KO: ${ko}`;
              koText.fontSize = 18;
              koText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
              koText.resize(700, 30);
              koText.textAutoResize = 'HEIGHT';
              koText.x = 40;
              koText.y = yPos;
              frame.appendChild(koText);
              yPos += koText.height + 4;
            }

            if (en) {
              const enText = figma.createText();
              enText.fontName = { family: 'Inter', style: 'Regular' };
              enText.characters = `EN: ${en}`;
              enText.fontSize = 18;
              enText.fills = [{ type: 'SOLID', color: { r: 0.09, g: 0.47, b: 0.95 } }];
              enText.resize(700, 30);
              enText.textAutoResize = 'HEIGHT';
              enText.x = 40;
              enText.y = yPos;
              frame.appendChild(enText);
              yPos += enText.height + 12;
            }
          }

          yPos += 16;
        }

        frame.resize(800, Math.max(200, yPos + 40));

        figma.ui.postMessage({ type: 'BULK_TRANSLATIONS_SAVED', success: true });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save translations',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'CREATE_COVER': {
      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

        const frameName = 'PK-Cover';
        const old = figma.currentPage.findOne(n => n.name === frameName) as FrameNode | null;
        if (old) old.remove();

        // Cover is 2:1 ratio (same as spread)
        const coverW = STORY_PAGE_WIDTH * 2;
        const coverH = STORY_PAGE_HEIGHT;

        const frame = figma.createFrame();
        frame.name = frameName;
        frame.resize(coverW, coverH);
        frame.x = -coverW - 200;
        frame.y = 0;
        frame.fills = [{ type: 'SOLID', color: hexToFigmaColor(msg.keyColorA) }];
        frame.clipsContent = true;

        // Background image
        if (msg.imageBytes && msg.imageBytes.length > 0) {
          const imageBytes = new Uint8Array(msg.imageBytes);
          const image = figma.createImage(imageBytes);
          const bgRect = figma.createRectangle();
          bgRect.name = 'cover-image';
          bgRect.resize(coverW, coverH);
          bgRect.x = 0;
          bgRect.y = 0;
          bgRect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
          frame.appendChild(bgRect);
        }

        // Title overlay area (bottom center)
        const overlayH = Math.round(coverH * 0.35);
        const overlay = figma.createFrame();
        overlay.name = 'title-overlay';
        overlay.resize(coverW, overlayH);
        overlay.x = 0;
        overlay.y = coverH - overlayH;
        overlay.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.35 }];
        frame.appendChild(overlay);

        // Korean title
        if (msg.titleKo) {
          const koTitle = figma.createText();
          koTitle.fontName = { family: 'Inter', style: 'Bold' };
          koTitle.characters = msg.titleKo;
          koTitle.fontSize = Math.round(coverH * 0.08);
          koTitle.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
          koTitle.textAlignHorizontal = 'CENTER';
          koTitle.resize(coverW - 200, 200);
          koTitle.textAutoResize = 'HEIGHT';
          koTitle.x = 100;
          koTitle.y = coverH - overlayH + Math.round(overlayH * 0.2);
          frame.appendChild(koTitle);
        }

        // English title
        if (msg.titleEn) {
          const enTitle = figma.createText();
          enTitle.fontName = { family: 'Inter', style: 'Regular' };
          enTitle.characters = msg.titleEn;
          enTitle.fontSize = Math.round(coverH * 0.04);
          enTitle.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.85 }];
          enTitle.textAlignHorizontal = 'CENTER';
          enTitle.resize(coverW - 200, 100);
          enTitle.textAutoResize = 'HEIGHT';
          enTitle.x = 100;
          enTitle.y = coverH - overlayH + Math.round(overlayH * 0.65);
          frame.appendChild(enTitle);
        }

        figma.viewport.scrollAndZoomIntoView([frame]);

        figma.ui.postMessage({ type: 'COVER_CREATED', success: true });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create cover',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_TO_GALLERY': {
      try {
        const galleryName = FRAME_NAMES.imageGallery;
        let gallery = figma.currentPage.findOne(
          n => n.name === galleryName && n.type === 'FRAME'
        ) as FrameNode | null;

        if (!gallery) {
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

          gallery = figma.createFrame();
          gallery.name = galleryName;
          gallery.x = META_AREA_X - 7000;
          gallery.y = 0;
          gallery.resize(3000, 600);
          gallery.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.98 } }];
          gallery.cornerRadius = 24;

          const title = figma.createText();
          title.fontName = { family: 'Inter', style: 'Bold' };
          title.characters = 'Image Gallery';
          title.fontSize = 64;
          title.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
          title.x = 60;
          title.y = 40;
          gallery.appendChild(title);
        } else {
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
        }

        // Find or create category section
        const categoryNames: Record<string, string> = {
          style: 'Style References',
          character: 'Character Images',
          scene: 'Scene Images',
          cover: 'Cover Images',
        };
        const categoryOrder = ['style', 'character', 'scene', 'cover'];
        const sectionName = `gallery-section-${msg.category}`;
        let section = gallery.findOne(n => n.name === sectionName) as FrameNode | null;

        if (!section) {
          section = figma.createFrame();
          section.name = sectionName;
          section.fills = [];
          section.layoutMode = 'NONE';

          // Position section based on category order
          const sectionIdx = categoryOrder.indexOf(msg.category);
          const sectionY = 140 + sectionIdx * 350;
          section.x = 60;
          section.y = sectionY;
          section.resize(2880, 320);

          // Section title
          const sectionTitle = figma.createText();
          sectionTitle.fontName = { family: 'Inter', style: 'Bold' };
          sectionTitle.characters = categoryNames[msg.category] || msg.category;
          sectionTitle.fontSize = 32;
          sectionTitle.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
          sectionTitle.x = 0;
          sectionTitle.y = 0;
          section.appendChild(sectionTitle);

          gallery.appendChild(section);
        }

        // Check if this image ID already exists
        const existingImg = section.findOne(n => n.name === `img-${msg.imageId}`);
        if (existingImg) {
          // Already saved, skip
          return true;
        }

        // Create image
        const imageBytes = new Uint8Array(msg.imageBytes);
        const image = figma.createImage(imageBytes);

        // Count existing images in section to determine position
        const existingImages = section.findAll(n => n.name.startsWith('img-'));
        const imgIdx = existingImages.length;
        const imgSize = 240;
        const imgGap = 20;
        const imgsPerRow = Math.floor(2880 / (imgSize + imgGap));
        const col = imgIdx % imgsPerRow;
        const row = Math.floor(imgIdx / imgsPerRow);

        const imgRect = figma.createRectangle();
        imgRect.name = `img-${msg.imageId}`;
        imgRect.resize(imgSize, imgSize);
        imgRect.x = col * (imgSize + imgGap);
        imgRect.y = 50 + row * (imgSize + imgGap + 30);
        imgRect.cornerRadius = 12;
        imgRect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
        imgRect.setPluginData('imageId', msg.imageId);
        imgRect.setPluginData('category', msg.category);
        imgRect.setPluginData('label', msg.label);
        if (msg.metadata) imgRect.setPluginData('metadata', msg.metadata);
        section.appendChild(imgRect);

        // Add label
        const labelText = figma.createText();
        labelText.fontName = { family: 'Inter', style: 'Regular' };
        labelText.characters = msg.label.length > 25 ? msg.label.slice(0, 25) + '...' : msg.label;
        labelText.fontSize = 14;
        labelText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
        labelText.x = col * (imgSize + imgGap);
        labelText.y = 50 + row * (imgSize + imgGap + 30) + imgSize + 4;
        labelText.name = `label-${msg.imageId}`;
        section.appendChild(labelText);

        // Resize section and gallery to fit content
        const newSectionH = 50 + (row + 1) * (imgSize + imgGap + 30) + 20;
        if (newSectionH > section.height) section.resize(2880, newSectionH);

        // Resize gallery to fit all sections
        let maxY = 140;
        for (const child of gallery.children) {
          if (child.name.startsWith('gallery-section-')) {
            const bottomEdge = child.y + (child as FrameNode).height;
            if (bottomEdge > maxY) maxY = bottomEdge;
          }
        }
        gallery.resize(3000, Math.max(600, maxY + 60));

        // Save gallery index to pluginData
        const dataNode = getOrCreatePipelineDataNode();
        const galleryDataRaw = dataNode.getPluginData(PLUGIN_DATA_KEYS.imageGalleryData) || '[]';
        const galleryData = JSON.parse(galleryDataRaw) as Array<{ category: string; imageId: string; label: string; imageHash: string; metadata?: string; timestamp?: string }>;
        galleryData.push({
          category: msg.category,
          imageId: msg.imageId,
          label: msg.label,
          imageHash: image.hash,
          metadata: msg.metadata,
          timestamp: new Date().toISOString(),
        });
        dataNode.setPluginData(PLUGIN_DATA_KEYS.imageGalleryData, JSON.stringify(galleryData));

      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save to gallery',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'LOAD_GALLERY': {
      try {
        const dataNode = getOrCreatePipelineDataNode();
        const galleryDataRaw = dataNode.getPluginData(PLUGIN_DATA_KEYS.imageGalleryData) || '[]';
        const galleryData = JSON.parse(galleryDataRaw) as Array<{ category: string; imageId: string; label: string; metadata?: string }>;
        figma.ui.postMessage({
          type: 'GALLERY_LOADED',
          entries: galleryData,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'GALLERY_LOADED',
          entries: [],
        });
      }
      return true;
    }

    case 'DETECT_STEP_STATUS': {
      try {
        const detectedSteps: number[] = [];
        const details: Record<number, string> = {};
        const allNodes = figma.currentPage.children;
        const dataNode = findPipelineDataNode();

        // Step 1: Style Guide
        const styleGuide = allNodes.find(n => n.name === FRAME_NAMES.metaStyleGuide);
        if (styleGuide) {
          detectedSteps.push(1);
          details[1] = '스타일 가이드 프레임 있음';
        }

        // Step 2: Key Colors
        if (dataNode) {
          const colorA = dataNode.getPluginData('pk-key-color-a');
          if (colorA) {
            detectedSteps.push(2);
            details[2] = `키컬러: ${colorA}`;
          }
        }

        // Step 3: Characters
        const charFrame = allNodes.find(n => n.name === FRAME_NAMES.metaCharacters);
        if (charFrame) {
          detectedSteps.push(3);
          try {
            const charData = dataNode?.getPluginData(PLUGIN_DATA_KEYS.characterData);
            const charCount = charData ? JSON.parse(charData).length : 0;
            details[3] = `${charCount}명 등록됨`;
          } catch {
            details[3] = '인물 프레임 있음';
          }
        }

        // Step 4: Character Images
        if (dataNode) {
          try {
            const charImages = dataNode.getPluginData('pk-character-images');
            if (charImages && charImages !== '{}') {
              const imgMap = JSON.parse(charImages);
              const imgCount = Object.keys(imgMap).length;
              if (imgCount > 0) {
                detectedSteps.push(4);
                details[4] = `${imgCount}명 이미지 선택됨`;
              }
            }
          } catch {
            // Corrupted data, skip
          }
        }

        // Step 5: Page Split (Part 1 pages exist)
        const part1Pages = allNodes.filter(n => n.name.startsWith('PK-Part1-Page'));
        if (part1Pages.length > 0) {
          detectedSteps.push(5);
          details[5] = `${part1Pages.length}개 페이지 생성됨`;
        }

        // Step 6: Scene Analysis
        const sceneAnalysis = allNodes.find(n => n.name === 'PK-Meta-SceneAnalysis');
        if (sceneAnalysis) {
          detectedSteps.push(6);
          details[6] = '장면 분석 프레임 있음';
        }

        // Step 7: Scene Images
        const sceneImageFrames = allNodes.filter(n => n.name.startsWith('PK-Meta-Page') && n.name.endsWith('-Images'));
        if (sceneImageFrames.length > 0) {
          detectedSteps.push(7);
          details[7] = `${sceneImageFrames.length}개 페이지 이미지 생성됨`;
        }

        // Step 8-9: Image/Dialogue placement (check if scene-image exists in Part1 pages)
        const pagesWithImages = part1Pages.filter(n => {
          if (n.type !== 'FRAME') return false;
          return (n as FrameNode).findOne(c => c.name === 'scene-image') !== null;
        });
        if (pagesWithImages.length > 0) {
          detectedSteps.push(8);
          details[8] = `${pagesWithImages.length}개 페이지에 이미지 배치됨`;
        }
        const pagesWithDialogue = part1Pages.filter(n => {
          if (n.type !== 'FRAME') return false;
          return (n as FrameNode).findOne(c => c.name.startsWith('dialogue-')) !== null;
        });
        if (pagesWithDialogue.length > 0) {
          detectedSteps.push(9);
          details[9] = `${pagesWithDialogue.length}개 페이지에 대사 배치됨`;
        }

        // Step 10: Part 1 confirm (snapshot exists)
        const snapshots = allNodes.filter(n => n.name.startsWith('PK-Snapshot-Slot'));
        if (snapshots.length > 0) {
          detectedSteps.push(10);
          details[10] = `스냅샷 ${snapshots.length}개`;
        }

        // Step 11: Translations
        const translationFrame = allNodes.find(n => n.name === 'PK-Meta-Translations');
        if (translationFrame) {
          detectedSteps.push(11);
          details[11] = '번역 프레임 있음';
        }

        // Step 12: Part 2 pages
        const part2Pages = allNodes.filter(n => n.name.startsWith('PK-Part2-Page'));
        if (part2Pages.length > 0) {
          detectedSteps.push(12);
          details[12] = `Part 2: ${part2Pages.length}페이지`;
        }

        // Step 14: Part 3 layout
        const part3Pages = allNodes.filter(n => n.name.startsWith('PK-Part3-Page'));
        if (part3Pages.length > 0) {
          detectedSteps.push(14);
          details[14] = `Part 3: ${part3Pages.length}페이지`;
        }

        // Step 18: Cover
        const coverFrame = allNodes.find(n => n.name === 'PK-Cover');
        if (coverFrame) {
          detectedSteps.push(18);
          details[18] = '표지 프레임 있음';
        }

        // Step 19: Inner pages
        const innerPages = allNodes.filter(n => n.name.startsWith('PK-Inner-'));
        if (innerPages.length > 0) {
          detectedSteps.push(19);
          details[19] = `${innerPages.length}개 내지 생성됨`;
        }

        // Step 20: Final output (check for output pages in Figma document)
        const outputPages = figma.root.children.filter(p =>
          p.name.startsWith('PK-Output-') || p.name.includes('Spread') || p.name.includes('Individual')
        );
        if (outputPages.length > 0) {
          detectedSteps.push(20);
          details[20] = '최종 산출물 생성됨';
        }

        // Get snapshot info
        const snapshotInfo: Array<{ slot: number; label: string; timestamp: string; hasState?: boolean }> = [];
        for (let slot = 1; slot <= 2; slot++) {
          const snapFrame = figma.currentPage.findOne(
            n => n.name === FRAME_NAMES.snapshotSlot(slot)
          ) as FrameNode | null;
          if (snapFrame) {
            const hasState = !!snapFrame.getPluginData('pk-snapshot-state');
            snapshotInfo.push({
              slot,
              label: snapFrame.getPluginData(PLUGIN_DATA_KEYS.snapshotLabel) || `Slot ${slot}`,
              timestamp: snapFrame.getPluginData(PLUGIN_DATA_KEYS.snapshotTimestamp) || '',
              hasState,
            });
          }
        }

        figma.ui.postMessage({
          type: 'STEP_STATUS_DETECTED',
          detectedSteps,
          details,
          snapshotInfo,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to detect step status',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'CREATE_INNER_PAGES': {
      try {
        const count = await createInnerPages(
          msg.pages,
          msg.keyColorA,
          msg.keyColorB,
          msg.bookTitle,
          msg.bookTitleEn
        );
        figma.ui.postMessage({
          type: 'INNER_PAGES_CREATED',
          pageCount: count,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create inner pages',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'RESTORE_SNAPSHOT': {
      try {
        const snapFrame = figma.currentPage.findOne(
          n => n.name === FRAME_NAMES.snapshotSlot(msg.slot)
        ) as FrameNode | null;

        if (!snapFrame) {
          throw new Error(`Snapshot slot ${msg.slot} not found`);
        }

        const stateJson = snapFrame.getPluginData('pk-snapshot-state');
        if (!stateJson) {
          throw new Error('Snapshot does not contain saved state');
        }

        const restoredState = JSON.parse(stateJson);
        savePipelineState(restoredState);

        figma.ui.postMessage({
          type: 'SNAPSHOT_RESTORED',
          success: true,
          slot: msg.slot,
        });

        // Send restored state to UI
        figma.ui.postMessage({
          type: 'PIPELINE_STATE_LOADED',
          state: restoredState,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'SNAPSHOT_RESTORED',
          success: false,
          slot: msg.slot,
        });
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to restore snapshot',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    default:
      return false; // Not a pipeline message
  }
}
