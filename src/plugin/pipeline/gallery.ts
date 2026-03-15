/**
 * Image gallery handlers — save images to and load from the centralized PK-Image-Gallery frame.
 */

import { FRAME_NAMES, PLUGIN_DATA_KEYS } from '../../shared/naming';
import { META_AREA_X } from '../../shared/constants';
import { getOrCreatePipelineDataNode } from './statePersistence';

/**
 * Save an image to the gallery under a specific category with dedup by imageId.
 */
export async function handleSaveToGallery(msg: any): Promise<boolean> {
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

  return false;
}

/**
 * Load gallery data from the pipeline data node and send to UI.
 */
export async function handleLoadGallery(msg: any): Promise<void> {
  const dataNode = getOrCreatePipelineDataNode();
  const galleryDataRaw = dataNode.getPluginData(PLUGIN_DATA_KEYS.imageGalleryData) || '[]';
  const galleryData = JSON.parse(galleryDataRaw) as Array<{ category: string; imageId: string; label: string; metadata?: string }>;
  figma.ui.postMessage({
    type: 'GALLERY_LOADED',
    entries: galleryData,
  });
}
