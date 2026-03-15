/**
 * Meta frame handlers — style guide, story text, characters, key colors,
 * scene analysis, and bulk translations saved to canvas frames.
 */

import { hexToFigmaColor } from '../frameBuilder';
import { FRAME_NAMES, PLUGIN_DATA_KEYS } from '../../shared/naming';
import {
  META_AREA_X,
  META_AREA_Y,
} from '../../shared/constants';
import { getOrCreatePipelineDataNode } from './statePersistence';
import type {
  SaveStyleGuideMessage,
  SaveStoryTextMessage,
  SaveCharactersMessage,
  SaveCharacterImageMessage,
  SaveKeyColorsMessage,
  SaveSceneAnalysisMessage,
  SaveBulkTranslationsMessage,
} from '../../shared/messageTypes';

/**
 * Save style guide description and optional reference image to a canvas frame.
 */
export async function handleSaveStyleGuide(msg: SaveStyleGuideMessage): Promise<void> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  const dataNode = getOrCreatePipelineDataNode();
  if (msg.description) dataNode.setPluginData(PLUGIN_DATA_KEYS.styleDescription, msg.description);

  let imageHash: string | undefined;
  if (msg.imageBytes && msg.imageBytes.length > 0) {
    const image = figma.createImage(new Uint8Array(msg.imageBytes));
    imageHash = image.hash;
    dataNode.setPluginData(PLUGIN_DATA_KEYS.styleImageHash, imageHash);
  } else {
    imageHash = dataNode.getPluginData(PLUGIN_DATA_KEYS.styleImageHash) || undefined;
  }

  // Create/update visible frame on canvas
  const frameName = FRAME_NAMES.metaStyleGuide;
  const old = figma.currentPage.findOne(n => n.name === frameName) as FrameNode | null;
  if (old) old.remove();

  const frame = figma.createFrame();
  frame.name = frameName;
  frame.x = META_AREA_X + 2700;
  frame.y = META_AREA_Y + 100;
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
}

/**
 * Save story text (title + body) to a visible meta frame on canvas.
 */
export async function handleSaveStoryText(msg: SaveStoryTextMessage): Promise<void> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  const frameName = FRAME_NAMES.metaStoryText;
  const old = figma.currentPage.findOne(n => n.name === frameName) as FrameNode | null;
  if (old) old.remove();

  const frame = figma.createFrame();
  frame.name = frameName;
  frame.x = META_AREA_X;
  frame.y = META_AREA_Y + 100;
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
}

/**
 * Save character list data and create visible character cards on canvas.
 */
export async function handleSaveCharacters(msg: SaveCharactersMessage): Promise<void> {
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
  frame.y = 1300;
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
}

/**
 * Save a character image to the Characters meta frame and persist the hash.
 */
export async function handleSaveCharacterImage(msg: SaveCharacterImageMessage): Promise<void> {
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
  const existingData = dataNode.getPluginData(PLUGIN_DATA_KEYS.characterImages) || '{}';
  const charImageMap = JSON.parse(existingData) as Record<string, string>;
  charImageMap[msg.characterId] = imageHash;
  dataNode.setPluginData(PLUGIN_DATA_KEYS.characterImages, JSON.stringify(charImageMap));

  // Find or create characters frame
  let targetFrame = charFrame;
  if (!targetFrame) {
    targetFrame = figma.createFrame();
    targetFrame.name = charFrameName;
    targetFrame.x = META_AREA_X + 2700;
    targetFrame.y = 1300;
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
}

/**
 * Save key colors A and B to the pipeline data node.
 */
export function handleSaveKeyColors(msg: SaveKeyColorsMessage): void {
  const dataNode = getOrCreatePipelineDataNode();
  dataNode.setPluginData(PLUGIN_DATA_KEYS.keyColorA, msg.colorA);
  dataNode.setPluginData(PLUGIN_DATA_KEYS.keyColorB, msg.colorB);
}

/**
 * Save scene analysis results to a visible meta frame on canvas.
 */
export async function handleSaveSceneAnalysis(msg: SaveSceneAnalysisMessage): Promise<void> {
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

  for (const page of msg.pages) {
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
      .map((ch) => `${msg.characterNames[ch.characterId] || ch.characterId}: ${ch.action}`)
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
}

/**
 * Save bulk translations to a visible meta frame showing KO/EN parallel text.
 */
export async function handleSaveBulkTranslations(msg: SaveBulkTranslationsMessage): Promise<void> {
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

  for (const page of msg.pages) {
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
}
