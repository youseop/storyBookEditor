/**
 * Scene image handlers — store, select, place images, place dialogue, load page images.
 */

import { hexToFigmaColor } from '../frameBuilder';
import { FRAME_NAMES, PLUGIN_DATA_KEYS } from '../../shared/naming';
import {
  STORY_PAGE_WIDTH,
  STORY_PAGE_HEIGHT,
  META_AREA_X,
  DEFAULT_FONT_FAMILY,
  KEY_COLOR_A,
  KEY_COLOR_B,
} from '../../shared/constants';
import type {
  StoreSceneImageMessage,
  SelectSceneImageMessage,
  SaveImagePlacementMessage,
  PlaceDialogueMessage,
  LoadPageImagesMessage,
} from '../../shared/messageTypes';

/**
 * Store a scene image in a per-page storage frame on canvas.
 */
export async function handleStoreSceneImage(msg: StoreSceneImageMessage): Promise<void> {
  const storageName = FRAME_NAMES.metaPageImages(msg.pageIndex);
  let storageFrame = figma.currentPage.findOne(
    (n) => n.name === storageName && n.type === 'FRAME'
  ) as FrameNode | null;

  if (!storageFrame) {
    storageFrame = figma.createFrame();
    storageFrame.name = storageName;
    storageFrame.resize(1000, 250);
    storageFrame.x = META_AREA_X + 2700;
    storageFrame.y = 2500 + msg.pageIndex * 400;
    storageFrame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
    storageFrame.setPluginData(PLUGIN_DATA_KEYS.nodeType, 'meta-page-images');
    storageFrame.setPluginData(PLUGIN_DATA_KEYS.pageIndex, String(msg.pageIndex));
  }

  const imageBytes = new Uint8Array(msg.imageBytes);
  const image = figma.createImage(imageBytes);
  const imageHash = image.hash;

  const imgSize = 200;
  // Count existing image rects to calculate position (DON'T remove existing)
  const existingImgs = storageFrame.children.filter(
    (n) => n.type === 'RECTANGLE' && n.name.startsWith('scene-img-')
  );
  const slotIndex = existingImgs.length;

  const rect = figma.createRectangle();
  rect.name = `scene-img-${msg.pageIndex}-${msg.imageId || msg.variant}`;
  rect.resize(imgSize, imgSize);
  rect.x = slotIndex * (imgSize + 20) + 20;
  rect.y = 30;
  rect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash }];
  rect.setPluginData('pageIndex', String(msg.pageIndex));
  rect.setPluginData('variant', String(msg.variant));
  rect.setPluginData('backgroundType', msg.backgroundType);
  rect.setPluginData('imageHash', imageHash);
  if (msg.imageId) rect.setPluginData('imageId', msg.imageId);

  storageFrame.appendChild(rect);

  // Expand frame width if needed
  const neededWidth = (slotIndex + 1) * (imgSize + 20) + 20;
  if (storageFrame.width < neededWidth) {
    storageFrame.resize(neededWidth, storageFrame.height);
  }

  // Add label
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  const label = figma.createText();
  label.fontName = { family: 'Inter', style: 'Regular' };
  label.characters = `${msg.backgroundType === 'white' ? 'W' : 'F'}${slotIndex + 1}`;
  label.fontSize = 12;
  label.x = rect.x;
  label.y = rect.y - 16;
  label.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
  label.name = `label-${msg.imageId || msg.variant}`;
  storageFrame.appendChild(label);

  figma.ui.postMessage({
    type: 'SCENE_IMAGE_STORED',
    pageIndex: msg.pageIndex,
    variant: msg.variant,
    imageHash,
    imageId: msg.imageId,
  });
}

/**
 * Select a scene image variant and place it as the background of a Part 1 page.
 */
export async function handleSelectSceneImage(msg: SelectSceneImageMessage): Promise<void> {
  const storageName = FRAME_NAMES.metaPageImages(msg.pageIndex);
  const storageFrame = figma.currentPage.findOne(
    (n) => n.name === storageName && n.type === 'FRAME'
  ) as FrameNode | null;

  if (!storageFrame) {
    throw new Error(`No images stored for page ${msg.pageIndex + 1}`);
  }

  // Prefer imageId lookup, fall back to variant name
  let variantRect: RectangleNode | null = null;
  if (msg.imageId) {
    variantRect = storageFrame.findOne(
      (n) => n.type === 'RECTANGLE' && n.getPluginData('imageId') === msg.imageId
    ) as RectangleNode | null;
  }
  if (!variantRect) {
    variantRect = storageFrame.findOne(
      (n) => n.name === `scene-img-${msg.pageIndex}-${msg.variant}` && n.type === 'RECTANGLE'
    ) as RectangleNode | null;
  }

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
}

/**
 * Save image placement data for multiple pages.
 */
export function handleSaveImagePlacement(msg: SaveImagePlacementMessage): void {
  for (const pageIndex of msg.pageIndices) {
    const pageName = FRAME_NAMES.part1Page(pageIndex);
    const pageFrame = figma.currentPage.findOne(
      (n) => n.name === pageName && n.type === 'FRAME'
    ) as FrameNode | null;

    if (!pageFrame) continue;

    const sceneImg = pageFrame.findOne(
      (n) => n.name === 'scene-image' && n.type === 'RECTANGLE'
    ) as RectangleNode | null;

    if (sceneImg) {
      pageFrame.setPluginData('imagePlacement', JSON.stringify({
        pageIndex,
        x: sceneImg.x,
        y: sceneImg.y,
        width: sceneImg.width,
        height: sceneImg.height,
      }));
    }
  }

  figma.ui.postMessage({
    type: 'IMAGE_PLACEMENT_SAVED',
    success: true,
  });
}

/**
 * Place dialogue text blocks on a Part 1 page with the selected template style.
 */
export async function handlePlaceDialogue(msg: PlaceDialogueMessage): Promise<void> {
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
    return;
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
      const borderColor = hexToFigmaColor(template === 'border-a' ? KEY_COLOR_A : KEY_COLOR_B);
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
}

/**
 * Load all stored page images (thumbnails) and send them to the UI.
 */
export async function handleLoadPageImages(_msg: LoadPageImagesMessage): Promise<void> {
  const pageImageFrames = figma.currentPage.children.filter(
    (n) => n.name.startsWith('PK-Meta-Page') && n.name.endsWith('-Images') && n.type === 'FRAME'
  ) as FrameNode[];

  const result: Array<{
    pageIndex: number;
    images: Array<{ variant: number; backgroundType: string; imageBytes: number[]; imageHash: string }>;
    selectedVariant?: number;
  }> = [];

  for (const frame of pageImageFrames) {
    const pageIdx = parseInt(frame.getPluginData(PLUGIN_DATA_KEYS.pageIndex) || '-1');
    if (pageIdx < 0) continue;

    const imageRects = frame.findAll(
      (n) => n.name.startsWith('scene-img-') && n.type === 'RECTANGLE'
    ) as RectangleNode[];

    const images: Array<{ variant: number; backgroundType: string; imageBytes: number[]; imageHash: string }> = [];

    for (const rect of imageRects) {
      const variant = parseInt(rect.getPluginData('variant') || '0');
      const backgroundType = rect.getPluginData('backgroundType') || 'white';
      const imageHash = rect.getPluginData('imageHash') || '';
      if (!imageHash) continue;

      try {
        // Export as small thumbnail PNG
        const exportBytes = await rect.exportAsync({
          format: 'PNG',
          constraint: { type: 'SCALE', value: 0.5 },
        });
        images.push({
          variant,
          backgroundType,
          imageBytes: Array.from(exportBytes),
          imageHash,
        });
      } catch {
        // Skip images that can't be exported
      }
    }

    images.sort((a, b) => a.variant - b.variant);

    // Check if a variant was previously selected on the page frame
    const pageName = FRAME_NAMES.part1Page(pageIdx);
    const pageFrame = figma.currentPage.findOne(
      (n) => n.name === pageName && n.type === 'FRAME'
    ) as FrameNode | null;
    const selectedStr = pageFrame?.getPluginData('selectedVariant');
    const selectedVariant = selectedStr ? parseInt(selectedStr) : undefined;

    if (images.length > 0) {
      result.push({ pageIndex: pageIdx, images, selectedVariant });
    }
  }

  figma.ui.postMessage({ type: 'PAGE_IMAGES_LOADED', pages: result });
}
