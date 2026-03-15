/**
 * Canvas layout helpers — page positioning, part boundaries, navigation, image detection.
 */

import {
  STORY_PAGE_WIDTH,
  STORY_PAGE_HEIGHT,
  PAGES_PER_ROW,
  PAGE_GAP_H,
  PAGE_GAP_V,
} from '../../shared/constants';
import { PLUGIN_DATA_KEYS } from '../../shared/naming';

export interface StoryPageInput {
  textBlocks: string[][];
  isEmpty: boolean;
}

/**
 * Calculate the position of a page frame on the canvas.
 * Pages are laid out 2 per row, left-to-right, top-to-bottom.
 */
export function getPagePosition(pageIndex: number): { x: number; y: number } {
  const col = pageIndex % PAGES_PER_ROW;
  const row = Math.floor(pageIndex / PAGES_PER_ROW);
  const x = col * (STORY_PAGE_WIDTH + PAGE_GAP_H);
  const y = row * (STORY_PAGE_HEIGHT + PAGE_GAP_V);
  return { x, y };
}

/**
 * Find the bottom Y position of all frames matching a given part prefix.
 */
export function getPartBottomY(partPrefix: string): number {
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
 * Find the right-most X + width of all frames matching a given part prefix.
 */
export function getPartRightX(partPrefix: string): number {
  let maxRight = 0;
  figma.currentPage.children.forEach((n) => {
    if (n.name.startsWith(partPrefix) && n.type === 'FRAME') {
      const right = n.x + (n as FrameNode).width;
      if (right > maxRight) maxRight = right;
    }
  });
  return maxRight;
}

/**
 * Scroll the Figma viewport to a named frame. Falls back to pluginData nodeType lookup.
 */
export function navigateToFrame(frameName: string): boolean {
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

/**
 * Check if a frame has a full-bleed image (an image fill covering the entire page).
 */
export function hasFullBleedImage(frame: FrameNode): boolean {
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
