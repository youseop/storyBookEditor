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

  // Add label text
  const labelText = figma.createText();
  labelText.fontName = { family: 'Inter', style: 'Regular' };
  labelText.characters = `Snapshot: ${label} (${timestamp.slice(0, 16).replace('T', ' ')})`;
  labelText.fontSize = 48;
  labelText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
  labelText.x = 50;
  labelText.y = 50;
  snapshotFrame.appendChild(labelText);

  // Clone all Part frames into snapshot
  const partFrames = figma.currentPage.children.filter(
    (n) =>
      n.name.startsWith('PK-Part') &&
      n.type === 'FRAME' &&
      !n.name.startsWith('PK-Snapshot')
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
        const dataNode = getOrCreatePipelineDataNode();
        dataNode.setPluginData('pk-style-description', msg.description);
        if (msg.imageBytes && msg.imageBytes.length > 0) {
          // Store image reference in pipeline data (actual image stored in Figma)
          const image = figma.createImage(new Uint8Array(msg.imageBytes));
          dataNode.setPluginData('pk-style-image-hash', image.hash);
        }
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

    case 'SAVE_CHARACTERS': {
      try {
        const dataNode = getOrCreatePipelineDataNode();
        dataNode.setPluginData(PLUGIN_DATA_KEYS.characterData, JSON.stringify(msg.characters));
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save characters',
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

    case 'STORE_SCENE_IMAGE':
    case 'SELECT_SCENE_IMAGE': {
      // Image storage/selection - will be fully implemented with Gemini Image API
      console.log(`Pipeline message received but not yet implemented: ${msg.type}`);
      return true;
    }

    case 'APPLY_KEY_EXPRESSIONS': {
      // Key expressions application - will be fully implemented
      console.log(`Pipeline message received but not yet implemented: ${msg.type}`);
      return true;
    }

    default:
      return false; // Not a pipeline message
  }
}
