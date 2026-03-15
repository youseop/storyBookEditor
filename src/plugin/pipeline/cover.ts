/**
 * Cover creation handler — generates a 2:1 cover frame with image, title overlay.
 */

import { hexToFigmaColor } from '../frameBuilder';
import {
  STORY_PAGE_WIDTH,
  STORY_PAGE_HEIGHT,
} from '../../shared/constants';
import type { CreateCoverMessage } from '../../shared/messageTypes';

/**
 * Create a cover frame with background image and title overlay.
 */
export async function handleCreateCover(msg: CreateCoverMessage): Promise<void> {
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
}
