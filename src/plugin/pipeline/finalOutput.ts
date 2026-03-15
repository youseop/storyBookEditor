/**
 * Final output generation — page numbers and spread/individual output pages.
 */

import { hasFullBleedImage } from './canvasHelpers';
import {
  STORY_PAGE_WIDTH,
  STORY_PAGE_HEIGHT,
  PAGE_GAP_V,
  PAGE_NUMBER_FONT_SIZE,
  PAGE_NUMBER_MARGIN,
} from '../../shared/constants';

/**
 * Insert page numbers on all Part frames.
 * Left pages (even index): "[number] brandText" at bottom-left
 * Right pages (odd index): "brandText [number]" at bottom-right
 */
export async function insertPageNumbers(brandText: string): Promise<number> {
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

/**
 * Generate final output pages: spread (2:1 paired) or individual or both.
 */
export async function generateFinalOutput(
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
